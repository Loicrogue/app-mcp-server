import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { mcpServerFunction } from './functions/mcp-server/resource';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';

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

// ⚠️ NONE = accès public sans authentification, pour tester rapidement.
// À sécuriser avant toute vraie mise en prod (clé API / IAM / login Cognito)
const mcpFunctionUrl = backend.mcpServerFunction.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

backend.addOutput({
  custom: {
    mcpServerUrl: mcpFunctionUrl.url,
  },
});