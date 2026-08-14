import { createRemoteJWKSet, jwtVerify } from "jose";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import {
  CLAUDE_CLIENT_ID,
  COGNITO_ISSUER,
  COGNITO_REGION,
  WEB_CLIENT_ID,
} from "./config.js";

// Vérifie la signature des tokens Cognito à partir du JWKS public du pool.
// Le set est rafraîchi automatiquement par jose (cache + revalidation).
const jwks = createRemoteJWKSet(
  new URL(`${COGNITO_ISSUER}/.well-known/jwks.json`)
);

// Audience acceptée pour les tokens du flux Claude : le paramètre RFC 8707
// `resource` fait pointer Cognito l'audience vers l'URL du serveur MCP.
function isMcpUrlAudience(aud: string) {
  try {
    const u = new URL(aud);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(`.lambda-url.${COGNITO_REGION}.on.aws`)
    );
  } catch {
    return false;
  }
}

// Vérifie un access token Cognito (issuer, signature, expiration, audience).
// Toute erreur de validation est traduite en InvalidTokenError : le middleware
// requireBearerAuth renvoie alors un 401 avec l'en-tête WWW-Authenticate.
export async function verifyAccessToken(token: string) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: COGNITO_ISSUER }));
  } catch (err) {
    throw new InvalidTokenError(
      `Token invalide : ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const audiences: string[] = Array.isArray(payload.aud)
    ? payload.aud
    : payload.aud
      ? [payload.aud]
      : [];
  const allowed = audiences.some(
    (a: string) =>
      a === WEB_CLIENT_ID || a === CLAUDE_CLIENT_ID || isMcpUrlAudience(a)
  );
  if (!allowed) {
    throw new InvalidTokenError("Token émis pour une audience inattendue");
  }

  return {
    token,
    clientId:
      typeof payload.client_id === "string" ? payload.client_id : "",
    scopes: typeof payload.scope === "string" ? payload.scope.split(" ") : [],
    expiresAt: payload.exp,
  };
}
