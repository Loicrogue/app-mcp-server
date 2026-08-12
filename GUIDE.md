# GUIDE - Serveur MCP avec Amplify (Gen 2) + Interface React

Guide pas-à-pas destiné à un stagiaire. Chaque section est **indépendante** et
reprend une étape réelle du projet : on copie, on lance les commandes, on
vérifie.

> Ce projet recopie le code d'un prototype existant (`mcp_server` +
> `mcp-server-amplify`), puis lui ajoute une **interface web React**. Le
> prototype n'est pas modifié : c'est une base propre où les étapes sont
> volontairement séparées.

---

## Sommaire du projet

```
app-mcp-server/
├── src/                        # Frontend React (l'interface graphique)
│   ├── awsConfig.js            # Amplify.configure + URL du serveur MCP
│   ├── mcp.js                  # Client JSON-RPC vers le serveur MCP
│   ├── App.js                  # Écran principal (état de connexion + onglets)
│   ├── amplify_outputs.json    # ⚠️ généré par le déploiement (Étape 6)
│   └── components/
│       ├── Login.js            # Connexion / inscription Cognito
│       ├── Catalogue.js        # Liste des serveurs MCP + outils
│       └── TestConsole.js      # Console d'appel de l'outil "ping"
├── amplify/                    # Backend Amplify Gen 2 (défini en code)
│   ├── backend.ts              # Assemble auth + data + fonction MCP + URL Lambda
│   ├── auth/resource.ts        # Cognito (login email + mot de passe)
│   ├── data/resource.ts        # Base de données AppSync (modèle Todo)
│   └── functions/mcp-server/   # La Lambda qui héberge le serveur MCP
│       ├── resource.ts         # Config CDK de la Lambda + Lambda Web Adapter
│       ├── run.sh              # Point d'entrée exécuté dans la Lambda
│       └── src/                # Code TypeScript du serveur MCP
│           ├── index.ts        # Serveur Express + SDK MCP (endpoint /mcp)
│           └── registry.ts     # Registre des serveurs MCP
├── package.json                # Dépendances React + Amplify
└── amplify_outputs.json        # ⚠️ généré par le déploiement (Étape 6)
```

---

## Étape 0 - Prérequis

| Outil | Rôle | Vérifier |
|-------|------|----------|
| Node.js (LTS ≥ 20) | Exécute npm / React | `node --version` |
| npm | Gestionnaire de paquets | `npm --version` |
| Compte AWS | Héberge le backend (Lambda, Cognito, AppSync) | -- |
| Profil AWS configuré | Permet de déployer | voir ci-dessous |

### ⚠️ Ne pas installer le CLI Amplify « Gen 1 »
Le CLI historique (`@aws-amplify/cli`) est en **maintenance** et bloque la
création de nouveaux projets. On utilise le nouveau CLI **Gen 2**, fourni comme
paquet npm : `@aws-amplify/backend-cli` (commande `npx amplify`).

Vérifie que le CLI Gen 1 n'est pas installé :

```
npm uninstall -g @aws-amplify/cli
```

### Profil AWS
Amplify Gen 2 lit tes identifiants dans `~/.aws/credentials` (profil nommé,
ex. `lhoarau`) et la région dans `~/.aws/config` :

```
[profile lhoarau]
region=eu-central-1
```

> **Permissions** : le déploiement crée des ressources AWS (CloudFormation,
> Lambda, S3, Cognito, AppSync, IAM…). Le profil doit avoir des droits
> suffisants (rôle admin de dev conseillé). Si tu obtiens un `AccessDenied`
> pendant le déploiement, c'est ici qu'il faut regarder.

---

## Étape 1 - Créer le projet React

```
npx create-react-app app-mcp-server
cd app-mcp-server
```

> Si le dossier existe déjà (avec un `package.json`), rien à refaire.

---

## Étape 2 - Récupérer le code MCP (source)

Le serveur MCP est un petit serveur HTTP qui implémente le protocole **Model
Context Protocol** (JSON-RPC sur `POST /mcp`). On copie sa **source** TypeScript
depuis `prototype/mcp_server/src/` :

```
amplify/functions/mcp-server/src/index.ts
amplify/functions/mcp-server/src/registry.ts
```

Ajoute aussi le `tsconfig.json` (compilation → dossier `build`) et le
`package.json` de la fonction (dépendances `@modelcontextprotocol/sdk`,
`express`, `zod`).

