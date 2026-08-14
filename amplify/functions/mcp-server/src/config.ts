// Configuration runtime du serveur MCP sécurisé.
// MCP_SERVER_URL : URL canonique du serveur (RFC 8707), identique à
// `custom.mcpServerUrl` + "/mcp" (amplify_outputs.json). Référence en dur
// volontaire (même règle que registry.ts) : l'injecter via une variable
// d'environnement Lambda créerait une dépendance circulaire Lambda -> FunctionUrl.
export const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ??
  "https://wis2odctw35fd5rtqdtajeykea0uejjf.lambda-url.eu-central-1.on.aws/mcp";

export const MCP_ORIGIN = new URL(MCP_SERVER_URL).origin;

export const COGNITO_REGION = process.env.COGNITO_REGION ?? "eu-central-1";
export const COGNITO_POOL_ID = process.env.COGNITO_POOL_ID ?? "";

export const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}`;

export const WEB_CLIENT_ID = process.env.WEB_CLIENT_ID ?? "";
export const CLAUDE_CLIENT_ID = process.env.CLAUDE_CLIENT_ID ?? "";

// Callback de redirection du connecteur Claude (hosted surfaces : Claude.ai,
// Desktop, mobile, Cowork). Claude Code utilise des boucles locales : non
// supporté (Cognito exige des callback URLs exactes).
export const CLAUDE_REDIRECT_URIS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];
