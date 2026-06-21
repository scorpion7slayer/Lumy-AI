# Lumy

Lumy est un chatbot IA multi-modèles construit avec TanStack Start et shadcn/ui. Il combine une interface éditoriale complète, un historique synchronisé dans MySQL, une mémoire activable, le suivi du contexte et quatre passerelles de modèles : OpenRouter, Kilo Code, OpenCode et NVIDIA NIM.

## Fonctionnalités

- Réponses streamées en SSE avec arrêt de génération.
- Catalogue complet des modèles texte OpenRouter, Kilo Code, OpenCode et NVIDIA NIM chargé dynamiquement ; les modèles image, audio, voix, embedding et reranking sont exclus.
- Modèle virtuel gratuit « Lumy AI » : il classe les modèles gratuits selon la demande et bascule automatiquement de modèle ou de fournisseur en cas de limite de débit ou d’indisponibilité temporaire.
- Filtre indépendant par fournisseur — tous ou un fournisseur précis — et par tarif : tous ou gratuits.
- Prix, vitesse indicative et fenêtre de contexte par modèle.
- Comparaison des fenêtres de contexte dans le sélecteur et estimation de leur utilisation dans le panneau Contexte.
- Création de compte, connexion, session persistante, modification du profil et suppression complète du compte.
- Historique, mémoire et préférences isolés par utilisateur et synchronisés dans MySQL, avec cache local hors connexion.
- Mémoires activables et création de nouvelles mémoires.
- Mémorisation intelligente facultative : le modèle détecte les préférences, objectifs et contraintes durables, actualise les souvenirs existants et exclut les secrets ou données sensibles.
- Indicateur discret sur les réponses qui utilisent une mémoire, avec le détail des souvenirs employés dans une infobulle.
- Modification/suppression des mémoires et conversations épinglables.
- Fichiers réellement envoyés, stockés, téléchargés et supprimés ; les formats texte enrichissent le contexte du modèle.
- Recherche web intelligente et gratuite via DuckDuckGo : une fois autorisée, Lumy ne l’exécute que pour les demandes qui nécessitent des sources externes ou des informations actuelles.
- Réflexion adaptée au modèle : absente, automatique ou réglable, avec flux de raisonnement affiché séparément lorsqu’il est réellement transmis par le fournisseur.
- Thème clair, sombre ou synchronisé avec le système.
- Blocs de code formatés avec Prettier, coloration syntaxique, numéros de ligne, copie et téléchargement par fichier.
- Confirmations Lumy intégrées pour les conversations, mémoires, fichiers et données du compte.
- Raccourcis `⌘ K` pour la palette et `⌘ N` pour une nouvelle discussion.
- Interface responsive : panneaux latéraux transformés en feuilles sur petit écran.
- Espace entièrement vierge à la création d’un compte, sans conversation, mémoire ou modèle fictif.

## Démarrage

```bash
npm install
cp .env.example .env.local
npm run dev
```

L’application est disponible sur [http://localhost:3000](http://localhost:3000).

## Fournisseurs

Les clés ne quittent jamais le serveur TanStack Start.

```env
OPENROUTER_API_KEY=
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_NAME=Lumy
KILO_API_KEY=
OPENCODE_API_KEY=
NVIDIA_API_KEY=
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
LUMY_WORKSPACE_ID=default
```

- OpenRouter : `https://openrouter.ai/api/v1/chat/completions`
- Kilo Code : `https://api.kilo.ai/api/gateway/chat/completions`
- OpenCode Zen : `https://opencode.ai/zen/v1/chat/completions`
- NVIDIA NIM : `https://integrate.api.nvidia.com/v1/chat/completions`

Sans clé, aucun modèle n’est affiché et l’envoi de messages reste désactivé. Lumy ne présente jamais de modèle ou de réponse de démonstration comme un résultat réel.

## Comptes et base de données

La connexion MySQL est ouverte uniquement côté serveur avec un pool `mysql2`. Au premier appel, Lumy crée automatiquement les tables décrites dans [`database/schema.sql`](database/schema.sql) : utilisateurs, sessions, état du chat et fichiers.

Les mots de passe sont hachés avec bcrypt (12 tours). Les jetons de session sont aléatoires, hachés en SHA-256 dans la base, transmis uniquement par cookie `HttpOnly` et supprimés à la déconnexion. Chaque état de chat est indexé par l’identifiant interne du compte.

Si MySQL devient temporairement indisponible, l’interface conserve l’état localement sans exposer de détails techniques dans l’espace de discussion.

### Routes principales

- `POST /api/auth/register`, `POST /api/auth/login`, `GET|DELETE /api/auth/session`
- `PATCH|DELETE /api/auth/account`
- `GET|PUT /api/state`
- `POST /api/files`, `GET|DELETE /api/files/:id`
- `POST /api/chat`, `GET /api/models`

## Vérifications

```bash
npm run typecheck
npm run lint
npm run build
```

Le visuel de référence et le design system extrait sont conservés dans [`design/reference-paper-intelligence.png`](design/reference-paper-intelligence.png) et [`DESIGN.md`](DESIGN.md).
