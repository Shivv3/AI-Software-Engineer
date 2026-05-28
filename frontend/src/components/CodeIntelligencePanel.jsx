import { useMemo, useState } from 'react';
import api from '../lib/api';
import { useProjectContext } from './ProjectContext';
import './CodeIntelligencePanel.css';

const extractRequirements = (documents) => {
  const text = documents
    .filter((doc) => doc.useAsContext && doc.content && !String(doc.content).startsWith('data:'))
    .map((doc) => doc.content)
    .join('\n');

  if (!text) return [];

  const sentences = text
    .replace(/\r/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*#\d.\s]+/, '').trim())
    .filter((s) => /\b(shall|must|should|will|require|requires|required)\b/i.test(s))
    .filter(Boolean);

  return Array.from(new Set(sentences)).slice(0, 50);
};

const extractFunctions = (code, language) => {
  const funcs = [];
  if (!code) return funcs;

  if (language.toLowerCase() === 'python') {
    const lines = code.split('\n');
    lines.forEach((line) => {
      const match = line.match(/^\s*def\s+(\w+)\s*\(([^)]*)\)/);
      if (match) {
        funcs.push({ name: match[1], signature: `def ${match[1]}(${match[2]})` });
      }
    });
    return funcs;
  }

  const funcMatches = code.matchAll(/function\s+(\w+)\s*\(([^)]*)\)/g);
  for (const match of funcMatches) {
    funcs.push({ name: match[1], signature: `function ${match[1]}(${match[2]})` });
  }
  const arrowMatches = code.matchAll(/const\s+(\w+)\s*=\s*(async\s*)?\(([^)]*)\)\s*=>/g);
  for (const match of arrowMatches) {
    funcs.push({ name: match[1], signature: `const ${match[1]} = (${match[3]}) =>` });
  }
  return funcs;
};

export default function CodeIntelligencePanel({ code, language }) {
  const { documents } = useProjectContext();
  const [loading, setLoading] = useState(false);
  const [defectResult, setDefectResult] = useState(null);
  const [traceResult, setTraceResult] = useState(null);
  const [refactorResult, setRefactorResult] = useState(null);
  const [error, setError] = useState('');

  const requirements = useMemo(() => extractRequirements(documents), [documents]);
  const codeFunctions = useMemo(() => extractFunctions(code || '', language || ''), [code, language]);

  const handleAnalyze = async () => {
    if (!code) {
      setError('Paste code in the Tests tab to run intelligence analysis.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const [defectRes, traceRes] = await Promise.all([
        api.post('/ml/defect/predict', { code, language }),
        api.post('/ml/traceability/analyze', { requirements, code_functions: codeFunctions }),
      ]);
      setDefectResult(defectRes.data);
      setTraceResult(traceRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze code intelligence');
    } finally {
      setLoading(false);
    }
  };

  const handleRefactor = async () => {
    if (!code) {
      setError('Paste code in the Tests tab to refactor.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/ml/defect/refactor', { code, language });
      setRefactorResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to refactor code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="intelligence-panel">
      <div className="intelligence-head">
        <div>
          <h2>Code Intelligence</h2>
          <p>Defect risk + traceability insights derived from your code and requirements.</p>
        </div>
        <div className="intelligence-actions">
          <button className="intelligence-btn" onClick={handleAnalyze} disabled={loading}>
            {loading ? 'Analyzing...' : 'Analyze Code Intelligence'}
          </button>
          <button className="intelligence-btn ghost" onClick={handleRefactor} disabled={loading}>
            Closed-loop Refactor
          </button>
        </div>
      </div>

      {error && <div className="intelligence-error">{error}</div>}

      <div className="intelligence-grid">
        <div className="intelligence-card">
          <h3>Defect Risk Predictor</h3>
          {defectResult?.functions?.length ? (
            <div className="risk-list">
              {defectResult.functions.map((fn) => (
                <div key={fn.name} className="risk-item">
                  <div className="risk-head">
                    <span>{fn.name}</span>
                    <span className={`risk-pill ${fn.risk_label.toLowerCase()}`}>{Math.round(fn.risk_score * 100)}%</span>
                  </div>
                  <div className="risk-metrics">
                    CC {fn.metrics.cc} · LOC {fn.metrics.loc}
                  </div>
                  <ul>
                    {(fn.shap_explanation || []).map((item, idx) => (
                      <li key={`${fn.name}-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="intelligence-empty">Run the analysis to see per-function risks.</p>
          )}
        </div>

        <div className="intelligence-card">
          <h3>Traceability Matrix</h3>
          {traceResult ? (
            <div className="trace-summary">
              <div>Coverage: {traceResult.coverage_pct}%</div>
              <div>Orphaned requirements: {traceResult.orphaned_reqs?.length || 0}</div>
              <div>Orphaned code: {traceResult.orphaned_code?.length || 0}</div>
            </div>
          ) : (
            <p className="intelligence-empty">Mark SRS docs as context to enable traceability.</p>
          )}
          {traceResult?.links?.length ? (
            <div className="trace-links">
              {traceResult.links.slice(0, 8).map((link, idx) => (
                <div key={`${link.func_name}-${idx}`} className="trace-link">
                  <span>Req {link.req_idx + 1}</span>
                  <span>{link.func_name}</span>
                  <span className={`trace-pill ${link.strength}`}>{Math.round(link.score * 100)}%</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {refactorResult && (
        <div className="intelligence-card">
          <h3>Closed-loop Refactor Result</h3>
          <p className="intelligence-muted">{refactorResult.summary || 'Refactor completed.'}</p>
          <div className="refactor-grid">
            <div>
              <h4>Before</h4>
              <div className="refactor-summary">
                High risk: {refactorResult.before?.summary?.high_risk || 0}
              </div>
            </div>
            <div>
              <h4>After</h4>
              <div className="refactor-summary">
                High risk: {refactorResult.after?.summary?.high_risk || 0}
              </div>
            </div>
          </div>
          <pre className="refactor-code">{refactorResult.refactored_code}</pre>
        </div>
      )}
    </div>
  );
}
