import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useProjectContext } from './ProjectContext';
import './ValidationLab.css';

const languageOptions = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Go',
  'Java',
  'C#',
  'C++',
  'PHP',
  'Ruby',
  'Rust',
  'Kotlin',
];

const getScoreColor = (score) => {
  if (score >= 80) return { bg: '#d1fae5', text: '#065f46', badge: 'badge-green' };
  if (score >= 60) return { bg: '#fef3c7', text: '#92400e', badge: 'badge-yellow' };
  if (score >= 40) return { bg: '#fed7aa', text: '#9a3412', badge: 'badge-orange' };
  return { bg: '#fee2e2', text: '#991b1b', badge: 'badge-red' };
};

const getSeverityColor = (severity) => {
  const colors = {
    critical: { bg: '#fee2e2', text: '#991b1b', border: '#dc2626' },
    high: { bg: '#fed7aa', text: '#9a3412', border: '#ea580c' },
    medium: { bg: '#fef3c7', text: '#92400e', border: '#d97706' },
    low: { bg: '#e0f2fe', text: '#1e40af', border: '#3b82f6' },
  };
  return colors[severity] || colors.medium;
};

const MetricCard = ({ name, metric }) => {
  if (!metric || metric.score === undefined) return null;
  const colors = getScoreColor(metric.score);
  return (
    <div
      className="p-3 rounded border"
      style={{
        backgroundColor: colors.bg,
        borderColor: '#e5e7eb',
        borderWidth: '1px',
      }}
    >
      <div className="flex justify-between items-start mb-1">
        <div className="text-sm font-semibold" style={{ color: colors.text }}>
          {name}
        </div>
        <span className={`text-xs px-2 py-1 rounded ${colors.badge}`} style={{ color: colors.text }}>
          {metric.score}/100
        </span>
      </div>
      {metric.value && (
        <div className="text-xs text-gray-600 mb-1">Value: {metric.value}</div>
      )}
      {metric.explanation && (
        <div className="text-xs text-gray-700">{metric.explanation}</div>
      )}
    </div>
  );
};

const MetricsSection = ({ title, metrics, category }) => {
  if (!metrics || Object.keys(metrics).length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(metrics).map(([key, metric]) => (
          <MetricCard key={key} name={key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())} metric={metric} />
        ))}
      </div>
    </div>
  );
};