> Point clé du code : **mode stateless**. Chaque requête HTTP crée une
> **nouvelle** instance du serveur MCP (`streamableHttp` avec
> `sessionIdGenerator: undefined`). C'est ce qui permet de tourner dans une
> **Lambda**, où chaque invocation peut partir sur une instance différente.

---

## Étape 3 - Créer le backend Amplify (définition en code)

### `amplify/auth/resource.ts` - connexion Cognito
```ts
import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: {},   // email + mot de passe : le niveau le plus simple
  },
});
```
> L'API `defineAuth` ne propose plus de champ « username » séparé : l'**email**
> sert d'identifiant. Le **SSO (Google / GitHub)** s'ajoutera plus tard via
> `externalProviders` (voir Étape 10).

### `amplify/data/resource.ts` - base de données
```ts
import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Todo: a.model({ content: a.string() })
    .authorization((allow) => [allow.guest()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'identityPool' },
});
```

### `amplify/backend.ts` - assemble tout + expose l'URL du MCP
```ts
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { mcpServerFunction } from './functions/mcp-server/resource';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';

const backend = defineBackend({ auth, data, mcpServerFunction });

// ⚠️ NONE = accès public (pour tester). À sécuriser avant la prod.
const mcpFunctionUrl = backend.mcpServerFunction.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

backend.addOutput({ custom: { mcpServerUrl: mcpFunctionUrl.url } });
```
Le backend écrit donc l'URL de la Lambda MCP dans `amplify_outputs.json`, sous
`custom.mcpServerUrl`.

### La fonction MCP (`amplify/functions/mcp-server/resource.ts`)
Reprend la configuration du prototype :
- Lambda **Node 24** + **Lambda Web Adapter** (la couche transforme la requête
  HTTP entrante en appel au petit serveur web lancé dans la Lambda) ;
- `run.sh` : script de démarrage → `exec node build/index.js` ;
- **bundling « local »** : on copie le dossier entier (donc `build/` +
  `node_modules`) dans l'asset de la Lambda. La fonction est ainsi autonome.

---

## Étape 4 - Ajouter les dépendances du projet

Dans le `package.json` **racine** :

```jsonc
"dependencies": { "aws-amplify": "^6.19.0" },
"devDependencies": {
  "@aws-amplify/backend": "^1.23.0",
  "@aws-amplify/backend-cli": "^1.8.3",
  "aws-cdk-lib": "^2.244.0",
  "constructs": "^10.7.1",
  "typescript": "^5.9.3",
  "tsx": "^4.23.1",
  "esbuild": "^0.28.1"
}
```

Puis :
```
npm install
```

> Un warning de type `peer dependency typescript… invalid` lié à
> `react-scripts` est **normal** (frontend en JavaScript) : on continue.

---

## Étape 5 - Compiler le serveur MCP

```
cd amplify/functions/mcp-server
npm install
npm run build      # génère build/ (index.js + registry.js)
cd ../..
```
> Le dossier `build/` est **ce qu'embarque la Lambda**. À régénérer après
> chaque modification de `src/` (et à re-déployer, cf. Étape 7).

---

## Étape 6 - Déployer le backend (dev) et générer les outputs

Le CLI Gen 2 crée un environnement **sandbox** et génère `amplify_outputs.json` :

```
npx amplify sandbox --once --profile lhoarau --outputs-format json --outputs-out-dir ./src
```

- `--once` : un seul déploiement puis arrêt (pas de mode « watch ») ;
- `--outputs-out-dir ./src` : écrit **directement**
  `src/amplify_outputs.json`, fichier importé par l'app React (CRA n'autorise
  les imports que dans `src/`).

Vérifie le message **« Deployment completed »** et l'apparition du fichier.
Au premier déploiement, c'est aussi ici qu'apparaît le message
« Adding backend environment dev to AWS Amplify app ».

> `amplify_outputs.json` contient les identifiants des ressources déployées
> (pas de secret). Il est **ignoré par git** mais indispensable à l'app : sur
> une nouvelle machine, relance simplement cette commande.

---

## Étape 7 - Mettre à jour l'URL du serveur dans le registre

Ouvre `amplify_outputs.json` et lis :

```json
"custom": { "mcpServerUrl": "https://…lambda-url…/" }
```

