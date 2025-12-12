
import React, { useState, useEffect } from 'react';
import { MessageSquare, Mic, BookOpen, GraduationCap, Settings, AlertTriangle, Lock, KeyRound, LogOut, Unlock, Moon, Sun } from 'lucide-react';
import { TextChat } from './components/TextChat';
import { VoiceChat } from './components/VoiceChat';
import { CourseEditor } from './components/CourseEditor';
import { AppMode } from './types';
import { DEFAULT_COURSE_CONTENT, DEFAULT_SYSTEM_INSTRUCTION } from './constants';

const App = () => {
  const [activeMode, setActiveMode] = useState<AppMode>(AppMode.TEXT);
  const [courseContent, setCourseContent] = useState<string>(DEFAULT_COURSE_CONTENT);
  const [systemInstruction, setSystemInstruction] = useState<string>(DEFAULT_SYSTEM_INSTRUCTION);
  const apiKey = process.env.API_KEY || '';
  
  // Security: Get password from environment variable, fallback to 'admin' if not set
  const teacherPassword = process.env.TEACHER_PASSWORD || 'admin';
  const isDefaultPassword = teacherPassword === 'admin';

  // Auth State for Professor Mode
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(false);

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(prev => !prev);

  // Load from local storage
  useEffect(() => {
    const storedContent = localStorage.getItem('course_content');
    const storedInstruction = localStorage.getItem('system_instruction');
    if (storedContent) setCourseContent(storedContent);
    if (storedInstruction) setSystemInstruction(storedInstruction);
  }, []);

  // Save to local storage
  const handleContentSave = (content: string) => {
    setCourseContent(content);
    localStorage.setItem('course_content', content);
  };

  const handleInstructionSave = (instruction: string) => {
    setSystemInstruction(instruction);
    localStorage.setItem('system_instruction', instruction);
  };

  // Simple check for API key
  if (!apiKey) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-red-200 dark:border-red-900 p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
                <AlertTriangle size={32} />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Clé API manquante</h1>
            <p className="text-slate-600 dark:text-slate-300">
                Cette application nécessite une clé API Google Gemini pour fonctionner. 
                Veuillez vous assurer que la variable d'environnement <code>process.env.API_KEY</code> est configurée.
            </p>
        </div>
      </div>
    );
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === teacherPassword) {
      setIsAuthenticated(true);
      setLoginError(false);
      setPasswordInput('');
    } else {
      setLoginError(true);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setActiveMode(AppMode.TEXT); // Redirect to student view
  };

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      
      {/* Sidebar Navigation */}
      <aside className="w-20 md:w-64 bg-slate-900 dark:bg-black text-slate-300 flex flex-col border-r border-slate-800">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-900/50">
                <GraduationCap size={24} />
            </div>
            <span className="font-montserrat font-bold text-xl text-white hidden md:block tracking-wide">Droit Public IA</span>
        </div>

        <nav className="flex-1 p-4 space-y-2">
            <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:block">
                Espace Étudiant
            </div>
            <button 
                onClick={() => setActiveMode(AppMode.TEXT)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeMode === AppMode.TEXT 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'hover:bg-slate-800'
                }`}
            >
                <MessageSquare size={20} />
                <span className="hidden md:block font-medium">Discussion</span>
            </button>

            <button 
                onClick={() => setActiveMode(AppMode.VOICE)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeMode === AppMode.VOICE 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'hover:bg-slate-800'
                }`}
            >
                <Mic size={20} />
                <span className="hidden md:block font-medium">Mode Oral (Live)</span>
            </button>

            <div className="mt-8 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:block">
                Espace Professeur
            </div>
            <button 
                onClick={() => setActiveMode(AppMode.SETTINGS)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeMode === AppMode.SETTINGS 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'hover:bg-slate-800'
                }`}
            >
                {activeMode === AppMode.SETTINGS && isAuthenticated ? <Unlock size={20} /> : <Lock size={20} />}
                <span className="hidden md:block font-medium">Gérer le Cours</span>
            </button>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-4">
             {/* Dark Mode Toggle in Sidebar */}
            <button 
                onClick={toggleDarkMode}
                className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title={isDarkMode ? "Passer en mode clair" : "Passer en mode sombre"}
            >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                <span className="hidden md:block text-sm font-medium">{isDarkMode ? 'Mode Clair' : 'Mode Sombre'}</span>
            </button>

            <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-500 hidden md:block">
                <p>Version 1.0.0</p>
                <p>Propulsé par Gemini 2.5</p>
            </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 shrink-0 z-10 transition-colors">
            <h1 className="text-2xl md:text-3xl font-montserrat font-bold text-slate-800 dark:text-white pt-1">
                {activeMode === AppMode.TEXT && 'Lex publica IA'}
                {activeMode === AppMode.VOICE && 'Salle de Classe Virtuelle'}
                {activeMode === AppMode.SETTINGS && 'Administration du Cours'}
            </h1>
            
            <div className="flex items-center gap-4">
                {activeMode === AppMode.SETTINGS && isAuthenticated ? (
                    <button 
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                    >
                        <LogOut size={16} />
                        <span>Se déconnecter</span>
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500"></div>
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Système prêt</span>
                    </div>
                )}
            </div>
        </header>

        <div className="flex-1 p-4 md:p-6 overflow-hidden">
            {activeMode === AppMode.TEXT && (
                <TextChat 
                  courseContent={courseContent} 
                  systemInstruction={systemInstruction}
                  apiKey={apiKey} 
                />
            )}
            
            {activeMode === AppMode.VOICE && (
                <VoiceChat 
                  courseContent={courseContent} 
                  systemInstruction={systemInstruction}
                  apiKey={apiKey} 
                />
            )}
            
            {activeMode === AppMode.SETTINGS && (
                isAuthenticated ? (
                    <CourseEditor 
                      initialContent={courseContent} 
                      onSaveContent={handleContentSave} 
                      initialInstruction={systemInstruction}
                      onSaveInstruction={handleInstructionSave}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
                            <div className="bg-slate-50 dark:bg-slate-900 p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col items-center">
                                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-4">
                                    <Lock size={32} />
                                </div>
                                <h2 className="text-xl font-serif font-bold text-slate-800 dark:text-white">Accès Professeur</h2>
                                <p className="text-slate-500 dark:text-slate-400 text-sm text-center mt-1">Veuillez vous identifier pour modifier le cours.</p>
                            </div>
                            
                            <form onSubmit={handleLogin} className="p-8 space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Mot de passe</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                            <KeyRound size={18} />
                                        </div>
                                        <input
                                            type="password"
                                            value={passwordInput}
                                            onChange={(e) => setPasswordInput(e.target.value)}
                                            className={`block w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:outline-none transition-colors bg-white dark:bg-slate-900 text-slate-900 dark:text-white ${
                                                loginError 
                                                ? 'border-red-300 dark:border-red-800 focus:border-red-500 focus:ring-red-200 dark:focus:ring-red-900/30' 
                                                : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-200 dark:focus:ring-blue-900/30'
                                            }`}
                                            placeholder="••••••••"
                                            autoFocus
                                        />
                                    </div>
                                    {loginError && (
                                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">Mot de passe incorrect.</p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-600/20"
                                >
                                    Accéder au Cours
                                </button>
                                
                                {isDefaultPassword && (
                                    <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                                        (Mot de passe démo : <strong>admin</strong>)
                                    </p>
                                )}
                            </form>
                        </div>
                    </div>
                )
            )}
        </div>
      </main>
    </div>
  );
};

export default App;
