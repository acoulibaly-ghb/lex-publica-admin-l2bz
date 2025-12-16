import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage } from '@google/genai';
import { downsampleBuffer, arrayBufferToBase64 } from '../services/audioUtils';

interface UseLiveSessionProps {
  apiKey: string;
  systemInstruction: string;
}

// Conversion PCM 16-bit Little Endian
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

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const aiClientRef = useRef<GoogleGenAI | null>(null);
  const currentSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- LOGIQUE DE RÉCEPTION ---
  const processServerMessage = (message: LiveServerMessage) => {
    const serverContent = message.serverContent;

    // 1. Réception audio
    if (serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
        console.log("📥 [REÇU] Paquet audio reçu du serveur Google !");
        const base64Audio = serverContent.modelTurn.parts[0].inlineData.data;
        playAudioChunk(base64Audio);
    }

    // 2. Gestion de l'interruption
    if (serverContent?.interrupted) {
        console.log("⏸️ [INTERRUPTION] L'IA s'arrête de parler.");
        if(outputAudioContextRef.current) {
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

      // FORCER LE RÉVEIL DES CONTEXTES AUDIO (Crucial pour Chrome/Safari)
      if (inputAudioContextRef.current.state === 'suspended') {
          await inputAudioContextRef.current.resume();
          console.log("🎤 Input Audio Context Resumed");
      }
      if (outputAudioContextRef.current.state === 'suspended') {
          await outputAudioContextRef.current.resume();
          console.log("🔊 Output Audio Context Resumed");
      }

      const session = await aiClientRef.current.live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          responseModalities: "AUDIO" as any, 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: { parts: [{ text: systemInstruction }] },
        },
        callbacks: {
            onopen: () => {
                console.log("✅ [CONNEXION] Session ouverte avec succès.");
                setStatus('connected');
                
                // Ping de réveil après 1 seconde
                setTimeout(() => {
                    if(currentSessionRef.current) {
                        console.log("📨 [ENVOI] Envoi du message de réveil 'Bonjour'...");
                        currentSessionRef.current.send({
                            parts: [{ text: "Bonjour ! Présente-toi brièvement." }],
                            endOfTurn: true
                        });
                    }
                }, 1000);
            },
            onclose: () => {
                console.log("❌ [CONNEXION] Session fermée.");
                setStatus('disconnected');
            },
            onmessage: (msg: LiveServerMessage) => {
                processServerMessage(msg);
            },
            onerror: (e) => {
                console.error("⚠️ [ERREUR] Session error:", e);
                setStatus('error');
            }
        }
      });

      currentSessionRef.current = session;
      await startAudioInput();

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

        // Visualizer (Preuve que le micro marche)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        const vol = Math.min(1, Math.sqrt(sum / inputData.length) * 5);
        setVolumeLevel(vol);
        
        // Log périodique pour vérifier que le micro envoie bien (toutes les ~2 secondes)
        if (Math.random() < 0.05 && vol > 0.01) {
            console.log("🎤 [MICRO] Envoi de données audio vers Google...");
        }

        // Downsample & Send
        let dataToProcess: Float32Array = inputData;
        if (ctx.sampleRate !== 16000) {
           dataToProcess = downsampleBuffer(inputData, ctx.sampleRate, 16000) as any;
        }

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
            // Silence
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
      
      // Vérification de l'état du contexte audio
      if (ctx.state === 'suspended') {
          console.warn("⚠️ [AUDIO OUT] Le contexte audio est suspendu ! Tentative de reprise...");
          await ctx.resume();
      }

      try {
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
          
          console.log(`🔊 [AUDIO OUT] Lecture d'un chunk de ${audioBuffer.duration.toFixed(2)}s`);

      } catch (err) {
          console.error("❌ [AUDIO OUT] Erreur lors du décodage/lecture :", err);
      }
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
