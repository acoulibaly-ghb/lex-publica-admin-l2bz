
import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { decodeAudioData, createPcmBlob, downsampleBuffer } from '../services/audioUtils';

interface UseLiveSessionProps {
  apiKey: string;
  systemInstruction: string;
}

export const useLiveSession = ({ apiKey, systemInstruction }: UseLiveSessionProps) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Audio Contexts and Nodes
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Scheduling
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const aiClientRef = useRef<GoogleGenAI | null>(null);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    if (status === 'connected' || status === 'connecting') return;
    setStatus('connecting');

    try {
      if (!aiClientRef.current) {
        aiClientRef.current = new GoogleGenAI({ apiKey });
      }

      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      // 1. INPUT CONTEXT: Try to force 16kHz to match Gemini requirements natively
      // This reduces CPU load and resampling errors on mobile
      try {
        inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      } catch (e) {
        console.warn("Could not force 16000Hz sample rate, falling back to native rate", e);
        inputAudioContextRef.current = new AudioContextClass();
      }

      // 2. OUTPUT CONTEXT: Use native rate for playback (smoother audio)
      outputAudioContextRef.current = new AudioContextClass();

      // CRITICAL FOR IOS: Resume context immediately after user gesture
      if (inputAudioContextRef.current.state === 'suspended') {
        await inputAudioContextRef.current.resume();
      }
      if (outputAudioContextRef.current.state === 'suspended') {
        await outputAudioContextRef.current.resume();
      }
      
      outputNodeRef.current = outputAudioContextRef.current.createGain();
      outputNodeRef.current.connect(outputAudioContextRef.current.destination);

      // Get User Media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000, // Hint to browser we want 16k
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;

      // Start Session with the model suggested by user intuition (often more stable for Live API)
      const sessionPromise = aiClientRef.current.live.connect({
        model: 'gemini-2.0-flash-exp', 
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }, 
          },
        },
        callbacks: {
          onopen: () => {
            console.log('Session opened');
            setStatus('connected');
            setupAudioInput(stream);
          },
          onmessage: (message: LiveServerMessage) => {
            handleServerMessage(message);
          },
          onclose: () => {
            console.log('Session closed');
            setStatus('disconnected');
          },
          onerror: (e) => {
            console.error('Session error', e);
            setStatus('error');
          }
        }
      });
      
      sessionPromiseRef.current = sessionPromise;

    } catch (error) {
      console.error('Failed to connect:', error);
      setStatus('error');
    }
  };

  const setupAudioInput = (stream: MediaStream) => {
    if (!inputAudioContextRef.current) return;

    const ctx = inputAudioContextRef.current;
    const source = ctx.createMediaStreamSource(stream);
    // Use a larger buffer size for mobile stability
    const processor = ctx.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      if (isMuted) return; // Don't send data if muted

      let inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for visualizer using raw data
      let sum = 0;
      for(let i=0; i<inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      setVolumeLevel(Math.min(1, rms * 5)); 

      // DOWNSAMPLING logic:
      // Only downsample if the context wasn't able to set 16kHz natively
      if (ctx.sampleRate !== 16000) {
        inputData = downsampleBuffer(inputData, ctx.sampleRate, 16000);
      }
      
      // createPcmBlob uses App A's robust encoding
      const pcmBlob = createPcmBlob(inputData);

      if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination);

    inputSourceRef.current = source;
    processorRef.current = processor;
  };

  const handleServerMessage = async (message: LiveServerMessage) => {
    const serverContent = message.serverContent;

    if (serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
        const base64Audio = serverContent.modelTurn.parts[0].inlineData.data;
        if (outputAudioContextRef.current && outputNodeRef.current) {
            const ctx = outputAudioContextRef.current;
            
            // USE APP A LOGIC:
            // Pass the base64 string directly. 
            // The utility handles DataView parsing (Little Endian) and buffer creation at 24kHz.
            const audioBuffer = await decodeAudioData(base64Audio, ctx);
            
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputNodeRef.current);
            
            // Schedule playback
            const currentTime = ctx.currentTime;
            // Ensure we don't schedule in the past
            if (nextStartTimeRef.current < currentTime) {
                nextStartTimeRef.current = currentTime;
            }
            
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;

            audioSourcesRef.current.add(source);
            source.onended = () => {
                audioSourcesRef.current.delete(source);
            };
        }
    }

    if (serverContent?.interrupted) {
        // Clear queue
        audioSourcesRef.current.forEach(source => {
            try { source.stop(); } catch(e) {}
        });
        audioSourcesRef.current.clear();
        nextStartTimeRef.current = 0;
        
        // Also reset schedule time to current time to avoid large delays after interruption
        if (outputAudioContextRef.current) {
            nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
        }
    }
  };

  const disconnect = () => {
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    if (inputSourceRef.current) {
        inputSourceRef.current.disconnect();
        inputSourceRef.current = null;
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }

    setStatus('disconnected');
    setVolumeLevel(0);
    // Reset scheduling
    nextStartTimeRef.current = 0;
  };

  const toggleMute = () => {
    setIsMuted(prev => !prev);
  };

  return {
    status,
    connect,
    disconnect,
    isMuted,
    toggleMute,
    volumeLevel
  };
};
