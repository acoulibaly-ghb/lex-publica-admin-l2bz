// @ts-nocheck
"use client";

import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';

// --- FONCTIONS UTILITAIRES INTÉGRÉES (Blindées) ---

// 1. Conversion Float32 vers PCM 16-bit
function floatTo16BitPCM(input) {
  const output = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    output.setInt16(i * 2, val, true);
  }
  return output.buffer;
}

// 2. Conversion Base64 (Compatible universel)
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// 3. Downsampling
function downsampleBuffer(buffer, sampleRate, outSampleRate) {
  if (outSampleRate === sampleRate) {
    return buffer;
  }
  if (outSampleRate > sampleRate) {
    return buffer; // Fallback sécu
  }
  const sampleRateRatio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

// --- HOOK PRINCIPAL ---

export const useLiveSession = ({ apiKey, systemInstruction }) => {
  const [status, setStatus] = useState('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Refs
  const inputAudioContextRef = useRef(null);
  const outputAudioContextRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const inputSourceRef = useRef(null);
  const aiClientRef = useRef(null);
  const currentSessionRef = useRef(null);
  const nextStartTimeRef = useRef(0);

  useEffect(() => {
    return () => disconnect();
  }, []);

  // Gestion Messages
  const processServerMessage = (message) => {
    const serverContent = message.serverContent;
    
    // Audio reçu
    if (serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
        console.log("📥 [REÇU] Paquet audio reçu !");
        const base64Audio = serverContent.modelTurn.parts[0].inlineData.data;
        playAudioChunk(base64Audio);
    }

    // Interruption
    if (serverContent?.interrupted) {
        console.log("⏸️ [INTERRUPTION]");
        if(outputAudioContextRef.current) {
            outputAudioContextRef.current.suspend().then(() => outputAudioContextRef.current?.resume());
            nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
        }
    }
  };

  const connect = async () => {
    if (status === 'connected' || status === 'connecting') return;
    setStatus('connecting');

    try {
      if (!aiClientRef.current) aiClientRef.current = new GoogleGenAI({ apiKey });

      // Init Audio
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass();
      outputAudioContextRef.current = new AudioContextClass();

      // Resume forcé
      if (inputAudioContextRef.current.state === 'suspended') await inputAudioContextRef.current.resume();
      if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();

      // Connexion
      const session = await aiClientRef.current.live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          responseModalities: "AUDIO", 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: { parts: [{ text: systemInstruction }] },
        },
        callbacks: {
            onopen: () => {
                console.log("✅ [CONNEXION] Session ouverte.");
                setStatus('connected');
            },
            onclose: () => {
                console.log("❌ [CONNEXION] Session fermée.");
                setStatus('disconnected');
            },
            onmessage: (msg) => processServerMessage(msg),
            onerror: (e) => {
                console.error("⚠️ [ERREUR]", e);
                setStatus('error');
            }
        }
      });

      currentSessionRef.current = session;
      
      // --- PING DE RÉVEIL ---
      setTimeout(async () => {
          console.log("📨 [TEST] Envoi du Ping de réveil...");
          try {
              if (currentSessionRef.current) {
                  await currentSessionRef.current.send({
                      parts: [{ text: "Bonjour ! Est-ce que tu m'entends ?" }],
                      endOfTurn: true
                  });
              }
          } catch (err) {
              console.error("❌ Erreur Ping", err);
          }
      }, 1000);

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
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, sampleRate: 16000 }
      });
      streamRef.current = stream;

      const ctx = inputAudioContextRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (isMuted || !currentSessionRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Volumètre
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolumeLevel(Math.min(1, Math.sqrt(sum / inputData.length) * 5));

        // Traitement
        let dataToProcess = inputData;
        if (ctx.sampleRate !== 16000) {
           dataToProcess = downsampleBuffer(inputData, ctx.sampleRate, 16000);
        }
        const pcm16 = floatTo16BitPCM(dataToProcess);
        const base64Data = arrayBufferToBase64(pcm16);

        try {
            currentSessionRef.current.send({
                parts: [{
                    inlineData: { mimeType: "audio/pcm;rate=16000", data: base64Data }
                }],
                endOfTurn: false
            });
        } catch (error) { /* Ignore */ }
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

  const playAudioChunk = async (base64Audio) => {
      if (!outputAudioContextRef.current) return;
      const ctx = outputAudioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      try {
        const binaryString = atob(base64Audio);
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
        if (nextStartTimeRef.current < currentTime) nextStartTimeRef.current = currentTime + 0.05;
        
        source.start(nextStartTimeRef.current);
        nextStartTimeRef.current += audioBuffer.duration;
      } catch (err) { console.error("Decode error", err); }
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
