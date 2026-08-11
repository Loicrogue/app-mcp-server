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