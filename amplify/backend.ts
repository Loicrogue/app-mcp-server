import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { mcpServerFunction } from './functions/mcp-server/resource';
import { Function, FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { Stack } from 'aws-cdk-lib';
import {
  OAuthScope,
  UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';

const backend = defineBackend({
  auth,
  data,
  mcpServerFunction,
});

// Contournement Cognito : les attributs d'un UserPool sont figés après
// création (email requis, etc.). CloudFormation renvoie le bloc `Schema`
// à chaque mise à jour du pool, ce que Cognito rejette (Invalid
// AttributeDataType). On retire `Schema` du template CFN : les pools
// existants conservent leur schéma en place (mise à jour MFA / SSO sans
// recréation), et les nouveaux pools utilisent le schéma d'origine.
const cfnUserPool = backend.auth.resources.cfnResources.cfnUserPool;
cfnUserPool.addPropertyDeletionOverride('Schema');

// Client OAuth dédié au connecteur Claude : client public (pas de secret),
// authorization code + PKCE, callbacks de redirection Claude. C'est le
// `client_id` que l'on renseigne dans les réglages avancés du connecteur.
const claudeClient = backend.auth.resources.userPool.addClient('claude-mcp', {
  userPoolClientName: 'claude-mcp',
  generateSecret: false,
  oAuth: {
    flows: { authorizationCodeGrant: true },
    scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
    callbackUrls: [
      'https://claude.ai/api/mcp/auth_callback',
      'https://claude.com/api/mcp/auth_callback',
    ],
  },
  supportedIdentityProviders: [
    UserPoolClientIdentityProvider.COGNITO,
    UserPoolClientIdentityProvider.GOOGLE,
  ],
  enableTokenRevocation: true,
  preventUserExistenceErrors: true,
});

// Variables d'environnement injectées dans la Lambda MCP : identité du pool
// pour la validation JWKS, et audiences acceptées (client web + client Claude).
const mcpLambda = backend.mcpServerFunction.resources.lambda as Function;
mcpLambda.addEnvironment('COGNITO_REGION', Stack.of(mcpLambda).region);
mcpLambda.addEnvironment('COGNITO_POOL_ID', backend.auth.resources.userPool.userPoolId);
mcpLambda.addEnvironment(
  'WEB_CLIENT_ID',
  backend.auth.resources.userPoolClient.userPoolClientId
);
mcpLambda.addEnvironment('CLAUDE_CLIENT_ID', claudeClient.userPoolClientId);

// Readiness probe du Lambda Web Adapter : sans lui, la première requête
// d'une instance froide arrive avant que l'application écoute sur son port
// et reçoit un 502 "connection refused" du Function URL (voir /health dans
// amplify/functions/mcp-server/src/index.ts).
mcpLambda.addEnvironment('AWS_LWA_READINESS_CHECK_PATH', '/health');
mcpLambda.addEnvironment('AWS_LWA_READINESS_CHECK_DELAY', '500');
mcpLambda.addEnvironment('AWS_LWA_READINESS_CHECK_TIMEOUT', '30000');

// ⚠️ NONE = accès public sans authentification au niveau du Function URL :
// la validation d'accès se fait dans la Lambda (Bearer token Cognito), ce
// qui permet au connecteur Claude de passer par le flux OAuth décrit dans
// amplify/functions/mcp-server/src/oauth.ts.
//
// CORS : Amplify configure par défaut le gateway avec les seuls en-têtes
// Content-Type/Accept — le navigateur rejetterait le preflight d'une requête
// portant un Authorization header ("Failed to fetch"). Authorization est
// donc ajouté aux en-têtes autorisés. Attention : l'API Lambda limite chaque
// membre de AllowMethods à 6 caractères — "OPTIONS" (7) fait échouer la
// validation ("Member must have length less than or equal to 6") ; on
// utilise donc le joker "*" pour autoriser toutes les méthodes.
const mcpFunctionUrl = mcpLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ['*'],
    allowedMethods: ['*'] as HttpMethod[],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  },
});

backend.addOutput({
  custom: {
    mcpServerUrl: mcpFunctionUrl.url,
    claudeClientId: claudeClient.userPoolClientId,
  },
});
