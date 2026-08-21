import { useState, useEffect } from 'react';
import { mcpCallTool, mcpListTools } from '../mcp';

// Console de test : choix de l'outil MCP puis appel sans argument.
// Tous les paramètres (model, domain, fields, limit) sont définis
// en valeurs par défaut dans le code du serveur (src/index.ts).
export default function TestConsole() {
  const [tools, setTools] = useState([]);
  const [tool, setTool] = useState('ping');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    mcpListTools()
      .then((res) => {
        const names = (res.tools ?? []).map((t) => t.name);
        setTools(names);
        setTool((prev) =>
          names.length > 0 && !names.includes(prev) ? names[0] : prev
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
      const res = await mcpCallTool(tool, {});
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
        <label>
          Outil
          <select value={tool} onChange={(e) => setTool(e.target.value)}>
            {tools.length > 0 ? (
              tools.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            ) : (
              <option value="ping">ping</option>
            )}
          </select>
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Appel en cours…' : `Appeler ${tool}`}
        </button>
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