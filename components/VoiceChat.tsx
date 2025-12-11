
import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, AlertCircle } from 'lucide-react';
import { useLiveSession } from '../hooks/useLiveSession';
import { AudioVisualizer } from './AudioVisualizer';

interface VoiceChatProps {
  courseContent: string;
  systemInstruction: string;
  apiKey: string;
}

export const VoiceChat: React.FC<VoiceChatProps> = ({ courseContent, systemInstruction, apiKey }) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Combine custom instructions with course content for the Live API
  const fullSystemInstruction = `${systemInstruction}\n\nCONTENU DU COURS (Source Unique de Vérité) :\n${courseContent}`;
  
  const { 
    status, 
    connect, 
    disconnect, 
    isMuted, 
    toggleMute, 
    volumeLevel 
  } = useLiveSession({ apiKey, systemInstruction: fullSystemInstruction });

  const handleConnect = () => {
    setErrorMsg(null);
    connect();
  };

  useEffect(() => {
    if (status === 'error') {
        setErrorMsg("Connexion échouée. Veuillez vérifier que votre navigateur autorise le microphone et que votre clé API est valide.");
    }
  }, [status]);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto w-full bg-slate-900 rounded-xl shadow-2xl overflow-hidden relative">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900/20 to-slate-900 pointer-events-none"></div>

      <div className="z-10 flex flex-col items-center gap-12 p-8 text-center w-full max-w-md">
        
        <div className="space-y-2">
            <h2 className="text-3xl font-serif font-bold text-white tracking-tight">Conversation Orale</h2>
            <p className="text-slate-400">Échangez en temps réel avec votre professeur IA.</p>
        </div>

        <div className="relative">
            <AudioVisualizer level={volumeLevel} isActive={status === 'connected'} />
            
            {/* Status Badge */}
            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase transition-colors ${
                status === 'connected' ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 
                status === 'connecting' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' :
                'bg-slate-700 text-slate-400 border border-slate-600'
            }`}>
                {status === 'connected' ? 'En ligne' : status === 'connecting' ? 'Connexion...' : 'Hors ligne'}
            </div>
        </div>

        {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-200 text-sm text-left">
                <AlertCircle size={20} className="shrink-0" />
                <p>{errorMsg}</p>
            </div>
        )}

        <div className="flex items-center gap-6">
            {status === 'connected' || status === 'connecting' ? (
                <>
                    <button 
                        onClick={toggleMute}
                        className={`p-5 rounded-full transition-all ${
                            isMuted 
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                            : 'bg-slate-800 text-white hover:bg-slate-700'
                        }`}
                        title={isMuted ? "Activer le micro" : "Couper le micro"}
                    >
                        {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                    </button>
                    <button 
                        onClick={disconnect}
                        className="p-5 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/30 transition-all transform hover:scale-105"
                        title="Raccrocher"
                    >
                        <PhoneOff size={28} />
                    </button>
                </>
            ) : (
                <button 
                    onClick={handleConnect}
                    className="flex items-center gap-3 px-8 py-4 rounded-full bg-green-600 text-white font-semibold text-lg hover:bg-green-500 shadow-xl shadow-green-600/20 transition-all transform hover:scale-105 active:scale-95"
                >
                    <Phone size={24} />
                    <span>Démarrer l'appel</span>
                </button>
            )}
        </div>
      </div>
    </div>
  );
};
