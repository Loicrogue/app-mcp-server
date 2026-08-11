import { Amplify } from 'aws-amplify';
import outputs from './amplify_outputs.json';

// Configure le SDK Amplify avec les ressources réellement déployées
// (fichier ampltude_outputs.json généré par `npx amplify sandbox`).
Amplify.configure(outputs);

// URL de base du serveur MCP déployé (sortie custom de amplify/backend.ts).
const baseUrl = (outputs.custom?.mcpServerUrl ?? '').replace(/\/+$/, '');
export const MCP_SERVER_URL = `${baseUrl}/mcp`;

export default outputs;