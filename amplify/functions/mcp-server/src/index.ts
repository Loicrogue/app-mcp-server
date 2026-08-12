import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { registry } from "./registry.js";

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
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Accept");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Mode stateless : pas de session à maintenir entre deux appels.
// C'est le mode recommandé pour Lambda, car chaque invocation Lambda
// peut partir sur une instance différente.
app.post("/mcp", async (req, res) => {
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