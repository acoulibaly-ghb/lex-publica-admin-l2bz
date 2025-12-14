import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage } from '@google/genai';
import { downsampleBuffer, arrayBufferToBase64 } from '../services/audioUtils';

interface UseLiveSessionProps {
  apiKey: string;
  systemInstruction: string;
}

// Helper: Conversion PCM 16-bit Little Endian
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    output.setInt16(i * 2, val, true);
  }
  return output.buffer;
}

export const useLiveSession = ({ apiKey, systemInstruction }: UseLiveSessionProps) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Audio Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // AI Refs
  const aiClientRef = useRef<GoogleGenAI | null>(null);
  const currentSessionRef = useRef<any>(null);
  
  // Playback Refs
  const nextStartTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<AudioBuffer[]>([]);

  useEffect(() => {
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- LOGIQUE DE RÉCEPTION (Déplacée ici pour être accessible au callback) ---
  const processServerMessage = (message: LiveServerMessage) => {
    const serverContent = message.serverContent;

    // 1. Réception audio
    if (serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
        const base64Audio = serverContent.modelTurn.parts[0].inlineData.data;
        playAudioChunk(base64Audio);
    }

    // 2. Gestion de l'interruption
    if (serverContent?.interrupted) {
        console.log("Interruption par l'IA");
        audioQueueRef.current = []; // Vider la queue locale si on en avait une
        if(outputAudioContextRef.current) {
            // "Reset" rapide du contexte audio pour couper la parole
            outputAudioContextRef.current.suspend().then(() => outputAudioContextRef.current?.resume());
            nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
        }
    }
  };

  const connect = async () => {
    if (status === 'connected' || status === 'connecting') return;
    setStatus('connecting');

    try {
      if (!aiClientRef.current) {
        aiClientRef.current = new GoogleGenAI({ apiKey });
      }

      // Init Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass();
      outputAudioContextRef.current = new AudioContextClass();

      if (inputAudioContextRef.current.state === 'suspended') await inputAudioContextRef.current.resume();
      if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();

      // CONNEXION AVEC CALLBACKS (Architecture Événementielle)
      const session = await aiClientRef.current.live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          generationConfig: {
            responseModalities: "AUDIO" as any,
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
          },
          systemInstruction: { parts: [{ text: systemInstruction }] },
        },
        callbacks: {
            onopen: () => {
                console.log("✅ Session opened (Callback)");
                setStatus('connected');
            },
            onclose: () => {
                console.log("❌ Session closed (Callback)");
                setStatus('disconnected');
            },
            // C'EST ICI QUE TOUT SE JOUE : On reçoit le message directement
            onmessage: (msg: LiveServerMessage) => {
                processServerMessage(msg);
            },
            onerror: (e) => {
                console.error("⚠️ Session error", e);
                setStatus('error');
            }
        }
      });

      currentSessionRef.current = session;
      // Note: setStatus('connected') est aussi géré dans onopen, mais on le garde ici par sécurité
      console.log('Gemini Live Session Object Created');

      // Démarrage micro
      await startAudioInput();

      // IMPORTANT : On a SUPPRIMÉ l'appel à listenToIncomingMessages()
      // Plus de boucle "for await", plus de crash "not async iterable".

    } catch (error) {
      console.error('Connection failed:', error);
      setStatus('error');
      disconnect();
    }
  };

  const startAudioInput = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });
      streamRef.current = stream;

      const ctx = inputAudioContextRef.current!;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (isMuted) return;
        if (!currentSessionRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Visualizer simple
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolumeLevel(Math.min(1, Math.sqrt(sum / inputData.length) * 5));

        // Downsample
        let dataToProcess: Float32Array = inputData;
        if (ctx.sampleRate !== 16000) {
           dataToProcess = downsampleBuffer(inputData, ctx.sampleRate, 16000) as any;
        }

        // Conversion & Envoi
        const pcm16 = floatTo16BitPCM(dataToProcess);
        const base64Data = arrayBufferToBase64(pcm16);

        try {
            currentSessionRef.current.send({
                parts: [{
                    inlineData: {
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Data
                    }
                }],
                endOfTurn: false
            });
        } catch (error) {
            // Silence en cas d'erreur d'envoi ponctuelle
        }
      };

      const muteNode = ctx.createGain();
      muteNode.gain.value = 0;
      source.connect(processor);
      processor.connect(muteNode);
      muteNode.connect(ctx.destination);

      inputSourceRef.current = source;
      processorRef.current = processor;

    } catch (e) {
      console.error("Microphone error:", e);
    }
  };

  const playAudioChunk = async (base64Audio: string) => {
      if (!outputAudioContextRef.current) return;
      const ctx = outputAudioContextRef.current;
      
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
      
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for(let i=0; i<pcm16.length; i++) float32[i] = pcm16[i] / 32768;

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000); 
      audioBuffer.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      const currentTime = ctx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
          nextStartTimeRef.current = currentTime + 0.05;
      }
      
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
  };

  const disconnect = () => {
    currentSessionRef.current = null;
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (inputSourceRef.current) { inputSourceRef.current.disconnect(); inputSourceRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (inputAudioContextRef.current) { inputAudioContextRef.current.close(); inputAudioContextRef.current = null; }
    if (outputAudioContextRef.current) { outputAudioContextRef.current.close(); outputAudioContextRef.current = null; }
    setStatus('disconnected');
    setVolumeLevel(0);
  };

  const toggleMute = () => setIsMuted(p => !p);

  return { status, connect, disconnect, isMuted, toggleMute, volumeLevel };
};
