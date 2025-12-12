
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, BookOpen, CheckCircle, HelpCircle, Plus, MessageSquare, Trash2, Edit2, X, Check, PanelLeftClose, PanelLeft, Lightbulb, Info, ExternalLink, AlertTriangle } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { ChatMessage } from '../types';
import { useChatStore } from '../hooks/useChatStore';
import { DEFAULT_COURSE_CONTENT } from '../constants';

interface TextChatProps {
  courseContent: string;
  systemInstruction: string;
  apiKey: string;
}

export const TextChat: React.FC<TextChatProps> = ({ courseContent, systemInstruction, apiKey }) => {
  const { 
    sessions, 
    activeSessionId, 
    setActiveSessionId, 
    createNewSession, 
    deleteSession, 
    renameSession,
    addMessageToSession,
    activeSession 
  } = useChatStore();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Default to false (closed) for all screens
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Rename state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitleInput, setEditTitleInput] = useState('');

  // Course Status Check
  const isDefaultContent = courseContent === DEFAULT_COURSE_CONTENT;
  const [showContentWarning, setShowContentWarning] = useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !activeSessionId) return;

    const userMsg: ChatMessage = { role: 'user', text, timestamp: new Date() };
    addMessageToSession(activeSessionId, userMsg);
    setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      // Combine user instructions with the course content
      const fullSystemInstruction = `${systemInstruction}\n\nCONTENU DU COURS (Source Unique de Vérité) :\n${courseContent}`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
            ...(activeSession?.messages || []).map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            })),
            { role: 'user', parts: [{ text: text }] }
        ],
        config: {
            systemInstruction: fullSystemInstruction
        }
      });

      const responseText = response.text || "Désolé, je n'ai pas pu générer de réponse.";
      
      addMessageToSession(activeSessionId, {
        role: 'model',
        text: responseText,
        timestamp: new Date()
      });

    } catch (error) {
      console.error(error);
      addMessageToSession(activeSessionId, {
        role: 'model',
        text: "Une erreur est survenue lors de la communication avec l'IA. Veuillez vérifier votre clé API ou réessayer.",
        timestamp: new Date(),
        isError: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: string) => {
    let prompt = "";
    switch(action) {
        case 'explain': prompt = "Choisis une notion clé ou une définition importante du cours et explique-la de manière pédagogique."; break;
        case 'quiz': prompt = "Génère une question de quiz aléatoire sur le cours."; break;
        case 'qcm': prompt = "Crée un QCM avec 3 choix et la réponse expliquée."; break;
        case 'cas': prompt = "Propose un petit cas pratique juridique basé sur le cours."; break;
        case 'vrai-faux': prompt = "Donne-moi une affirmation VRAI ou FAUX à vérifier."; break;
    }
    if (prompt) sendMessage(prompt);
  };

  const startEditing = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(id);
    setEditTitleInput(currentTitle);
  };

  const saveTitle = (id: string) => {
    if (editTitleInput.trim()) {
        renameSession(id, editTitleInput.trim());
    }
    setEditingSessionId(null);
  };

  const cancelEditing = () => {
    setEditingSessionId(null);
  };

  const handleSessionSelect = (id: string) => {
    setActiveSessionId(id);
    setIsSidebarOpen(false);
  };

  const handleNewSession = () => {
    createNewSession();
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-full max-w-6xl mx-auto w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden relative transition-colors">
      
      {/* Help Modal / Lightbox */}
      {isHelpOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90%] overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
                            <Lightbulb size={24} />
                        </div>
                        <div>
                            <h3 className="font-serif font-bold text-slate-900 dark:text-white text-lg">Aide & Ressources</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Guide de l'assistant pédagogique</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsHelpOpen(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 p-2 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6">
                    <section>
                        <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                            <Bot size={18} className="text-blue-600 dark:text-blue-400" />
                            À propos de l'assistant
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            Cette IA est programmée pour répondre aux questions <strong>exclusivement basées sur le cours de Droit Public</strong> fourni par votre professeur. Elle ne répondra pas aux questions hors sujet.
                        </p>
                    </section>

                    <section>
                        <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                            <Sparkles size={18} className="text-purple-600 dark:text-purple-400" />
                            Fonctionnalités interactives
                        </h4>
                        <ul className="space-y-3">
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <div className="min-w-6 pt-0.5"><Lightbulb size={16} className="text-cyan-600 dark:text-cyan-400" /></div>
                                <div><strong>Explication :</strong> Demandez des éclaircissements sur des concepts complexes.</div>
                            </li>
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <div className="min-w-6 pt-0.5"><HelpCircle size={16} className="text-blue-600 dark:text-blue-400" /></div>
                                <div><strong>Quiz & QCM :</strong> Testez vos connaissances avec des exercices corrigés.</div>
                            </li>
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <div className="min-w-6 pt-0.5"><BookOpen size={16} className="text-amber-600 dark:text-amber-400" /></div>
                                <div><strong>Cas Pratique :</strong> Entraînez-vous au raisonnement juridique.</div>
                            </li>
                        </ul>
                    </section>

                    <section className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                        <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                            <ExternalLink size={18} className="text-slate-500" />
                            Liens utiles
                        </h4>
                        <div className="space-y-2">
                            <a href="#" className="block text-sm text-blue-600 dark:text-blue-400 hover:underline hover:text-blue-800 dark:hover:text-blue-300 transition-colors">
                                • Portail de l'Université
                            </a>
                            <a href="#" className="block text-sm text-blue-600 dark:text-blue-400 hover:underline hover:text-blue-800 dark:hover:text-blue-300 transition-colors">
                                • Syllabus du cours (PDF)
                            </a>
                            <a href="#" className="block text-sm text-blue-600 dark:text-blue-400 hover:underline hover:text-blue-800 dark:hover:text-blue-300 transition-colors">
                                • Calendrier des examens
                            </a>
                        </div>
                    </section>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-center">
                    <button 
                        onClick={() => setIsHelpOpen(false)}
                        className="w-full py-2.5 bg-slate-900 dark:bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                    >
                        J'ai compris
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Sidebar Overlay Backdrop - Active on both Mobile and Desktop when open */}
      {isSidebarOpen && (
        <div 
            className="absolute inset-0 bg-black/30 z-20 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Unified Sidebar Container - Absolute Positioning for Overlay Effect on ALL screens */}
      <div className={`
        absolute inset-y-0 left-0 z-30 flex flex-col w-72
        bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800
        transition-transform duration-300 ease-in-out shadow-2xl
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Inner Sidebar Content */}
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-serif font-bold text-slate-800 dark:text-white">Historique</h3>
                    <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg">
                        <PanelLeftClose size={20} />
                    </button>
                </div>

                <button 
                    onClick={handleNewSession}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                >
                    <Plus size={18} />
                    <span className="whitespace-nowrap">Nouvelle conversation</span>
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">Conversations</h3>
                
                {sessions.map(session => (
                    <div 
                        key={session.id}
                        onClick={() => handleSessionSelect(session.id)}
                        className={`group flex items-center gap-3 px-3 py-3 rounded-lg text-sm cursor-pointer transition-colors ${
                            activeSessionId === session.id 
                            ? 'bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 text-slate-900 dark:text-white font-medium' 
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                    >
                        <MessageSquare size={18} className={`shrink-0 ${activeSessionId === session.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                        
                        {editingSessionId === session.id ? (
                            <div className="flex items-center flex-1 gap-1" onClick={e => e.stopPropagation()}>
                                <input 
                                    type="text" 
                                    value={editTitleInput}
                                    onChange={(e) => setEditTitleInput(e.target.value)}
                                    className="w-full min-w-0 px-1 py-1 bg-white dark:bg-slate-700 border border-blue-300 dark:border-blue-500 rounded text-sm focus:outline-none text-slate-900 dark:text-white"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if(e.key === 'Enter') saveTitle(session.id);
                                        if(e.key === 'Escape') cancelEditing();
                                    }}
                                />
                                <button onClick={() => saveTitle(session.id)} className="text-green-600 hover:bg-green-100 dark:hover:bg-green-900 p-1.5 rounded">
                                    <Check size={14} />
                                </button>
                                <button onClick={cancelEditing} className="text-red-500 hover:bg-red-100 dark:hover:bg-red-900 p-1.5 rounded">
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <span className="flex-1 truncate">{session.title}</span>
                                
                                <div className={`flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity ${activeSessionId === session.id ? 'opacity-100' : ''}`}>
                                    <button 
                                        onClick={(e) => startEditing(session.id, session.title, e)}
                                        className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                                        title="Renommer"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button 
                                        onClick={(e) => deleteSession(session.id, e)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                        title="Supprimer"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}

                {sessions.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-xs">
                        Aucune conversation
                    </div>
                )}
            </div>
            
            {/* Sidebar Footer - Kept simple now since Help is in header */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex-shrink-0 text-center">
                 <p className="text-[10px] text-slate-400">Assistant Droit Public</p>
            </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950 relative">
          
          {/* Unified Header with Help Button */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-sm z-10 sticky top-0 transition-colors">
              <div className="flex items-center gap-3">
                <button 
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg focus:outline-none"
                    title={isSidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
                >
                    {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
                </button>
                <div className="flex flex-col overflow-hidden">
                    <span className="font-semibold text-slate-800 dark:text-white truncate leading-tight">
                        {activeSession?.title || 'Droit Public IA'}
                    </span>
                    <span className="text-xs text-slate-400 truncate hidden md:block">
                        {activeSession ? 'Historique actif' : 'Nouvelle session'}
                    </span>
                </div>
              </div>

              {/* Added Help Button Here */}
              <button 
                  onClick={() => setIsHelpOpen(true)}
                  className="p-2 text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                  title="Aide & Ressources"
              >
                  <Lightbulb size={20} />
              </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50 dark:bg-slate-950 scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
            {isDefaultContent && showContentWarning && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-4 flex items-start gap-3 relative animate-in fade-in slide-in-from-top-2">
                    <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Mode Démonstration</p>
                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                            L'IA utilise actuellement le cours d'exemple. Pour que l'IA réponde sur VOS cours, allez dans "Gérer le Cours" et collez votre contenu.
                        </p>
                    </div>
                    <button onClick={() => setShowContentWarning(false)} className="text-amber-500 hover:text-amber-700 dark:text-amber-500/50 dark:hover:text-amber-300">
                        <X size={16} />
                    </button>
                </div>
            )}

            {!activeSession ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <MessageSquare size={48} className="mb-4 opacity-20" />
                    <p>Sélectionnez ou créez une conversation</p>
                </div>
            ) : (
                <>
                    {activeSession.messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${
                            msg.role === 'model' ? 'bg-blue-600 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                            {msg.role === 'model' ? <Bot size={20} /> : <User size={20} />}
                        </div>
                        <div className={`flex flex-col max-w-[90%] md:max-w-[95%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`px-5 py-4 md:px-6 md:py-5 rounded-2xl shadow-sm prose prose-base max-w-none leading-relaxed ${
                                msg.role === 'user' 
                                ? 'bg-blue-600 text-white rounded-tr-none prose-invert' 
                                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-none prose-slate dark:prose-invert'
                            }`}>
                                <ReactMarkdown>{msg.text}</ReactMarkdown>
                            </div>
                            <span className="text-[10px] md:text-xs text-slate-400 mt-1 px-1">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                    ))}
                    {isLoading && (
                        <div className="flex gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
                                <Bot size={20} />
                            </div>
                            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-200 dark:border-slate-700">
                                <Loader2 className="animate-spin text-blue-600 dark:text-blue-400" size={16} />
                                <span className="text-slate-500 dark:text-slate-400 text-sm">Réflexion en cours...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 transition-colors">
            
            {/* Quick Actions */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                <button onClick={() => handleQuickAction('explain')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-900/30 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 rounded-full transition-colors whitespace-nowrap">
                    <Lightbulb size={14} /> Explication
                </button>
                <button onClick={() => handleQuickAction('quiz')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors whitespace-nowrap">
                    <HelpCircle size={14} /> Quiz Rapide
                </button>
                <button onClick={() => handleQuickAction('qcm')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-full transition-colors whitespace-nowrap">
                    <CheckCircle size={14} /> Générer QCM
                </button>
                <button onClick={() => handleQuickAction('cas')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-full transition-colors whitespace-nowrap">
                    <BookOpen size={14} /> Cas Pratique
                </button>
                <button onClick={() => handleQuickAction('vrai-faux')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-full transition-colors whitespace-nowrap">
                    <Sparkles size={14} /> Vrai/Faux
                </button>
            </div>

            <div className="relative flex items-center">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
                    placeholder="Posez une question sur le cours..."
                    className="w-full pl-4 pr-12 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white dark:focus:bg-slate-800 transition-all text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    disabled={isLoading || !activeSessionId}
                />
                <button 
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || isLoading || !activeSessionId}
                    className="absolute right-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
                >
                    <Send size={18} />
                </button>
            </div>
          </div>
      </div>
    </div>
  );
};
