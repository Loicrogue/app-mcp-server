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
│       ├── Login.js            # Connexion / inscription (email, Google) + TOTP
│       ├── Catalogue.js        # Liste des serveurs MCP + outils
│       ├── TestConsole.js      # Console d'appel de l'outil "ping"
│       └── Security.js         # Sécurité : activation du MFA TOTP (QR code)
├── amplify/                    # Backend Amplify Gen 2 (défini en code)
│   ├── backend.ts              # Assemble auth + data + fonction MCP + URL Lambda
│   ├── auth/resource.ts        # Cognito (email/mdp, SSO Google, MFA TOTP)
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
> sert d'identifiant. Le **SSO Google** et le **MFA TOTP** s'ajoutent via
> `externalProviders` et `multifactor` (voir Étape 10).

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
6. Onglet **Sécurité** : activer le MFA TOTP (Étape 10) et tester le SSO Google.

Pour contrôler le backend sans le front, l'équivalent en `curl` :
```
curl -X POST "https://<URL_LAMBDA>/mcp" \
  -H "Content-Type: application/json" -H "Accept: text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

---

## Étape 10 - SSO Google + MFA TOTP

La connexion `email + mot de passe` fonctionne, mais un vrai projet ajoute :
- le **SSO Google** (se connecter avec son compte Google) ;
- le **MFA TOTP** optionnel (application d'authentification type Google
  Authenticator, Authy, 1Password…).

> **Pourquoi Google et pas GitHub ?** Google est un fournisseur **nativement
> supporté** par Cognito. GitHub, lui, ne propose que de l'OAuth2 (pas
> d'endpoint OIDC) : le brancher exigerait un **wrapper OIDC maison** (une
> Lambda qui traduit l'OAuth GitHub en OIDC pour Cognito). C'est un chantier à
> part, à étudier plus tard si besoin.

### 1) Créer l'application OAuth côté Google
1. [Google Cloud Console](https://console.cloud.google.com/) → créer un projet.
2. « API et services » → « **Écran de consentement OAuth** » → type **Externe**
   (mode *Testing* pour les tests) → renseigner l'adresse email.
3. « Identifiants » → « Créer des identifiants » → **ID de client OAuth** →
   *Application Web* → récupérer le **Client ID** et le **Secret client**.

### 2) Stocker les secrets (jamais en clair dans le code)

Depuis `backend-cli` ≥ 1.5, la commande `ampx secret set` a été déplacée sous
le périmètre sandbox. Pour l'**environnement sandbox local** :
```bash
npx ampx sandbox secret set GOOGLE_CLIENT_ID --profile lhoarau
npx ampx sandbox secret set GOOGLE_CLIENT_SECRET --profile lhoarau
```
(Il saisit la valeur puis la range dans SSM sous
`/amplify/<namespace>/<name>-sandbox-<hash>/GOOGLE_CLIENT_ID`.)

Pour la **branche git déployée par Amplify Hosting**, le paramètre SSM suit le
« backend identifier » de la branche :
`/amplify/<APP_ID>/<BRANCHE>-branch-<hash>/GOOGLE_CLIENT_ID` (le `hash` est
calculé par Amplify ; le chemin exact s'obtient avec la lib
`@aws-amplify/backend-secret`, `ParameterPathConversions.toParameterFullPath`).
```bash
aws ssm put-parameter --name /amplify/<APP_ID>/<BRANCHE>-branch-<hash>/GOOGLE_CLIENT_ID \
  --value <CLIENT_ID> --type SecureString --region eu-central-1 --profile lhoarau
aws ssm put-parameter --name /amplify/<APP_ID>/<BRANCHE>-branch-<hash>/GOOGLE_CLIENT_SECRET \
  --value <CLIENT_SECRET> --type SecureString --region eu-central-1 --profile lhoarau
```
> `defineAuth` lit ces valeurs via `secret('GOOGLE_CLIENT_ID')`. Si le secret
> n'existe pas au moment du déploiement, **le déploiement échoue**.

### 3) Configurer le backend (`amplify/auth/resource.ts`)
```ts
import { defineAuth, secret } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: {},
    externalProviders: {
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'),
        clientSecret: secret('GOOGLE_CLIENT_SECRET'),
        scopes: ['profile', 'email'],   // 'email' est indispensable : sans ce
                                        // scope Google ne renvoie pas l'email
                                        // à Cognito → « attributes required »
      },
      callbackUrls: [
        'http://localhost:3000/',
        'https://<VOTRE_APP>.amplifyapp.com/',   // site déployé
      ],
      logoutUrls: [
        'http://localhost:3000/',
        'https://<VOTRE_APP>.amplifyapp.com/',
      ],
    },
  },
  multifactor: {
    mode: 'OPTIONAL',   // OPTIONAL = chacun active ou non
    totp: true,         // TOTP seul : pas de sender SMS/email à configurer
  },
});
```

### 4) ⚠️ Contournement Cognito : mise à jour du pool sans le recréer

Cognito **fige les attributs d'un UserPool après création** (email requis,
etc.). Or Amplify re-déclare le bloc `Schema` du pool à chaque déploiement :
CloudFormation renvoie alors ce schéma à Cognito, qui le rejette avec
`Invalid AttributeDataType input` — **même si le schéma n'a pas changé**. Sans
correction, la seule issue proposée par Amplify est de **recréer le pool**
(donc de perdre les utilisateurs).

Pour mettre à jour un pool existant **en conservant ses utilisateurs**
(MFA, SSO…), on retire `Schema` du template CFN dans `amplify/backend.ts`
après `defineBackend` :
```ts
const cfnUserPool = backend.auth.resources.cfnResources.cfnUserPool;
cfnUserPool.addPropertyDeletionOverride('Schema');
```
Le pool garde le schéma déjà en place ; les nouveaux attributs/ressources
(MFA, Google IdP, domaine…) s'ajoutent sans toucher au schéma.

### 5) Déployer, puis autoriser la redirection chez Google
1. Déployer (sandbox, ou push pour Amplify Hosting) : Amplify crée alors le
   **domaine Cognito**.
2. Lire `amplify_outputs.json` → bloc `oauth.domain`, ex.
   `https://<préfixe>.auth.eu-central-1.amazoncognito.com`.
