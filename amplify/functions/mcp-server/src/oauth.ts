import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import {
  AccessDeniedError,
  InvalidClientError,
  InvalidGrantError,
  OAUTH_ERRORS,
  ServerError,
  TooManyRequestsError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { OAuthTokensSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { RequestHandler } from "express";
import { verifyAccessToken } from "./auth.js";
import {
  CLAUDE_CLIENT_ID,
  CLAUDE_REDIRECT_URIS,
  COGNITO_ISSUER,
  MCP_ORIGIN,
  MCP_SERVER_URL,
} from "./config.js";

// Le serveur MCP joue le rôle d'authorization server OAuth 2.1 auprès des
// clients (Claude) tout en déléguant la connexion utilisateur à Cognito :
// le flux browser est redirigé vers la hosted UI, et l'échange de code /
// rafraîchissement est transmis au token endpoint de Cognito (mode proxy
// pass-through, aucun état stocké dans la Lambda).
const COGNITO_DISCOVERY_URL = `${COGNITO_ISSUER}/.well-known/openid-configuration`;

async function getCognitoEndpoints() {
  const res = await fetch(COGNITO_DISCOVERY_URL);
  if (!res.ok) {
    throw new Error(`Découverte Cognito impossible (HTTP ${res.status})`);
  }
  const doc = await res.json();
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error("Découverte Cognito incomplète (endpoints manquants)");
  }
  return {
    authorizationUrl: doc.authorization_endpoint,
    tokenUrl: doc.token_endpoint,
  };
}

// Client OAuth pré-enregistré du connecteur Claude : client public (aucun
// secret), flux authorization code + PKCE, callbacks Claude. Le type
// OAuthClientInformationFull couvre ce que le SDK attend, complété des
// redirect_uris exigées par le routeur pour valider la redirection.
type ClaudeClientInfo = OAuthClientInformationFull & {
  redirect_uris: string[];
  client_name: string;
  grant_types: string[];
  token_endpoint_auth_method: "none";
};

async function getClient(
  clientId: string
): Promise<ClaudeClientInfo | undefined> {
  if (clientId !== CLAUDE_CLIENT_ID) {
    return undefined;
  }
  return {
    client_id: CLAUDE_CLIENT_ID,
    client_name: "claude-mcp",
    redirect_uris: CLAUDE_REDIRECT_URIS,
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

// Proxy pass-through vers Cognito, avec traduction des échecs de l'échange de
// code en erreurs OAuth conformes RFC 6749 (invalid_grant, ...) : le SDK
// renvoie sinon un générique 500 server_error pour toute réponse non-2xx.
class CognitoProxyProvider extends ProxyOAuthServerProvider {
  private readonly tokenUrl: string;

  constructor(
    endpoints: { authorizationUrl: string; tokenUrl: string },
    getClient: (clientId: string) => Promise<OAuthClientInformationFull | undefined>,
    verifyAccessToken: (token: string) => Promise<AuthInfo>
  ) {
    super({ endpoints, getClient, verifyAccessToken });
    this.tokenUrl = endpoints.tokenUrl;
  }

  private async requestTokens(params: URLSearchParams) {
    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!response.ok) {
      const upstream = await response.json().catch(() => null);
      const upstreamError: string = upstream?.error;
      const ErrorClass =
        (upstreamError && OAUTH_ERRORS[upstreamError]) ||
        (response.status === 400
          ? InvalidGrantError
          : response.status === 401
            ? InvalidClientError
            : response.status === 403
              ? AccessDeniedError
              : response.status === 429
                ? TooManyRequestsError
                : ServerError);
      const message =
        upstream?.error_description ||
        upstream?.message ||
        `Échec de l'échange avec le serveur d'identité (HTTP ${response.status})`;
      throw new ErrorClass(message);
    }
    const data = await response.json();
    return OAuthTokensSchema.parse(data);
  }

  override async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier: string,
    redirectUri: string,
    resource?: URL
  ) {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client.client_id,
      code: authorizationCode,
    });
    if (client.client_secret) params.append("client_secret", client.client_secret);
    if (codeVerifier) params.append("code_verifier", codeVerifier);
    if (redirectUri) params.append("redirect_uri", redirectUri);
    if (resource) params.append("resource", resource.href);
    return this.requestTokens(params);
  }

  override async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes: string[],
    resource?: URL
  ) {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: client.client_id,
      refresh_token: refreshToken,
    });
    if (client.client_secret) params.set("client_secret", client.client_secret);
    if (scopes?.length) params.set("scope", scopes.join(" "));
    if (resource) params.set("resource", resource.href);
    return this.requestTokens(params);
  }
}

// Construit le routeur OAuth (métadonnées + /authorize + /token). Le discovery
// Cognito est mémorisé : les instances Lambda successives ne refont l'appel
// qu'après un cold start.
let authRouterPromise: Promise<RequestHandler> | undefined;

export function getAuthRouter() {
  authRouterPromise ??= (async () => {
    const endpoints = await getCognitoEndpoints();
    const provider = new CognitoProxyProvider(endpoints, getClient, verifyAccessToken);
    return mcpAuthRouter({
      provider,
      issuerUrl: new URL(MCP_ORIGIN),
      resourceServerUrl: new URL(MCP_SERVER_URL),
      resourceName: "Serveur MCP",
      scopesSupported: ["openid", "email", "profile"],
      serviceDocumentationUrl: new URL(MCP_SERVER_URL),
    });
  })();
  return authRouterPromise;
}