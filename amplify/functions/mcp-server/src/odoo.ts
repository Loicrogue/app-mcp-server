// Appel de l'API publique JSON d'Odoo (https://www.odoo.com/documentation/16.0/developer/reference/external_api.html).
// Authentification par Bearer token (clé API Odoo), lue depuis la variable
// d'environnement ODOO_API_KEY. La valeur est un secret Amplify (SSM) injecté
// par backend.ts ; Amplify pose alors la variable AWS_AMPLIFY_SSM_ENV_PATH qui
// liste les variables à résoudre au runtime. Le shim de résolution n'étant
// injecté que pour les fonctions standard (pas pour notre Lambda custom),
// on la résout ici avec le SDK AWS (la politique IAM ssm:GetParameters est
// déjà accordée par Amplify lors du déploiement).
import {
  SSMClient,
  GetParametersCommand,
} from "@aws-sdk/client-ssm";

const ODOO_BASE_URL = "https://dattico.odoo.com/json/2";

export interface OdooSearchReadParams {
  domain: unknown[];
  fields: string[];
  limit: number;
}

// Résout les variables d'environnement issues de secrets Amplify (SSM) :
// lit AWS_AMPLIFY_SSM_ENV_PATH puis remplace les placeholders dans process.env.
async function resolveAmplifySecrets(): Promise<void> {
  const ssmEnvPath = process.env.AMPLIFY_SSM_ENV_CONFIG;
  if (!ssmEnvPath) return;

  const envConfig = JSON.parse(ssmEnvPath) as Record<
    string,
    { path: string; sharedPath: string }
  >;
  const names = Object.entries(envConfig)
    .filter(([key]) => process.env[key] === "<value will be resolved during runtime>")
    .flatMap(([, { path, sharedPath }]) => [path, sharedPath]);

  if (names.length === 0) return;

  const client = new SSMClient();
  const { Parameters } = await client.send(
    new GetParametersCommand({ Names: names, WithDecryption: true })
  );
  const resolved = new Map(
    (Parameters ?? [])
      .filter((p) => p.Value !== undefined)
      .map((p) => [p.Name ?? "", p.Value ?? ""])
  );

  for (const [key, { path, sharedPath }] of Object.entries(envConfig)) {
    const value = resolved.get(path) ?? resolved.get(sharedPath);
    if (value !== undefined) process.env[key] = value;
  }
}

let apiKeyPromise: Promise<string> | undefined;

async function getApiKey(): Promise<string> {
  if (!apiKeyPromise) {
    apiKeyPromise = resolveAmplifySecrets().then(() => {
      const apiKey = process.env.ODOO_API_KEY;
      if (!apiKey || apiKey.startsWith("<value will be resolved")) {
        throw new Error(
          "Variable ODOO_API_KEY absente : définissez le secret ODOO_API_KEY (npx ampx sandbox secret set ODOO_API_KEY) puis redéployez"
        );
      }
      return apiKey;
    });
  }
  return apiKeyPromise;
}

export async function odooSearchRead(
  model: string,
  params: OdooSearchReadParams
): Promise<unknown> {
  const apiKey = await getApiKey();

  const response = await fetch(`${ODOO_BASE_URL}/${model}/search_read`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Odoo ${model}/search_read a répondu HTTP ${response.status}${detail ? ` : ${detail}` : ""}`
    );
  }

  return response.json();
}