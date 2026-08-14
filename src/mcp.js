import { fetchAuthSession } from 'aws-amplify/auth';
import { MCP_SERVER_URL } from './awsConfig';

// Client JSON-RPC minimal pour le serveur MCP (mode stateless, transport HTTP).
// Chaque opération envoie d'abord `initialize` puis la méthode demandée,
// car le serveur n'est pas initialisé entre deux requêtes HTTP.
//
// Authentification : le serveur exige un Bearer token Cognito (access token
// de la session Amplify active). Un 401 signifie que la session est absente
// ou expirée : le serveur MCP n'est alors pas accessible.

async function postJsonRpc(method, params) {
  let token;
  try {
    ({ tokens: { accessToken: token } } = await fetchAuthSession());
  } catch (err) {
    throw new Error(
      `Session Amplify absente : ${err.message ?? 'utilisateur non connecté'}`
    );
  }

  const body = { jsonrpc: '2.0', id: 1, method, params };
  let res = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  // Un 502 peut arriver sur une instance Lambda froide (le serveur HTTP
  // interne n'écoute pas encore) : un seul retry suffit.
  if (res.status === 502) {
    res = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    const message =
      res.status === 401
        ? 'Non autorisé : connexion expirée, reconnectez-vous'
        : `Erreur HTTP ${res.status} : ${res.statusText}`;
    throw new Error(message);
  }

  const text = await res.text();
  const payload = parseSse(text);

  if (payload.error) {
    throw new Error(payload.error.message ?? 'Erreur inconnue du serveur MCP');
  }
  return payload.result;
}

// Le serveur répond en Server-Sent Events (lignes "data: {json}").
// En mode stateless, une seule donnée JSON par requête.
function parseSse(text) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      const json = trimmed.slice(5).trim();
      if (json) return JSON.parse(json);
    }
  }
  // Repli : réponse au format JSON simple.
  return JSON.parse(text);
}

export async function mcpInitialize() {
  return postJsonRpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'app-mcp-server-web', version: '1.0.0' },
  });
}

export async function mcpListTools() {
  await mcpInitialize();
  return postJsonRpc('tools/list', {});
}

export async function mcpCallTool(name, args) {
  await mcpInitialize();
  return postJsonRpc('tools/call', { name, arguments: args });
}

export async function mcpListResources() {
  await mcpInitialize();
  return postJsonRpc('resources/list', {});
}

export async function mcpReadResource(uri) {
  await mcpInitialize();
  return postJsonRpc('resources/read', { uri });
}