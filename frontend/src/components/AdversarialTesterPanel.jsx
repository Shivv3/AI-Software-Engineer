import { useState } from 'react';
import api from '../lib/api';
import './AdversarialTesterPanel.css';

export default function AdversarialTesterPanel() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleTest = async () => {
    if (!input.trim()) return;
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/ai/requirements/adversarial', { requirement: input });
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to run adversarial test');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="adversarial-panel">
      <div className="adversarial-head">
        <div>
          <h2>Adversarial Stress-Tester</h2>
          <p>Expose hidden ambiguities and attack vectors across personas.</p>
        </div>
        <button className="adversarial-button" onClick={handleTest} disabled={loading || !input.trim()}>
          {loading ? 'Testing...' : 'Run Stress Test'}
        </button>
      </div>

      <textarea
        className="adversarial-textarea"
        rows={3}
        placeholder="Paste a requirement or system context"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      {error && <div className="adversarial-error">{error}</div>}

      {result?.personas?.length ? (
        <div className="adversarial-results">
          {result.personas.map((persona, idx) => (
            <div key={`persona-${idx}`} className="adversarial-card">
              <div className="adversarial-title">{persona.name}</div>
              <ul>
                {(persona.issues || []).map((issue, issueIdx) => (
                  <li key={`issue-${issueIdx}`}>{issue}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="adversarial-empty">Run the tester to surface attack angles.</p>
      )}
    </section>
  );
}
