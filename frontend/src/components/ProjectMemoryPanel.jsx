import { useState } from 'react';
import api from '../lib/api';
import './ProjectMemoryPanel.css';

export default function ProjectMemoryPanel({ projectId }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState(null);

  const handleAsk = async () => {
    if (!question.trim()) return;
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/ai/rag/answer', { project_id: projectId, question });
      setAnswer(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to query project memory');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="memory-panel">
      <div className="memory-head">
        <div>
          <h2>RAG Project Memory</h2>
          <p>Ask questions across your saved SRS, design, and code documents.</p>
        </div>
        <button className="memory-button" onClick={handleAsk} disabled={loading || !question.trim()}>
          {loading ? 'Searching...' : 'Ask'}
        </button>
      </div>

      <textarea
        className="memory-textarea"
        rows={3}
        placeholder="Ask a question like: Which requirements are not implemented?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />

      {error && <div className="memory-error">{error}</div>}

      {answer && (
        <div className="memory-answer">
          <div className="memory-answer-text">{answer.answer}</div>
          {answer.sources?.length ? (
            <div className="memory-sources">
              Sources: {answer.sources.join(', ')}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
