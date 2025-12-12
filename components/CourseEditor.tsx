
import React, { useState, useEffect } from 'react';
import { Save, FileText, Upload, Bot, Book, Info, Check, Loader2 } from 'lucide-react';

interface CourseEditorProps {
  initialContent: string;
  onSaveContent: (newContent: string) => void;
  initialInstruction: string;
  onSaveInstruction: (newInstruction: string) => void;
}

type Tab = 'content' | 'instruction';

export const CourseEditor: React.FC<CourseEditorProps> = ({ 
  initialContent, 
  onSaveContent,
  initialInstruction,
  onSaveInstruction
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('content');
  
  const [content, setContent] = useState(initialContent);
  const [instruction, setInstruction] = useState(initialInstruction);
  
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [isSavingInstruction, setIsSavingInstruction] = useState(false);

  // Sync internal state if props change externally (though typically driven by this component)
  // This helps if the parent updates the content via other means, but mainly ensures sync after save
  useEffect(() => {
    // Only update if the prop is different and we aren't currently editing (to avoid cursor jumps if possible, 
    // though here we assume prop updates come from our own saves mostly)
    if (initialContent !== content && !isSavingContent) {
        // We don't forcefully overwrite state to avoid losing typing if a race condition occurred,
        // but typically in this architecture, local state leads.
    }
  }, [initialContent]);

  // Auto-save for Content
  useEffect(() => {
    if (content === initialContent) return;

    setIsSavingContent(true);
    const timer = setTimeout(() => {
      onSaveContent(content);
      setIsSavingContent(false);
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [content, initialContent, onSaveContent]);

  // Auto-save for Instruction
  useEffect(() => {
    if (instruction === initialInstruction) return;

    setIsSavingInstruction(true);
    const timer = setTimeout(() => {
      onSaveInstruction(instruction);
      setIsSavingInstruction(false);
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [instruction, initialInstruction, onSaveInstruction]);

  // Stats for Content
  const charCount = content.length;
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  const estimatedPages = Math.ceil(wordCount / 500); // approx 500 words per page

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setContent(text);
      // Auto-save will trigger via useEffect
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full transition-colors">
      
      {/* Tabs Header */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('content')}
          className={`flex items-center gap-2 px-6 py-3 rounded-t-xl font-medium text-sm transition-colors relative top-[1px] ${
            activeTab === 'content'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-800 border-b-white dark:border-b-slate-900 z-10'
              : 'bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Book size={18} />
          <span>Contenu du Cours (Savoir)</span>
        </button>
        <button
          onClick={() => setActiveTab('instruction')}
          className={`flex items-center gap-2 px-6 py-3 rounded-t-xl font-medium text-sm transition-colors relative top-[1px] ${
            activeTab === 'instruction'
              ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 border border-slate-200 dark:border-slate-800 border-b-white dark:border-b-slate-900 z-10'
              : 'bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Bot size={18} />
          <span>Instructions IA (Comportement)</span>
        </button>
      </div>

      <div className="flex-1 bg-white dark:bg-slate-900 rounded-b-xl rounded-tr-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col p-6 transition-colors">
        
        {/* CONTENT TAB */}
        {activeTab === 'content' && (
          <div className="flex flex-col h-full animate-in fade-in duration-200">
            <div className="flex flex-col gap-4 mb-4">
               {/* Stats & Actions Row */}
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded"><strong>{charCount.toLocaleString()}</strong> caractères</span>
                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded"><strong>{wordCount.toLocaleString()}</strong> mots</span>
                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">~ <strong>{estimatedPages}</strong> pages</span>
                 </div>
                 <div className="flex gap-2 items-center">
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-slate-700 dark:text-slate-300 text-sm transition-colors">
                        <Upload size={16} />
                        <span>Importer (.txt)</span>
                        <input type="file" accept=".txt,.md" onChange={handleFileUpload} className="hidden" />
                    </label>
                    
                    <div className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        isSavingContent 
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' 
                        : content !== initialContent
                            ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                        {isSavingContent ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                <span>Enregistrement...</span>
                            </>
                        ) : content !== initialContent ? (
                            <span>Modifications en cours...</span>
                        ) : (
                            <>
                                <Check size={16} />
                                <span>À jour</span>
                            </>
                        )}
                    </div>
                 </div>
               </div>

               {/* Tip Box */}
               <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-lg text-xs text-blue-800 dark:text-blue-300">
                  <Info size={14} className="mt-0.5 shrink-0 text-blue-500 dark:text-blue-400" />
                  <p>
                    <strong>Sauvegarde automatique activée.</strong> Le texte est enregistré automatiquement lorsque vous arrêtez de taper. 
                    <br/>Conseil : Pour des cours volumineux, copiez-collez par sections si nécessaire, ou importez un fichier .txt.
                  </p>
               </div>
            </div>

            <textarea 
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                className="flex-1 w-full p-4 resize-none border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/50 text-slate-700 dark:text-slate-200 leading-relaxed font-mono text-sm bg-white dark:bg-slate-950 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-600"
                placeholder="Collez ici l'intégralité du cours de droit (copiez-collez votre texte ou importez un fichier .txt)..."
            />
          </div>
        )}

        {/* INSTRUCTION TAB */}
        {activeTab === 'instruction' && (
          <div className="flex flex-col h-full animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-4">
               <div className="text-sm text-slate-500 dark:text-slate-400">
                  <p>Définissez ici la personnalité et les règles pédagogiques de l'IA.</p>
               </div>
               
               <div className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isSavingInstruction 
                    ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' 
                    : instruction !== initialInstruction
                        ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                }`}>
                    {isSavingInstruction ? (
                        <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Enregistrement...</span>
                        </>
                    ) : instruction !== initialInstruction ? (
                        <span>Modifications en cours...</span>
                    ) : (
                        <>
                            <Check size={16} />
                            <span>À jour</span>
                        </>
                    )}
                </div>
            </div>
            <div className="flex-1 relative">
                <textarea 
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    className="w-full h-full p-4 resize-none border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-inset focus:ring-purple-500/50 text-slate-700 dark:text-slate-200 leading-relaxed font-mono text-sm bg-white dark:bg-slate-950 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-600"
                    placeholder="Vous êtes un professeur..."
                />
            </div>
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <strong>Note :</strong> La sauvegarde est également automatique ici.
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