3. Dans Google Cloud Console (l'application OAuth du point 1), ajouter comme
   **URI de redirection autorisée** :
   ```
   https://<préfixe>.auth.eu-central-1.amazoncognito.com/oauth2/idpresponse
   ```
   (C'est le seul paramètre à corriger en cas d'erreur `redirect_uri_mismatch`.)

### 6) Frontend
- `src/components/Login.js` : bouton « Continuer avec Google » →
  `signInWithRedirect({ provider: 'Google' })`. Après un `signIn` classique, le
  résultat expose `nextStep.signInStep` : si `CONFIRM_SIGN_IN_WITH_TOTP_CODE`,
  on affiche le champ de code puis `confirmSignIn({ challengeResponse })`.
- `src/components/Security.js` (onglet **Sécurité**) : le MFA se met en place
  en 3 appels Amplify :
  1. `setupTOTP()` → fournit une URI `otpauth://` affichée en **QR code**
     (paquet `qrcode.react`) ;
  2. `verifyTOTPSetup({ code })` → valide le code de l'app ;
  3. `updateMFAPreference({ totp: 'PREFERRED' })` → active réellement le TOTP.
  L'état courant se lit avec `fetchMFAPreference()`.

### 7) Vérifier
1. « Continuer avec Google » → redirection vers Google → retour dans l'app.
2. Onglet **Sécurité** → « Activer le TOTP » → scanner le QR dans une app
   d'authentification → saisir un code → TOTP actif.
3. Se déconnecter, se reconnecter : le code TOTP est demandé à la connexion.

---

## Étape 11 - Sécurisation restante (avant mise en production)

1. **Protéger l'endpoint MCP** : passer le Function URL de `NONE` → `AWS_IAM`
   (les clients doivent être authentifiés) et restreindre les actions IAM.
2. **Règles de données** : `data/resource.ts` autorise ici tout le monde en
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

**Google : erreur `redirect_uri_mismatch` au SSO**
L'URI de redirection autorisée chez Google doit être **exactement**
`https://<domaine>.auth.<région>.amazoncognito.com/oauth2/idpresponse`
(Étape 10.5). Si le domaine change après un redéploiement, mets à jour le
champ chez Google.

**Google : `error=invalid_request` `attributes required: [email]` au retour**
Cognito n'a pas réussi à récupérer l'email du compte Google. Cause la plus
fréquente : le scope `email` manque sur l'IdP → Google ne renvoie que le
`profile`. Vérifie la présence de `scopes: ['profile', 'email']` dans
`google` (Étape 10.3) puis redéploie. Cause alternative : l'adresse Google
n'est pas vérifiée chez Google.

**Le déploiement du backend échoue : « secret not found »**
Les secrets `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` doivent exister dans
SSM **avant** le déploiement (Étape 10.2). Pour la branche Amplify Hosting, le
chemin est `/amplify/<APP_ID>/<BRANCHE>-branch-<hash>/…`.

**Échec de déploiement : `Invalid AttributeDataType input`**
Cognito refuse tout retour du bloc `Schema` dans une mise à jour du pool.
Vérifie que le contournement de l'Étape 10.4 est bien présent dans
`amplify/backend.ts` (`addPropertyDeletionOverride('Schema')`), puis redéploie.

**`ampltificate_outputs` : « Deployment is currently in progress » bloqué**
Après un déploiement sandbox interrompu (process coupé), le stack peut rester
en `UPDATE_COMPLETE_CLEANUP_IN_PROGRESS` : CloudFormation ne peut ni produire
les outputs ni supprimer le stack. Il faut déclencher un **nouveau déploiement**
avec un changement réel et laisser le processus CLI vivre jusqu'au bout ; le
nettoyage reprend alors et les outputs se génèrent.

**Rafraîchir `src/amplify_outputs.json` après un déploiement**
```bash
# pour un stack sandbox :
npx ampx generate outputs --stack <NOM_DU_STACK> --profile lhoarau \
  --format json --outputs-version 1.5 --out-dir ./src
# pour la branche déployée par Amplify Hosting :
npx ampx generate outputs --app-id <APP_ID> --branch <BRANCHE> --profile lhoarau \
  --format json --outputs-version 1.5 --out-dir ./src
```

---

*Fin du guide. Chaque étape est reproductible isolément ; pense à régénérer
`src/amplify_outputs.json` et le registre à chaque redéploiement.*
