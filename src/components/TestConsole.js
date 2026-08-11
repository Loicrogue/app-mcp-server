import { useState } from 'react';
import { mcpCallTool } from '../mcp';

// Petite console de test : appelle l'outil "ping" du serveur MCP.
export default function TestConsole() {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handlePing(e) {
    e.preventDefault();
    setError('');
    setResult('');
    setLoading(true);
    try {
      const res = await mcpCallTool('ping', { message: message || undefined });
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
      <form onSubmit={handlePing} className="console-form">
        <label>
          Message (facultatif)
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex : bonjour depuis l'interface"
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Appel en cours…' : 'Appeler l\'outil ping'}
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