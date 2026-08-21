import { useState, useEffect } from 'react';
import { mcpCallTool, mcpListTools } from '../mcp';

// Console de test : choix de l'outil MCP (liste de puces cliquables,
// description affichée au survol) puis appel. Seul `ping` accepte un
// argument libre (`message`) ; les autres outils utilisent les valeurs
// par défaut définies dans le code du serveur (src/index.ts).
export default function TestConsole() {
  const [tools, setTools] = useState([]);
  const [tool, setTool] = useState('ping');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    mcpListTools()
      .then((res) => {
        const list = (res.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description ?? '',
        }));
        setTools(list);
        setTool((prev) =>
          list.length > 0 && !list.some((t) => t.name === prev)
            ? list[0].name
            : prev
        );
      })
      .catch((err) => setError(err.message ?? String(err)));
  }, []);

  async function handleCall(e) {
    e.preventDefault();
    setError('');
    setResult('');
    setLoading(true);

    try {
      const args =
        tool === 'ping' && message.trim() ? { message: message.trim() } : {};
      const res = await mcpCallTool(tool, args);
      const text = res.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      setResult(text ?? JSON.stringify(res, null, 2));
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Console de test</h2>
      <form onSubmit={handleCall} className="console-form">
        <div className="tool-list" role="listbox" aria-label="Outils MCP">
          {(tools.length > 0 ? tools : [{ name: 'ping', description: '' }]).map(
            (t) => (
              <button
                key={t.name}
                type="button"
                role="option"
                aria-selected={t.name === tool}
                title={t.description || undefined}
                className={`tool-chip${t.name === tool ? ' selected' : ''}`}
                onClick={() => setTool(t.name)}
              >
                {t.name}
              </button>
            )
          )}
        </div>
        <div className="call-row">
          {tool === 'ping' && (
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message (optionnel)"
              aria-label="Message pour ping"
            />
          )}
          <button type="submit" disabled={loading}>
            {loading ? 'Appel en cours…' : `Appeler ${tool}`}
          </button>
        </div>
      </form>

      {result && (
        <pre className="result">
          <strong>Résultat :</strong>
          {'\n'}
          {result}
        </pre>
      )}
      {error && <p className="error">Erreur : {error}</p>}
    </div>
  );
}