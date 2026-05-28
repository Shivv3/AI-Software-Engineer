import { useState } from 'react';
import api from '../lib/api';
import './RequirementDecomposerPanel.css';

export default function RequirementDecomposerPanel() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleDecompose = async () => {
    if (!input.trim()) return;
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/ai/requirements/decompose', { requirement: input });
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to decompose requirement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="decompose-panel">
      <div className="decompose-head">
        <div>
          <h2>Requirement Decomposer</h2>
          <p>Turn a high-level requirement into epics, stories, criteria, and tests.</p>
        </div>
        <button className="decompose-button" onClick={handleDecompose} disabled={loading || !input.trim()}>
          {loading ? 'Decomposing...' : 'Decompose'}
        </button>
      </div>

      <textarea
        className="decompose-textarea"
        rows={3}
        placeholder="Enter a high-level requirement"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      {error && <div className="decompose-error">{error}</div>}

      {result?.epics?.length ? (
        <div className="decompose-results">
          {result.epics.map((epic, epicIdx) => (
            <div key={`epic-${epicIdx}`} className="decompose-epic">
              <div className="decompose-epic-title">Epic: {epic.title}</div>
              {epic.stories?.map((story, storyIdx) => (
                <div key={`story-${storyIdx}`} className="decompose-story">
                  <div className="decompose-story-title">Story: {story.title}</div>
                  {story.acceptance_criteria?.length ? (
                    <ul>
                      {story.acceptance_criteria.map((item, idx) => (
                        <li key={`ac-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {story.test_cases?.length ? (
                    <div className="decompose-tests">
                      {story.test_cases.map((item, idx) => (
                        <div key={`tc-${idx}`}>Test: {item}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="decompose-empty">Run decomposition to see structured output.</p>
      )}
    </section>
  );
}
