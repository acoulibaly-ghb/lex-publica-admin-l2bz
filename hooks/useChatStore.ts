import React, { useState, useEffect } from 'react';
import { ChatSession, ChatMessage } from '../types';

const STORAGE_KEY = 'droit_public_sessions';

export const useChatStore = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Load from local storage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Revive dates
        const revived = parsed.map((s: any) => ({
          ...s,
          messages: s.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))
        }));
        setSessions(revived);
        if (revived.length > 0) {
          setActiveSessionId(revived[0].id);
        } else {
          createNewSession();
        }
      } catch (e) {
        console.error("Failed to parse sessions", e);
        createNewSession();
      }
    } else {
      createNewSession();
    }
  }, []);

  // Save to local storage whenever sessions change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  }, [sessions]);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: 'Nouvelle conversation',
      messages: [{
        role: 'model',
        text: "Bonjour ! Je suis **Ada**, votre assistante juridique **virtuelle**, spécialisée en droit administratif. Posez-moi une question sur le cours, ou demandez-moi de générer un Quiz ou un Cas Pratique.",
        timestamp: new Date()
      }],
      updatedAt: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    return newSession.id;
  };

  const deleteSession = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    
    if (activeSessionId === id) {
      if (newSessions.length > 0) {
        setActiveSessionId(newSessions[0].id);
      } else {
        createNewSession();
      }
    }
    
    // Explicit save for deletion to handle empty array case which useEffect might skip if logic differs
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSessions));
  };

  const renameSession = (id: string, newTitle: string) => {
    setSessions(prev => prev.map(s => 
      s.id === id ? { ...s, title: newTitle } : s
    ));
  };

  const addMessageToSession = (sessionId: string, message: ChatMessage) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        // Auto-rename logic: if it's the first user message and title is default
        let newTitle = s.title;
        if (s.messages.length === 1 && message.role === 'user' && s.title === 'Nouvelle conversation') {
           newTitle = message.text.slice(0, 30) + (message.text.length > 30 ? '...' : '');
        }
        
        return {
          ...s,
          title: newTitle,
          messages: [...s.messages, message],
          updatedAt: Date.now()
        };
      }
      return s;
    }).sort((a, b) => b.updatedAt - a.updatedAt)); // Move active to top
  };

  const getActiveSession = () => sessions.find(s => s.id === activeSessionId);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createNewSession,
    deleteSession,
    renameSession,
    addMessageToSession,
    activeSession: getActiveSession()
  };
};
