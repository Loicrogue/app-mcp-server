export interface McpServerEntry {
  id: string;
  url: string;
  description: string;
  tools: string[];
}

// ⚠️ CORE_BASE_URL : URL de base du serveur MCP déployé.
// Copier la valeur de `custom.mcpServerUrl` (amplify_outputs.json), sans le "/mcp".
const CORE_BASE_URL = "https://gyxriftctnqoh6cotxncoxsrfy0wiqtm.lambda-url.eu-central-1.on.aws";

export const registry: { servers: McpServerEntry[] } = {
  servers: [
    {
      id: "mcp-server-core",
      url: `${CORE_BASE_URL}/mcp`,
      description: "Serveur MCP principal du projet",
      tools: ["Ping", "Registre des serveurs MCP"],
    },
    // Ajoute une entrée ici pour chaque nouveau serveur (ex: VoIP), une fois qu'il existe.
  ],
};