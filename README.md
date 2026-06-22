# Lumy

Lumy est un chatbot IA multi-modèles construit avec TanStack Start et shadcn/ui. Il combine une interface éditoriale complète, un historique synchronisé dans MySQL, une mémoire activable, le suivi du contexte et quatre passerelles de modèles : OpenRouter, Kilo Code, OpenCode et NVIDIA NIM.

## Fonctionnalités

- Réponses streamées en SSE avec arrêt de génération.
- Catalogue dynamique des modèles chatbot OpenRouter, Kilo Code, OpenCode et NVIDIA NIM : une entrée texte et une sortie uniquement textuelle sont requises, tandis que les entrées image, document ou audio restent admises. Les générateurs d’images ou d’audio, embeddings et rerankers sont exclus.
- « Lumy AI » choisit parmi tous les modèles compatibles ; « Lumy AI Free » utilise uniquement les modèles gratuits. Les deux modes basculent automatiquement de modèle ou de fournisseur en cas d’erreur, de limite ou d’absence de premier contenu après 12 secondes.
- Filtre indépendant par fournisseur — tous ou un fournisseur précis — et par tarif : tous ou gratuits.
- Prix, vitesse indicative et fenêtre de contexte par modèle.
- Comparaison des fenêtres de contexte dans le sélecteur et estimation de leur utilisation dans le panneau Contexte.
- Création de compte, connexion, session persistante, modification du profil et suppression complète du compte.
- Vérification obligatoire de l’adresse e-mail par lien à usage unique avant toute connexion, et nouvelle vérification lors d’un changement d’adresse.
- Indicateur de robustesse du mot de passe lors de l’inscription et du changement de mot de passe.
- Interface administrateur protégée par rôle pour consulter et gérer les utilisateurs, conversations, mémoires, fichiers et feedback, sans jamais exposer les clés API.
- Formulaire de feedback transmis aux administrateurs avec suivi du statut.
- Historique, mémoire et préférences isolés par utilisateur et synchronisés dans MySQL, avec cache local hors connexion.
- Mémoires activables et création de nouvelles mémoires.
- Mémorisation intelligente facultative : le modèle détecte les préférences, objectifs et contraintes durables, actualise les souvenirs existants et exclut les secrets ou données sensibles.
- Indicateur discret sur les réponses qui utilisent une mémoire, avec le détail des souvenirs employés dans une infobulle.
- Modification/suppression des mémoires et conversations épinglables.
- Fichiers réellement envoyés, stockés, téléchargés et supprimés ; les formats texte enrichissent le contexte du modèle.
- Recherche web intelligente et gratuite via DuckDuckGo : une fois autorisée, Lumy ne l’exécute que pour les demandes qui nécessitent des sources externes ou des informations actuelles.
- Réflexion adaptée au modèle : absente, automatique ou réglable, avec flux de raisonnement affiché séparément lorsqu’il est réellement transmis par le fournisseur.
- Temps du premier contenu, durée totale de réponse et durée de réflexion affichés sur chaque réponse ; l’historique réussi reste transmis après un changement de modèle.
- Thème clair, sombre ou synchronisé avec le système, appliqué instantanément sans animation de transition.
- Blocs de code formatés avec Prettier, coloration syntaxique, numéros de ligne, copie et téléchargement par fichier.
- Confirmations Lumy intégrées pour les conversations, mémoires, fichiers et données du compte.
- Images jointes validées et converties côté serveur en WebP optimisé avant stockage, puis transmises aux modèles multimodaux (5 images et 20 Mo cumulés maximum par requête).
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
APP_URL=http://localhost:3000
RESEND_API_KEY=
RESEND_FROM_EMAIL="Lumy AI <verification@example.com>"
DB_HOST=
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=
LUMY_WORKSPACE_ID=default
```

- OpenRouter : `https://openrouter.ai/api/v1/chat/completions`
- Kilo Code : `https://api.kilo.ai/api/gateway/chat/completions`
- OpenCode Zen : `https://opencode.ai/zen/v1/chat/completions`
- NVIDIA NIM : `https://integrate.api.nvidia.com/v1/chat/completions`

Sans clé, aucun modèle n’est affiché et l’envoi de messages reste désactivé. Lumy ne présente jamais de modèle ou de réponse de démonstration comme un résultat réel.

La création de comptes nécessite aussi `APP_URL`, `RESEND_API_KEY` et un expéditeur `RESEND_FROM_EMAIL` validé chez Resend. Les clés et paramètres de fournisseurs restent exclusivement dans `.env` et ne sont jamais exposés dans l’administration.

Le premier administrateur se crée côté serveur après configuration de l’e-mail :

```bash
npm run admin:create
```

La commande charge automatiquement `.env`, puis `.env.local`, et demande interactivement l’adresse du compte ainsi que son mot de passe. Ces deux valeurs sont enregistrées uniquement en base de données — le mot de passe sous forme hachée — et ne sont jamais ajoutées au `.env`. Un mot de passe fort peut aussi être généré automatiquement. Le compte reste inutilisable jusqu’à la validation du lien reçu par e-mail.

## Comptes et base de données

La connexion MySQL est ouverte uniquement côté serveur avec un pool `mysql2`. Les paramètres séparés `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` et `DB_PASSWORD` sont utilisés en priorité. Une variable `DATABASE_URL` au format `mysql://` ou `jdbc:mysql://` reste acceptée comme solution de repli lorsqu’aucun paramètre `DB_*` n’est défini. Au premier appel, Lumy crée automatiquement les tables décrites dans [`database/schema.sql`](database/schema.sql) : utilisateurs, sessions, état du chat et fichiers.

Les mots de passe sont hachés avec bcrypt (12 tours). Les jetons de session sont aléatoires, hachés en SHA-256 dans la base, transmis uniquement par cookie `HttpOnly` et supprimés à la déconnexion. Chaque état de chat est indexé par l’identifiant interne du compte.

Si MySQL devient temporairement indisponible, l’interface conserve l’état localement sans exposer de détails techniques dans l’espace de discussion.

### Routes principales

- `POST /api/auth/register`, `POST /api/auth/login`, `GET|DELETE /api/auth/session`
- `POST|PATCH /api/auth/email-verification`, `POST /api/feedback`
- `PATCH|DELETE /api/auth/account`
- `GET|PATCH|DELETE /api/admin` (administrateurs uniquement)
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
