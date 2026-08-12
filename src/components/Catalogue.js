import { useEffect, useState } from 'react';
import {
  mcpInitialize,
  mcpListTools,
  mcpListResources,
  mcpReadResource,
} from '../mcp';
import { MCP_SERVER_URL } from '../awsConfig';

// Affiche la liste des serveurs MCP enregistrés (ressource "registre serv").
export default function Catalogue() {
  const [tools, setTools] = useState([]);
  const [servers, setServers] = useState([]);
  const [state, setState] = useState('loading'); // loading | ok | error
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        await mcpInitialize();
        const toolsResult = await mcpListTools();
        const resourcesResult = await mcpListResources();

        const coreResource = resourcesResult.resources?.find(
          (r) => r.uri === 'registry://servers'
        );

        let registry = null;
        if (coreResource) {
          const read = await mcpReadResource(coreResource.uri);
          registry = JSON.parse(read.contents[0].text);
        }

        setTools(toolsResult.tools ?? []);
        setServers(registry?.servers ?? []);
        setState('ok');
      } catch (err) {
        setError(err.message ?? String(err));
        setState('error');
      }
    })();
  }, []);

  if (state === 'loading') return <p>Chargement du catalogue…</p>;
  if (state === 'error') return <p className="error">Erreur : {error}</p>;

  return (
    <div>
      <h2>Catalogue des serveurs MCP</h2>
      <p className="muted">Endpoint interrogé : <code>{MCP_SERVER_URL}</code></p>

      <section>
        <h3>Serveurs</h3>
        {servers.length === 0 && <p className="muted">Aucun serveur enregistré.</p>}
        <ul className="list">
          {servers.map((s) => (
            <li key={s.id}>
              <strong>{s.id}</strong> - <span className="muted">{s.description}</span>
              <div className="muted">URL : <code>{s.url}</code></div>
              {s.tools?.length > 0 && (
                <div className="muted">Outils : {s.tools.join(', ')}</div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Outils disponibles sur ce serveur</h3>
        {tools.length === 0 && <p className="muted">Aucun outil.</p>}
        <ul className="list">
          {tools.map((t) => (
            <li key={t.name}>
              <strong>{t.name}</strong> - <span className="muted">{t.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}