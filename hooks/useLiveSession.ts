// @ts-nocheck
"use client";

import { useState, useRef, useEffect } from 'react';

// --- FONCTIONS UTILITAIRES AUDIO (Internes et robustes) ---

function floatTo16BitPCM(input) {
  const output = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    output.setInt16(i * 2, val, true);
  }
  return output.buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function downsampleBuffer(buffer, sampleRate, outSampleRate) {
  if (outSampleRate === sampleRate) return buffer;
  if (outSampleRate > sampleRate) return buffer;
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

// --- HOOK PRINCIPAL (SANS LE SDK GOOGLE) ---

export const useLiveSession = ({ apiKey, systemInstruction }) => {
  const [status, setStatus] = useState('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Refs
  const wsRef = useRef(null); // Le WebSocket natif
  const inputAudioContextRef = useRef(null);
  const outputAudioContextRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const inputSourceRef = useRef(null);
  const nextStartTimeRef = useRef(0);

  useEffect(() => {
    return () => disconnect();
  }, []);

  // Lecture des réponses audio
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

  const connect = async () => {
    if (status === 'connected' || status === 'connecting') return;
    setStatus('connecting');

    try {
      // 1. Init Audio
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass();
      outputAudioContextRef.current = new AudioContextClass();

      if (inputAudioContextRef.current.state === 'suspended') await inputAudioContextRef.current.resume();
      if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();

      // 2. Connexion WebSocket DIRECTE (Sans SDK)
      // URL officielle pour le streaming bidi
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log("✅ [SOCKET] Connecté au serveur Google.");
        
        // 3. Handshake (Envoi de la configuration)
       // 3. Handshake (Configuration optimisée "Professeur Français")
        const setupMessage = {
            setup: {
                model: "models/gemini-2.0-flash-exp",
                generation_config: {
                    response_modalities: ["AUDIO"],
                    speech_config: {
                        voice_config: { 
                            prebuilt_voice_config: { 
                                // On passe à AOEDE : plus mature, plus posée.
                                voice_name: "Aoede" 
                            } 
                        }
                    }
                },
                system_instruction: { 
                    parts: [{ 
                        // On force le trait sur l'identité et l'accent
                        text: systemInstruction + " IMPORTANT : Tu es une éminente professeure de droit public française. Ton ton est calme, académique, posé et bienveillant. Tu n'es pas une assistante IA surexcitée. Tu parles un français impeccable, sans anglicismes, avec une élocution lente et articulée. Ne sois pas 'déjantée', sois professionnelle." 
                    }] 
                }
            }
        };
        ws.send(JSON.stringify(setupMessage));
        console.log("📨 [SETUP] Configuration envoyée.");
        
        setStatus('connected');

        // 4. PING DE RÉVEIL (Via protocole brut)
        setTimeout(() => {
            console.log("📨 [PING] Envoi du message 'Bonjour'...");
            const clientContent = {
                client_content: {
                    turns: [{
                        role: "user",
                        parts: [{ text: "Bonjour ! Est-ce que tu m'entends ?" }]
                    }],
                    turn_complete: true
                }
            };
            ws.send(JSON.stringify(clientContent));
        }, 1000);
      };

      ws.onmessage = async (event) => {
        // Réception des données (souvent un Blob)
        let data;
        if (event.data instanceof Blob) {
            data = JSON.parse(await event.data.text());
        } else {
            data = JSON.parse(event.data);
        }

        // Audio reçu
        if (data.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
            console.log("📥 [REÇU] Audio !");
            const base64Audio = data.serverContent.modelTurn.parts[0].inlineData.data;
            playAudioChunk(base64Audio);
        }
        
        // Interruption
        if (data.serverContent?.interrupted) {
            console.log("⏸️ [INTERRUPTION]");
            if(outputAudioContextRef.current) {
                outputAudioContextRef.current.suspend().then(() => outputAudioContextRef.current?.resume());
                nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
            }
        }
      };

      ws.onclose = () => {
        console.log("❌ [SOCKET] Déconnecté.");
        setStatus('disconnected');
      };

      ws.onerror = (error) => {
        console.log("⚠️ [SOCKET] Erreur:", error);
        setStatus('error');
      };

      wsRef.current = ws;
      await startAudioInput();

    } catch (error) {
      console.error('Init failed:', error);
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
        if (isMuted || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Volumètre
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolumeLevel(Math.min(1, Math.sqrt(sum / inputData.length) * 5));

        // Encodage
        let dataToProcess = inputData;
        if (ctx.sampleRate !== 16000) {
           dataToProcess = downsampleBuffer(inputData, ctx.sampleRate, 16000);
        }
        const pcm16 = floatTo16BitPCM(dataToProcess);
        const base64Data = arrayBufferToBase64(pcm16);

        // Envoi Audio (Protocole Brut)
        const audioMessage = {
            realtime_input: {
                media_chunks: [{
                    mime_type: "audio/pcm",
                    data: base64Data
                }]
            }
        };
        
        try {
            wsRef.current.send(JSON.stringify(audioMessage));
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

  const disconnect = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
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