export default function ValidationLab() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const { projectName, documents, addDocument } = useProjectContext();
  const API_BASE = import.meta.env.VITE_API_BASE || '/api';

  const [input, setInput] = useState({
    language: 'JavaScript',
    code: '',
    instructions: '',
    wantFix: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const contextText = useMemo(() => {
    const usable = documents.filter((d) => d.useAsContext && d.content);
    if (!usable.length) return '';
    return usable
      .map((d) => `---\n[${d.type || 'Doc'}] ${d.name}\n${d.content}`)
      .join('\n\n');
  }, [documents]);

  useEffect(() => {
    const state = location.state;
    if (state?.code) {
      setInput((prev) => ({
        ...prev,
        code: state.code,
        language: state.language || prev.language,
      }));
    }
  }, [location.state]);

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const saveReview = async (content, name = 'Quality Report') => {
    if (!projectId) {
      alert('Open or create a project to save documents.');
      return;
    }
    if (!content?.trim()) {
      alert('Nothing to save yet.');
      return;
    }
    await addDocument({
      name,
      type: 'Quality Report',
      mime: 'text/plain',
      content,
      source: 'generated',
      useAsContext: true,
    });
  };

  const buildTextExport = (r) => {
    if (!r) return '';
    const lines = [];
    lines.push('='.repeat(60));
    lines.push('COMPREHENSIVE QUALITY REPORT');
    lines.push('='.repeat(60), '');
    if (r.summary) lines.push('EXECUTIVE SUMMARY:', r.summary, '');
    if (r.overall_verdict) lines.push(`Overall Verdict: ${r.overall_verdict}`);
    if (r.overall_score !== undefined) lines.push(`Overall Score: ${r.overall_score}/100`, '');
    
    if (r.metrics) {
      lines.push('QUALITY METRICS:', '');
      Object.entries(r.metrics).forEach(([category, categoryMetrics]) => {
        lines.push(`\n${category.toUpperCase().replace(/_/g, ' ')}:`);
        Object.entries(categoryMetrics).forEach(([key, metric]) => {
          if (metric && metric.score !== undefined) {
            lines.push(`  ${key.replace(/_/g, ' ')}: ${metric.score}/100`);
            if (metric.value) lines.push(`    Value: ${metric.value}`);
            if (metric.explanation) lines.push(`    Explanation: ${metric.explanation}`);
          }
        });
      });
      lines.push('');
    }

    if (r.tests?.length) {
      lines.push('TEST CASES:', '');
      r.tests.forEach((t, idx) => {
        lines.push(
          `  ${idx + 1}. ${t.name} [${t.status}]`,
          `     Type: ${t.type || 'unit'}`,
          `     Input: ${t.input}`,
          `     Expected: ${t.expected}`,
          `     Observed: ${t.observed}`,
          `     Reason: ${t.reason}`,
        );
        if (t.scalability_note) lines.push(`     Scalability: ${t.scalability_note}`);
      });
      lines.push('');
    }

    if (r.critical_issues?.length) {
      lines.push('CRITICAL ISSUES:', '');
      r.critical_issues.forEach((issue, idx) => {
        lines.push(`  ${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.metric}`);
        lines.push(`     Description: ${issue.description}`);
        lines.push(`     Impact: ${issue.impact}`, '');
      });
    }

    if (r.recommendations?.length) {
      lines.push('RECOMMENDATIONS:', '');
      r.recommendations.forEach((rec, idx) => {
        lines.push(`  ${idx + 1}. [${rec.priority.toUpperCase()}] ${rec.metric}`);
        lines.push(`     Action: ${rec.action}`);
        lines.push(`     Rationale: ${rec.rationale}`, '');
      });
    }

    if (r.failures_summary) {
      lines.push('FAILURES SUMMARY:', r.failures_summary, '');
    }

    if (r.improved_code) {
      lines.push('IMPROVED CODE:', r.improved_code);
    }
    return lines.join('\n');
  };

  const runTests = async () => {
    if (!input.code) {
      setError('Please paste the code to test.');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const response = await axios.post(`${API_BASE}/code/test`, {
        language: input.language,
        code: input.code,
        instructions: input.instructions || 'comprehensive testing with all quality metrics and scalability tests',
        want_fix: input.wantFix,
        context: contextText || undefined,
      });
      setResult(response.data);
      setActiveTab('overview');
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Failed to generate tests';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const testStats = useMemo(() => {
    if (!result?.tests) return { total: 0, pass: 0, fail: 0, uncertain: 0 };
    const stats = { total: result.tests.length, pass: 0, fail: 0, uncertain: 0 };
    result.tests.forEach((t) => {
      if (t.status === 'pass') stats.pass++;
      else if (t.status === 'fail') stats.fail++;
      else stats.uncertain++;
    });
    return stats;
  }, [result]);

  return (
    <div className="validation-lab">
      <div className="workspace-container">
        <header className="val-header">
          <button className="val-back" onClick={() => navigate(`/projects/${projectId || ''}`)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Back to workspace</span>
          </button>
          <div className="val-badge">Phase 4 · Validation & QA</div>
          <h1 className="val-title">Quality Center</h1>
          <p className="val-subtitle">
            Comprehensive testing, scalability checks, and software quality metrics in the same dark theme.
            {projectName ? ` Project: ${projectName}.` : ''}
          </p>
          {contextText ? (
            <p className="val-context success">
              Using {documents.filter((d) => d.useAsContext).length} context document(s) from the sidebar.
            </p>
          ) : (
            <p className="val-context info">
              Tip: mark SRS/design/code docs as "Use in context" to ground tests and quality analysis.
            </p>
          )}
        </header>

        <section className="val-card">
          <div className="val-card-head">
            <div>
              <span className="val-chip red">Test & Verify</span>
              <h2 className="val-card-title">Generate comprehensive tests and quality analysis</h2>
              <p className="val-card-subtitle">
                Paste code (from Phase 3 or elsewhere), choose a language, and we will generate exhaustive tests,
                run quality metrics, and suggest fixes.
              </p>
            </div>
          </div>

          <div className="val-two-cols">
            <label className="val-label">
              Language
              <select
                className="val-input"
                value={input.language}
                onChange={(e) => setInput((prev) => ({ ...prev, language: e.target.value }))}
              >
                {languageOptions.map((lang) => (
                  <option key={lang}>{lang}</option>
                ))}
              </select>
            </label>
            <label className="val-label">
              Instructions / focus (optional)
              <input
                className="val-input"
                type="text"
                placeholder="e.g., stress test auth edge cases, security focus"
                value={input.instructions}
                onChange={(e) => setInput((prev) => ({ ...prev, instructions: e.target.value }))}
              />
            </label>
          </div>

          <label className="val-label">
            Code to test
            <textarea
              className="val-textarea"
              rows={12}
              placeholder="Paste the code to test"
              value={input.code}
              onChange={(e) => setInput((prev) => ({ ...prev, code: e.target.value }))}
            />
          </label>

          <label className="val-checkbox">
            <input
              type="checkbox"
              checked={input.wantFix}
              onChange={(e) => setInput((prev) => ({ ...prev, wantFix: e.target.checked }))}
            />
            Also propose improved code when tests fail
          </label>

          {error && (
            <div className="val-error">
              <div className="val-error-title">{error}</div>
              <div className="val-error-help">
                If this is an LLM availability or rate-limit issue, wait a few seconds and retry. Keeping code/context concise can help.
              </div>
            </div>
          )}

          <button className="val-button primary" onClick={runTests} disabled={loading}>
            {loading ? 'Generating tests and analysis...' : 'Generate & run comprehensive tests'}
          </button>

          {result && (
            <div className="val-results">
              <div className="val-results-head">
                <div>
                  <h3 className="val-results-title">Quality Report</h3>
                  {result.summary && <p className="val-muted">{result.summary}</p>}
                </div>
                <div className="val-actions">
                  <button className="val-button ghost" onClick={() => copyToClipboard(buildTextExport(result))}>
                    Copy report
                  </button>
                  <button
                    className="val-button ghost"
                    onClick={() => saveReview(buildTextExport(result), `${projectName || 'Project'} - Quality Report`)}
                  >
                    Save to project
                  </button>
                </div>
              </div>

              <div className="val-summary">
                <div>
                  <h4>Executive Summary</h4>
                  {result.summary && <p className="val-muted">{result.summary}</p>}
                </div>
                <div className="val-score-block">
                  {result.overall_score !== undefined && (
                    <div className="val-score">
                      <div className="val-score-label">Overall Score</div>
                      <div className="val-score-value">{result.overall_score}/100</div>
                    </div>
                  )}
                  {result.overall_verdict && (
                    <span className="val-chip blue">{result.overall_verdict}</span>
                  )}
                </div>
              </div>

              {testStats.total > 0 && (
                <div className="val-stats-grid">
                  <div className="val-stat blue">
                    <div className="val-stat-number">{testStats.total}</div>
                    <div className="val-stat-label">Total Tests</div>
                  </div>
                  <div className="val-stat green">
                    <div className="val-stat-number">{testStats.pass}</div>
                    <div className="val-stat-label">Passed</div>
                  </div>
                  <div className="val-stat red">
                    <div className="val-stat-number">{testStats.fail}</div>
                    <div className="val-stat-label">Failed</div>
                  </div>
                  <div className="val-stat amber">
                    <div className="val-stat-number">{testStats.uncertain}</div>
                    <div className="val-stat-label">Uncertain</div>
                  </div>
                </div>
              )}

              <div className="val-tabs">
                {['overview', 'metrics', 'tests', 'issues', 'recommendations'].map((tab) => (
                  <button
                    key={tab}
                    className={`val-tab ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' && (
                <div className="val-section">
                  {result.critical_issues?.length > 0 && (
                    <div className="val-subsection">
                      <h4>Critical Issues</h4>
                      <div className="val-findings">
                        {result.critical_issues.map((issue, idx) => {
                          const colors = getSeverityColor(issue.severity);
                          return (
                            <div
                              key={idx}
                              className="val-finding"
                              style={{ borderColor: colors.border, backgroundColor: colors.bg }}
                            >
                              <div className="val-finding-head">
                                <span style={{ color: colors.text }} className="val-finding-title">{issue.metric}</span>
                                <span className="val-chip solid" style={{ backgroundColor: colors.border, color: 'white' }}>
                                  {issue.severity}
                                </span>
                              </div>
                              <p className="val-muted">{issue.description}</p>
                              <p className="val-muted tiny">Impact: {issue.impact}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {result.failures_summary && (
                    <div className="val-subsection">
                      <h4>Failures Summary</h4>
                      <pre className="val-code-block light">{result.failures_summary}</pre>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'metrics' && result.metrics && (
                <div className="val-section">
                  <MetricsSection title="Code Quality Metrics" metrics={result.metrics.code_quality} />
                  <MetricsSection title="Reliability Metrics" metrics={result.metrics.reliability} />
                  <MetricsSection title="Security Metrics" metrics={result.metrics.security} />
                  <MetricsSection title="Performance Metrics" metrics={result.metrics.performance} />
                  <MetricsSection title="Test Quality Metrics" metrics={result.metrics.test_quality} />
                  <MetricsSection title="Process Metrics" metrics={result.metrics.process} />
                  <MetricsSection title="Documentation & Other" metrics={result.metrics.documentation_other} />
                </div>
              )}

              {activeTab === 'tests' && result.tests?.length > 0 && (
                <div className="val-section">
                  <h4>Test Cases ({result.tests.length} total)</h4>
                  <div className="val-tests">
                    {result.tests.map((t, idx) => {
                      const statusColors = {
                        pass: { bg: '#d1fae5', text: '#065f46' },
                        fail: { bg: '#fee2e2', text: '#b91c1c' },
                        uncertain: { bg: '#fef3c7', text: '#92400e' },
                      };
                      const colors = statusColors[t.status] || statusColors.uncertain;
                      return (
                        <div
                          key={`${t.name}-${idx}`}
                          className="val-test"
                          style={{ backgroundColor: colors.bg, borderColor: '#1e293b30' }}
                        >
                          <div className="val-test-head">
                            <div>
                              <div className="val-test-title" style={{ color: colors.text }}>{t.name}</div>
                              <div className="val-muted tiny">Type: {t.type || 'unit'} | Status: {t.status}</div>
                            </div>
                            <span className="val-chip solid" style={{ backgroundColor: colors.text, color: 'white' }}>
                              {t.status}
                            </span>
                          </div>
                          <div className="val-test-body">
                            <p><strong>Input:</strong> {t.input}</p>
                            <p><strong>Expected:</strong> {t.expected}</p>
                            <p><strong>Observed:</strong> {t.observed}</p>
                            {t.reason && <p><strong>Reason:</strong> {t.reason}</p>}
                            {t.scalability_note && <p className="val-muted tiny"><strong>Scalability:</strong> {t.scalability_note}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'issues' && result.critical_issues?.length > 0 && (
                <div className="val-section">
                  <h4>Critical Issues ({result.critical_issues.length})</h4>
                  <div className="val-findings">
                    {result.critical_issues.map((issue, idx) => {
                      const colors = getSeverityColor(issue.severity);
                      return (
                        <div
                          key={idx}
                          className="val-finding"
                          style={{ borderColor: colors.border, backgroundColor: colors.bg }}
                        >
                          <div className="val-finding-head">
                            <span className="val-finding-title" style={{ color: colors.text }}>{issue.metric}</span>
                            <span className="val-chip solid" style={{ backgroundColor: colors.border, color: 'white' }}>
                              {issue.severity}
                            </span>
                          </div>
                          <p className="val-muted">{issue.description}</p>
                          <p className="val-muted tiny">Impact: {issue.impact}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'recommendations' && result.recommendations?.length > 0 && (
                <div className="val-section">
                  <h4>Recommendations ({result.recommendations.length})</h4>
                  <div className="val-findings">
                    {result.recommendations.map((rec, idx) => {
                      const priorityColors = {
                        high: { bg: '#fee2e2', text: '#991b1b' },
                        medium: { bg: '#fef3c7', text: '#92400e' },
                        low: { bg: '#e0f2fe', text: '#1e40af' },
                      };
                      const colors = priorityColors[rec.priority] || priorityColors.medium;
                      return (
                        <div
                          key={idx}
                          className="val-finding"
                          style={{ backgroundColor: colors.bg, borderColor: '#1e293b30' }}
                        >
                          <div className="val-finding-head">
                            <span className="val-finding-title" style={{ color: colors.text }}>{rec.metric}</span>
                            <span className="val-chip solid" style={{ backgroundColor: colors.text, color: 'white' }}>
                              {rec.priority}
                            </span>
                          </div>
                          <p className="val-muted"><strong>Action:</strong> {rec.action}</p>
                          <p className="val-muted tiny">Rationale: {rec.rationale}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {result.improved_code && (
                <div className="val-section">
                  <h4>Improved Code (Proposed)</h4>
                  <pre className="val-code-block dark">{result.improved_code}</pre>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
