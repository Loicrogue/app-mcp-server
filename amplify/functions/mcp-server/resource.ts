import { defineFunction } from "@aws-amplify/backend";
import { Duration, Stack } from "aws-cdk-lib";
import { Code, Function, Runtime, LayerVersion } from "aws-cdk-lib/aws-lambda";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const functionDir = path.dirname(fileURLToPath(import.meta.url));

export const mcpServerFunction = defineFunction((scope) => {
  const stack = Stack.of(scope);

  return new Function(scope, "mcp-server", {
    runtime: Runtime.NODEJS_24_X,
    handler: "run.sh", // le Web Adapter attend un script de démarrage, pas un handler JS classique
    memorySize: 512,
    timeout: Duration.seconds(30),
    code: Code.fromAsset(functionDir, {
      bundling: {
        // Bundling "local" (pas de Docker) : on copie le dossier tel quel
        // et on force les droits d'exécution sur run.sh, indispensable
        // car généré depuis Windows.
        local: {
          tryBundle(outputDir: string) {
            fs.cpSync(functionDir, outputDir, { recursive: true });
            fs.chmodSync(path.join(outputDir, "run.sh"), 0o755);
            return true;
          },
        },
        image: Runtime.NODEJS_24_X.bundlingImage,
      },
    }),
    layers: [
      LayerVersion.fromLayerVersionArn(
        scope,
        "LambdaAdapterLayer",
        `arn:aws:lambda:${stack.region}:753240598075:layer:LambdaAdapterLayerX86:25`
      ),
    ],
    environment: {
      AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
      PORT: "3000",
      AWS_LWA_PORT: "3000",
    },
  });
});