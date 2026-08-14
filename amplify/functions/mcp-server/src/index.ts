import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { RequestHandler } from "express";
import { z } from "zod";
import { registry } from "./registry.js";
import { verifyAccessToken } from "./auth.js";
import { getAuthRouter } from "./oauth.js";
import { MCP_ORIGIN, MCP_SERVER_URL } from "./config.js";

// Crée une instance neuve du serveur MCP à chaque appel.
// Mode stateless : chaque requête HTTP doit repartir d'un
// serveur propre plutôt que de réutiliser un état partagé
// entre deux appels différents.
function registryPayload() {
  return JSON.stringify(registry, null, 2);
}

function buildServer() {
  const server = new McpServer({ name: "mcp_server", version: "1.0.0" });

  server.registerTool(
    "ping",
    {
      title: "ping",
      description: "Renvoie pong, accompagné du message, pour vérifier que le serveur répond",
      inputSchema: { message: z.string().optional() },
    },
    async ({ message }) => ({
      content: [{ type: "text", text: `pong: ${message ?? "ok"}` }],
    })
  );

  server.registerTool(
    "get-servers-registry",
    {
      title: "get-servers-registry",
      description: "Renvoie la liste des serveurs MCP disponibles et de leurs outils",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: registryPayload() }],
    })
  );

  server.registerResource(
    "servers-registry",
    "registry://servers", // URI arbitraire : sert d'identifiant unique pour cette ressource
    {
      title: "servers-registry",
      description: "Liste des serveurs MCP disponibles et de leurs outils",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: registryPayload() }],
    })
  );

  return server;
}

const app = express();
app.use(express.json());

// CORS : autorise les requêtes cross-origin depuis localhost (React dev) et
// tout autre origin. Les pré-requêtes OPTIONS sont traitées ici directement
// par Express, et en complément au niveau du Function URL (backend.ts).
// GET sert les métadonnées OAuth et la redirection /authorize.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Métadonnée Protected Resource (RFC 9728) à la racine, en plus de la forme
// cheminée sous /.well-known/oauth-protected-resource/mcp servie par le SDK.
app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: MCP_SERVER_URL,
    authorization_servers: [MCP_ORIGIN],
    scopes_supported: ["openid", "email", "profile"],
    resource_name: "Serveur MCP",
  });
});

// Health check utilisé par le readiness probe du Lambda Web Adapter
// (AWS_LWA_READINESS_CHECK_PATH) : sans lui, la première requête d'une
// instance froide arrive avant que le serveur écoute sur son port et
// reçoit un 502 "connection refused" du Function URL.
app.get("/health", (_req, res) => {
  res.sendStatus(200);
});

// Routeur OAuth : /.well-known/oauth-authorization-server,
// /.well-known/oauth-protected-resource/mcp, /authorize et /token.
// Le discovery Cognito est résolu avant la première requête (promesse unique).
const authRouterMiddleware: RequestHandler = (req, res, next) => {
  getAuthRouter()
    .then((router) => router(req, res, next))
    .catch((err: unknown) => {
      console.error("[oauth] routeur indisponible :", err);
      res.status(500).json({ error: "server_error" });
    });
};
app.use(authRouterMiddleware);

// Tout le endpoint /mcp exige un Bearer token Cognito valide (access token du
// front, ou token émis via le flux OAuth Claude). Les 401 portent l'en-tête
// WWW-Authenticate qui déclenche la découverte OAuth côté client.
const mcpAuth = requireBearerAuth({
  verifier: { verifyAccessToken },
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(
    new URL(MCP_SERVER_URL)
  ),
});

// Mode stateless : pas de session à maintenir entre deux appels.
// C'est le mode recommandé pour Lambda, car chaque invocation Lambda
// peut partir sur une instance différente.
app.post("/mcp", mcpAuth, async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}/mcp`);
});
