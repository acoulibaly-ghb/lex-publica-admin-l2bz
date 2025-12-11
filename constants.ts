

export const DEFAULT_COURSE_CONTENT = `
TITRE : Introduction au Droit Administratif Français

I. LA DÉFINITION DU DROIT ADMINISTRATIF

Le droit administratif est la branche du droit public qui régit l'organisation, le fonctionnement et l'activité de l'administration publique, ainsi que les rapports entre l'administration et les particuliers.

A. Un droit autonome
L'arrêt Blanco (TC, 8 février 1873) est considéré comme la pierre angulaire du droit administratif. Il consacre l'autonomie du droit administratif par rapport au droit civil. La responsabilité de l'État ne peut être régie par les principes qui sont établis dans le Code civil pour les rapports de particulier à particulier.

B. Un droit jurisprudentiel
Bien que de nombreuses lois existent aujourd'hui, le rôle du juge administratif (Conseil d'État) a été historique dans la construction des grands principes (service public, responsabilité administrative, légalité).

II. LE SERVICE PUBLIC

La notion de service public est centrale. Elle désigne une activité d'intérêt général assurée par une personne publique ou par une personne privée sous le contrôle d'une personne publique.
Les "Lois de Rolland" définissent les principes de fonctionnement :
1. Continuité
2. Mutabilité (adaptation)
3. Égalité

III. LA POLICE ADMINISTRATIVE

La police administrative a pour but de prévenir les troubles à l'ordre public.
L'ordre public se compose traditionnellement de trois éléments (trilogie traditionnelle) :
1. La tranquillité publique
2. La sécurité publique
3. La salubrité publique
En 1959 (Arrêt Société Les Films Lutetia), la moralité publique a été ajoutée sous certaines conditions. Plus récemment, la dignité de la personne humaine (Arrêt Commune de Morsang-sur-Orge, 1995, affaire du lancer de nain).
`;

export const DEFAULT_SYSTEM_INSTRUCTION = `Vous êtes un Professeur de Droit Public assistant, expert et pédagogique.
Votre mission est d'aider les étudiants à réviser et comprendre le cours.

RÈGLES STRICTES :
1. Vos connaissances sont EXCLUSIVEMENT limitées au "CONTENU DU COURS" fourni.
2. Si une question porte sur un sujet non couvert par le texte du cours, répondez poliment : "Désolé, cette notion n'est pas abordée dans le cours fourni. Veuillez consulter le matériel de cours complet ou poser une question sur le contenu disponible."
3. Ne pas inventer de jurisprudence ou de lois si elles ne sont pas dans le texte.
4. Adoptez un ton universitaire, bienveillant et structuré.
5. Respectez scrupuleusement la structure du document (Titres, Parties). Si le contenu contient plusieurs cours distincts, identifiez le contexte spécifique de la question pour ne pas mélanger les notions entre différents cours.

CAPACITÉS SPÉCIFIQUES :
- Répondre aux questions de compréhension.
- Créer des QUIZ interactifs (une question à la fois).
- Créer des QCM (Question à Choix Multiples) avec correction détaillée.
- Créer des exercices "VRAI ou FAUX".
- Générer de courts "Cas Pratiques" pour tester l'application des connaissances.`;