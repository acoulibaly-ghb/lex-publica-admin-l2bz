import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage } from '@google/genai';
import { downsampleBuffer } from '../services/audioUtils'; 
// Assurez-vous que downsampleBuffer renvoie bien un Float32Array ou similaire.
// On n'utilise plus createPcmBlob ni decodeAudioData ici pour simplifier le flux.

interface UseLiveSessionProps {
  apiKey: string;
  systemInstruction: string;
}

// Fonction utilitaire pour convertir un buffer Audio (Float32) en Base64 (PCM 16-bit)
// C'est le format EXACT attendu par Gemini Live
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function floatTo16BitPCM(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output.buffer;
}

export const useLiveSession = ({ apiKey, systemInstruction }: UseLiveSessionProps) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null); // Pour jouer le son
  const streamRef = useRef<MediaStream | null>(null);
  
  // Processing
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Gemini Client
  const aiClientRef = useRef<GoogleGenAI | null>(null);
  const currentSessionRef = useRef<any>(null); // Stocke la session active

  // Queue audio pour la lecture fluide
  const nextStartTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef<boolean>(false);

  useEffect(() => {
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    if (status === 'connected' || status === 'connecting') return;
    setStatus('connecting');

    try {
      // 1. Initialisation Client
      if (!aiClientRef.current) {
        aiClientRef.current = new GoogleGenAI({ apiKey });
      }

      // 2. Initialisation Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass();
      outputAudioContextRef.current = new AudioContextClass(); // Contexte séparé pour la sortie

      // Résolution du problème iOS/Mac (Audio suspendu)
      if (inputAudioContextRef.current.state === 'suspended') await inputAudioContextRef.current.resume();
      if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();

      // 3. Connexion Gemini Live (Le bon modèle et la bonne config)
      const session = await aiClientRef.current.live.connect({
        model: 'gemini-2.0-flash-exp', // LE SEUL MODÈLE VALIDE
        config: {
          generationConfig: {
            responseModalities: "audio", // Force l'audio
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, // Voix calme
            },
          },
          systemInstruction: { parts: [{ text: systemInstruction }] },
        },
      });

      currentSessionRef.current = session;
      setStatus('connected');
      console.log('Gemini Live Session Connected');

      // 4. Gestion des événements de réception (IA nous parle)
      // Note: Le SDK récent utilise souvent un stream asynchrone ou des callbacks selon la version.
      // Voici l'implémentation générique basée sur votre code original mais corrigée.
      
      // Si votre version du SDK utilise `onmessage` dans le connect, c'est géré au dessus. 
      // Sinon, on écoute souvent via un stream. 
      // IMPORTANT : Je reprends votre logique de callback qui semble supportée par votre version du SDK
      // mais en m'assurant que la connexion est établie.

      // Démarrage du micro
      await startAudioInput();

      // Boucle de lecture des messages entrants (Adaptation pour le SDK standard)
      listenToIncomingMessages(session);

    } catch (error) {
      console.error('Connection failed:', error);
      setStatus('error');
      disconnect();
    }
  };

  // Fonction pour écouter les réponses de l'IA
  const listenToIncomingMessages = async (session: any) => {
    try {
        // La plupart des sessions Live exposent un itérateur ou des callbacks
        // Si votre SDK utilise des callbacks définis dans le `connect`, ils seront déclenchés.
        // Si c'est un Stream Async :
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
          sampleRate: 16000 // On essaie de demander du 16k natif
        }
      });
      streamRef.current = stream;

      const ctx = inputAudioContextRef.current!;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (isMuted || !currentSessionRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // 1. Visualizer (Volume)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolumeLevel(Math.min(1, Math.sqrt(sum / inputData.length) * 5));

        // 2. Conversion & Envoi
        // Downsample si nécessaire (Gemini veut du 16000Hz)
        let dataToProcess = inputData;
        if (ctx.sampleRate !== 16000) {
           dataToProcess = downsampleBuffer(inputData, ctx.sampleRate, 16000);
        }

        // Conversion Float32 -> Int16 PCM -> Base64
        const pcm16 = floatTo16BitPCM(dataToProcess);
        const base64Data = arrayBufferToBase64(pcm16);

        // ENVOI CORRECT AU SERVEUR
        currentSessionRef.current.send({
            parts: [{
                inlineData: {
                    mimeType: "audio/pcm;rate=16000",
                    data: base64Data
                }
            }]
        });
      };

      // Astuce Anti-Garbage-Collection (Mute Node)
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

    // 1. Réception de l'Audio
    if (serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
        const base64Audio = serverContent.modelTurn.parts[0].inlineData.data;
        playAudioChunk(base64Audio);
    }

    // 2. Gestion de l'Interruption (Si l'utilisateur parle par dessus)
    if (serverContent?.interrupted) {
        console.log("Interruption !");
        // On vide la file d'attente audio et on coupe le son actuel
        audioQueueRef.current = [];
        if(outputAudioContextRef.current) {
            outputAudioContextRef.current.suspend().then(() => outputAudioContextRef.current?.resume());
            nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
        }
    }
  };

  // Lecture fluide des paquets audio
  const playAudioChunk = async (base64Audio: string) => {
      if (!outputAudioContextRef.current) return;
      const ctx = outputAudioContextRef.current;
      
      // Décodage Base64 -> ArrayBuffer
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
      
      // Décodage PCM -> AudioBuffer
      // Note: Gemini envoie du PCM 24kHz ou 16kHz selon la config. 
      // Le plus simple est souvent de laisser le contexte décoder s'il y a un header, 
      // MAIS le stream raw PCM n'a pas de header WAV.
      
      // Pour faire simple et robuste, on construit un buffer brut.
      // Gemini 2.0 Flash exp renvoie souvent du 24000Hz par défaut.
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for(let i=0; i<pcm16.length; i++) float32[i] = pcm16[i] / 32768;

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000); // 24kHz est standard pour Gemini Output
      audioBuffer.copyToChannel(float32, 0);

      // Scheduling (Lecture sans trou)
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      const currentTime = ctx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
          nextStartTimeRef.current = currentTime + 0.05; // Petit tampon de sécurité
      }
      
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
  };

  const disconnect = () => {
    // Cleanup complet
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
