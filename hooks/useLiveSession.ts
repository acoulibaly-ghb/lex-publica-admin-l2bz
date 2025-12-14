import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage } from '@google/genai';
import { downsampleBuffer, floatTo16BitPCM, arrayBufferToBase64 } from '../services/audioUtils';

interface UseLiveSessionProps {
  apiKey: string;
  systemInstruction: string;
}

export const useLiveSession = ({ apiKey, systemInstruction }: UseLiveSessionProps) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Processing
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Gemini Client
  const aiClientRef = useRef<GoogleGenAI | null>(null);
  const currentSessionRef = useRef<any>(null);

  // Queue audio
  const nextStartTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<AudioBuffer[]>([]);

  useEffect(() => {
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    if (status === 'connected' || status === 'connecting') return;
    setStatus('connecting');

    try {
      if (!aiClientRef.current) {
        aiClientRef.current = new GoogleGenAI({ apiKey });
      }

      // Initialisation Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass();
      outputAudioContextRef.current = new AudioContextClass();

      // Resume context (fix iOS/Mac)
      if (inputAudioContextRef.current.state === 'suspended') await inputAudioContextRef.current.resume();
      if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();

      // Configuration du modèle
      const config = {
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          responseModalities: "AUDIO" as any, 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
        systemInstruction: { parts: [{ text: systemInstruction }] },
      };

      // CORRECTION 1 : Ajout de l'objet 'callbacks' requis par TypeScript
      const session = await aiClientRef.current.live.connect({
        model: config.model,
        config: config,
        callbacks: {
            onopen: () => console.log("Session opened via callback"),
            onclose: () => console.log("Session closed via callback"),
            onmessage: () => {}, // On gère les messages via le stream ci-dessous
            onerror: (e) => console.error("Session error", e)
        }
      });

      currentSessionRef.current = session;
      setStatus('connected');
      console.log('Gemini Live Session Connected');

      // Démarrage du micro
      await startAudioInput();

      // Écoute des messages
      listenToIncomingMessages(session);

    } catch (error) {
      console.error('Connection failed:', error);
      setStatus('error');
      disconnect();
    }
  };

  const listenToIncomingMessages = async (session: any) => {
    try {
        for await (const msg of session.receive()) {
            handleServerMessage(msg);
        }
    } catch (err) {
        console.log("Stream ended or error", err);
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
        if (isMuted || !currentSessionRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Visualizer
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolumeLevel(Math.min(1, Math.sqrt(sum / inputData.length) * 5));

        // Downsample si nécessaire
        let dataToProcess = inputData;
        if (ctx.sampleRate !== 16000) {
           // CORRECTION 2 : "as Float32Array" force le type pour éviter l'erreur SharedArrayBuffer
           dataToProcess = downsampleBuffer(inputData, ctx.sampleRate, 16000) as Float32Array;
        }

        // Conversion & Envoi
        const pcm16 = floatTo16BitPCM(dataToProcess);
        const base64Data = arrayBufferToBase64(pcm16);

        currentSessionRef.current.send({
            parts: [{
                inlineData: {
                    mimeType: "audio/pcm;rate=16000",
                    data: base64Data
                }
            }]
        });
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

  const handleServerMessage = async (message: LiveServerMessage) => {
    const serverContent = message.serverContent;

    if (serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
        const base64Audio = serverContent.modelTurn.parts[0].inlineData.data;
        playAudioChunk(base64Audio);
    }

    if (serverContent?.interrupted) {
        console.log("Interruption !");
        audioQueueRef.current = [];
        if(outputAudioContextRef.current) {
            outputAudioContextRef.current.suspend().then(() => outputAudioContextRef.current?.resume());
            nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
        }
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
