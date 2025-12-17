// ... (début de la fonction connect inchangé)

      // 1. On établit la connexion
      const session = await aiClientRef.current.live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          responseModalities: "AUDIO" as any,
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
            onmessage: (msg: LiveServerMessage) => {
                processServerMessage(msg);
            },
            onerror: (e) => {
                console.error("⚠️ [ERREUR] Session error", e);
                setStatus('error');
            }
        }
      });

      // 2. ON SAUVEGARDE LA SESSION (C'est là que ça plantait avant)
      currentSessionRef.current = session;
      
      // 3. LE PING DE RÉVEIL (Maintenant c'est sûr, la session existe !)
      console.log("📨 [TEST] Envoi du message texte 'Bonjour' pour forcer l'audio...");
      await session.send({
          parts: [{ text: "Bonjour ! Confirme-moi que tu m'entends." }],
          endOfTurn: true
      });

      // 4. On active le micro
      await startAudioInput();

    } catch (error) {
      console.error('Connection failed:', error);
      setStatus('error');
      disconnect();
    }
  };
