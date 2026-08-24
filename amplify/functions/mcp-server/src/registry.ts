export interface McpServerEntry {
  id: string;
  url: string;
  description: string;
  tools: string[];
  ressources :  string[];
}

// ⚠️ CORE_BASE_URL : URL de base du serveur MCP déployé.
const CORE_BASE_URL = "https://gyxriftctnqoh6cotxncoxsrfy0wiqtm.lambda-url.eu-central-1.on.aws";

export const registry: { servers: McpServerEntry[] } = {
  servers: [
    {
      id: "mcp-server-core",
      url: `${CORE_BASE_URL}/mcp`,
      description: "Serveur MCP principal du projet",
      tools: ["ping", "get-servers-registry", "odoo-contact", "odoo-crm-activity-analysis"],
      ressources: ["registre des serveurs MCP"],
    },
    // Ajoute une entrée ici pour chaque nouveau serveur (ex: VoIP), une fois qu'il existe.
  ],
};