Puis ouvre `amplify/functions/mcp-server/src/registry.ts` et remplace la
constante :

```ts
const CORE_BASE_URL = "https://…lambda-url…"; // sans le /mcp final
```

Relance le build puis le déploiement :

```
cd amplify/functions/mcp-server
npm run build
cd ../..
npx amplify sandbox --once --profile lhoarau --outputs-format json --outputs-out-dir ./src
```

> C'est la seule URL référencée en dur : le serveur se décrit lui-même dans sa
> ressource « Registre des serveurs ».

---

## Étape 8 - L'interface React

### Configurer Amplify au démarrage
`src/awsConfig.js` :
```js
import { Amplify } from 'aws-amplify';
import outputs from './amplify_outputs.json';

Amplify.configure(outputs);

const baseUrl = (outputs.custom?.mcpServerUrl ?? '').replace(/\/+$/, '');
export const MCP_SERVER_URL = `${baseUrl}/mcp`;
```

### Authentification Cognito
- `src/App.js` récupère l'état de connexion via `getCurrentUser()` /
  `signOut()` et écoute les événements Amplify (`Hub`).
- Sans compte, `src/components/Login.js` propose **Se connecter / S'inscrire**.
  À l'inscription, Cognito envoie un **code par email** à confirmer :
  `signUp` → `confirmSignUp` → `signIn`.

### Interroger le serveur MCP
`src/mcp.js` est un client **JSON-RPC** : il envoie `initialize` puis la méthode
demandée (`tools/list`, `resources/read`, `tools/call`…), et décode la réponse
**Server-Sent Events** (lignes `data: {…}`).

---

## Étape 9 - Lancer et vérifier

```
npm start
```
Ouvre http://localhost:3000 puis :
1. **S'inscrire** avec un email + mot de passe (≥ 8 caractères, une majuscule,
   un chiffre, un symbole).
2. Saisir le **code** reçu par email pour valider le compte.
3. Se connecter.
4. Onglet **Catalogue** : le serveur `mcp-server` et son outil `ping` s'affichent.
5. Onglet **Console de test** : envoyer un « ping » → réponse `pong: …`.

Pour contrôler le backend sans le front, l'équivalent en `curl` :
```
curl -X POST "https://<URL_LAMBDA>/mcp" \
  -H "Content-Type: application/json" -H "Accept: text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

---

## Étape 10 - Sécurisation (à faire avant la mise en production)

À ce stade, l'URL de la Lambda MCP est **publique** (`FunctionUrlAuthType.NONE`)
pour la phase de test. Avant toute mise en production :

1. **Protéger l'endpoint MCP** : passer le Function URL de `NONE` → `AWS_IAM`
   (les clients doivent être authentifiés) et restreindre les actions IAM.
2. **SSO (Google / GitHub)** : compléter `loginWith` dans `auth/resource.ts`
   avec `externalProviders` (OAuth des fournisseurs) + configuration des
   redirections.
3. **Règles de données** : `data/resource.ts` autorise ici tout le monde en
   `guest` → restreindre aux utilisateurs connectés (ex. `allow.authenticated()`).

---

## Dépannage

**Message « Adding backend environment dev to AWS Amplify app »**
C'est la sortie normale du premier `npx amplify sandbox` : l'environnement de
déploiement « dev » est en train d'être créé. Vérifie que `amplify_outputs.json`
est généré à la fin.

**Échec de déploiement : `Circular dependency between resources`**
Cela arrive si le backend injecte l'URL de la Function URL dans une variable
d'environnement de la Lambda (Lambda → FunctionUrl → Lambda = boucle). On évite
donc d'injecter `mcpFunctionUrl.url` dans la Lambda ; l'URL vit dans
`registry.ts` (Étape 7).

**Échec : `AccessDenied` / `not authorized`**
Permissions IAM du profil AWS insuffisantes (voir Étape 0).

**Après une modification du serveur MCP, le résultat en ligne ne change pas**
N'oublie pas : `npm run build` dans `amplify/functions/mcp-server`, puis
redéploie avec `npx amplify sandbox --once …`.

**L'app ne trouve pas `amplify_outputs.json`**
Relance la commande de l'Étape 6 (le fichier est ignoré par git).

---

*Fin du guide. Chaque étape est reproductible isolément ; pense à régénérer
`src/amplify_outputs.json` et le registre à chaque redéploiement.*
