import { useState } from 'react';
import api from '../lib/api';
import './MultiAgentReviewPanel.css';

const ReviewCard = ({ title, data, accent }) => {
  if (!data) return null;
  return (
    <div className="review-card">
      <div className={`review-card-title ${accent}`}>{title}</div>
      <p className="review-summary">{data.summary}</p>
      {data.risks?.length ? (
        <ul className="review-list">
          {data.risks.map((item, idx) => (
            <li key={`${title}-risk-${idx}`}>{item}</li>
          ))}
        </ul>
      ) : null}
      {data.actions?.length ? (
        <div className="review-actions">
          {data.actions.map((item, idx) => (
            <div key={`${title}-action-${idx}`} className="review-action">
              {item}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default function MultiAgentReviewPanel({ projectId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviews, setReviews] = useState(null);

  const runReviews = async () => {
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/ai/reviews/multi-agent', { project_id: projectId });
      setReviews(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to run AI reviews');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="review-panel">
      <div className="review-panel-head">
        <div>
          <h2>Multi-Agent SDLC Review Panel</h2>
          <p>Architect, Security, and Performance agents run in parallel.</p>
        </div>
        <button className="review-button" onClick={runReviews} disabled={loading}>
          {loading ? 'Reviewing...' : 'Run AI Reviews'}
        </button>
      </div>

      {error && <div className="review-error">{error}</div>}

      <div className="review-grid">
        <ReviewCard title="Architect" data={reviews?.architect} accent="accent-arch" />
        <ReviewCard title="Security" data={reviews?.security} accent="accent-sec" />
        <ReviewCard title="Performance" data={reviews?.performance} accent="accent-perf" />
      </div>
    </section>
  );
}
