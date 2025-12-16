import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage } from '@google/genai';
import { downsampleBuffer, arrayBufferToBase64 } from '../services/audioUtils';

interface UseLiveSessionProps {
  apiKey: string;
  systemInstruction: string;
}

// Fonction utilitaire : Conversion PCM 16-bit Little Endian (Format requis par Google)
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    // Conversion en 16-bit signé
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    // true = Little Endian
    output.setInt16(i * 2, val, true);
  }
  return output.buffer;
}

export const useLiveSession = ({ apiKey, systemInstruction }: UseLiveSessionProps) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Références Audio
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Références IA
  const aiClientRef = useRef<GoogleGenAI | null>(null);
  const currentSessionRef = useRef<any>(null);
  
  // Références Lecture Audio
  const nextStartTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<AudioBuffer[]>([]);

  useEffect(() => {
    // Nettoyage à la fermeture du composant
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- TRAITEMENT DES MESSAGES REÇUS ---
  const processServerMessage = (message: LiveServerMessage) => {
    const serverContent = message.serverContent;

    // 1. Réception d'un paquet audio
    if (serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
        console.log("📥 [REÇU] Paquet audio de l'IA !");
        const base64Audio = serverContent.modelTurn.parts[0].inlineData.data;
        playAudioChunk(base64Audio);
    }

    // 2. Gestion de l'interruption (Si l'utilisateur coupe la parole)
    if (serverContent?.interrupted) {
        console.log("⏸️ [INTERRUPTION] L'IA s'arrête de parler.");
        if(outputAudioContextRef.current) {
            // On suspend et reprend pour vider le buffer matériel instantanément
            outputAudioContextRef.current.suspend().then(() => outputAudioContextRef.current?.resume());
            nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
        }
    }
  };

  const connect = async () => {
    if (status === 'connected' || status === 'connecting') return;
    setStatus('connecting');

    try {
      // Initialisation du client Google
      if (!aiClientRef.current) {
        aiClientRef.current = new GoogleGenAI({ apiKey });
      }

      // Initialisation des contextes Audio (Entrée/Sortie)
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass();
      outputAudioContextRef.current = new AudioContextClass();

      // "Réveil" des contextes audio (Contournement des sécurités navigateur)
      if (inputAudioContextRef.current.state === 'suspended') await inputAudioContextRef.current.resume();
      if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();

      // --- CONNEXION WEBSOCKET ---
      const session = await aiClientRef.current.live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          // Configuration Audio
          responseModalities: "AUDIO" as any, 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: { parts: [{ text: systemInstruction }] },
        },
        callbacks: {
            onopen: () => {
                console.log("✅ [CONNEXION] WebSocket ouvert.");
                setStatus('connected');
            },
            onclose: () => {
                console.log("❌ [CONNEXION] WebSocket fermé.");
                setStatus('disconnected');
            },
            onmessage: (msg: LiveServerMessage) => {
                processServerMessage(msg);
            },
            onerror: (e) => {
                console.error("⚠️ [ERREUR] Erreur de session :", e);
                setStatus('error');
            }
        }
      });

      // Sauvegarde de la session active
      currentSessionRef.current = session;

      // --- LE TEST ULTIME : PING DE RÉVEIL ---
      // On envoie un message texte pour forcer l'IA à répondre vocalement tout de suite.
      // Cela permet de vérifier si les enceintes fonctionnent indépendamment du micro.
      console.log("📨 [TEST] Envoi du message 'Bonjour' pour tester le son...");
      await session.send({
          parts: [{ text: "Bonjour ! Confirme-moi que tu m'entends bien." }],
          endOfTurn: true
      });

      // Démarrage du micro
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
      // Buffer de 4096 échantillons
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (isMuted) return;
        // Si la session n'est pas prête, on n'envoie rien (Sécurité anti-crash)
        if (!currentSessionRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // 1. Calcul du volume pour le visuel (Cercle qui bouge)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolumeLevel(Math.min(1, Math.sqrt(sum / inputData.length) * 5));

        // 2. Ré-échantillonnage si nécessaire (vers 16kHz)
        let dataToProcess: Float32Array = inputData;
        if (ctx.sampleRate !== 16000) {
           dataToProcess = downsampleBuffer(inputData, ctx.sampleRate, 16000) as any;
        }

        // 3. Conversion en PCM 16-bit et Encodage Base64
        const pcm16 = floatTo16BitPCM(dataToProcess);
        const base64Data = arrayBufferToBase64(pcm16);

        // 4. Envoi au serveur
        try {
            currentSessionRef.current.send({
                parts: [{
                    inlineData: {
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Data
                    }
                }],
                endOfTurn: false // On continue de parler
            });
        } catch (error) {
            // On ignore les erreurs d'envoi ponctuelles (réseau instable)
        }
      };

      // Connexion du pipeline audio (Micro -> Processeur -> Mute -> Sortie)
      const muteNode = ctx.createGain();
      muteNode.gain.value = 0; // Pour ne pas s'entendre soi-même en écho
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
      
      // Sécurité : Si le navigateur a coupé le son (Autoplay policy), on tente de reprendre
      if (ctx.state === 'suspended') await ctx.resume();

      try {
        // Décodage Base64 -> Binaire
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        
        // Conversion PCM 16-bit -> Float32 (pour le navigateur)
        const pcm16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(pcm16.length);
        for(let i=0; i<pcm16.length; i++) float32[i] = pcm16[i] / 32768;

        // Création du buffer audio
        const audioBuffer = ctx.createBuffer(1, float32.length, 24000); // 24kHz est souvent la fréquence de réponse de Gemini
        audioBuffer.copyToChannel(float32, 0);

        // Lecture
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        
        // Gestion du timing pour éviter les coupures entre les morceaux
        const currentTime = ctx.currentTime;
        if (nextStartTimeRef.current < currentTime) {
            nextStartTimeRef.current = currentTime + 0.05; // Petit tampon de sécurité
        }
        
        source.start(nextStartTimeRef.current);
        nextStartTimeRef.current += audioBuffer.duration;
      } catch (err) {
        console.error("Erreur de lecture audio :", err);
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
