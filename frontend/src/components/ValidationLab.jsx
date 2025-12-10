import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useProjectContext } from './ProjectContext';

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
      const response = await axios.post('/api/code/test', {
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
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, #e0f2fe 0, transparent 55%), radial-gradient(circle at bottom right, #ede9fe 0, transparent 55%), #f9fafb',
      }}
    >
      <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="mb-2">
              <button className="btn btn-secondary" onClick={() => navigate(`/projects/${projectId || ''}`)}>
                ← Back to workspace
              </button>
            </div>
            <h1 className="text-2xl font-bold">Quality Center</h1>
            <p className="text-gray-600">
              Comprehensive testing with scalability analysis and full software quality metrics report.
              {projectName ? ` Project: ${projectName}` : ''}
            </p>
          </div>
          {projectId && (
            <span className="badge badge-red" style={{ alignSelf: 'flex-start' }}>
              Phase 4 · Validation & QA
            </span>
          )}
        </div>

        {contextText && (
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold mb-0">Context in use</h3>
              <span className="badge badge-blue">{documents.filter((d) => d.useAsContext).length} docs</span>
            </div>
            <p className="text-sm text-gray-600">
              We send your saved SRS/design/code documents (marked "Use in AI context") to improve test relevance.
            </p>
          </div>
        )}

        <section className="card" style={{ position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.04,
              background: 'linear-gradient(135deg, #ef4444, #f97316)',
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'relative' }}>
            <div className="mb-2">
              <span className="badge badge-red">Test & Verify</span>
            </div>
            <h2 className="text-xl font-semibold mb-1">Generate comprehensive tests and quality analysis</h2>
            <p className="text-sm text-gray-600 mb-3">
              Paste code (from Phase 3 or elsewhere), choose a language. We'll generate exhaustive test cases including scalability tests,
              evaluate all software quality metrics, and provide a detailed report with recommendations.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-sm text-gray-700 block mb-1">Language</label>
                <select
                  className="input w-full"
                  value={input.language}
                  onChange={(e) => setInput((prev) => ({ ...prev, language: e.target.value }))}
                >
                  {languageOptions.map((lang) => (
                    <option key={lang}>{lang}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-700 block mb-1">Instructions / focus (optional)</label>
                <input
                  className="input w-full"
                  type="text"
                  placeholder="e.g., stress test auth edge cases, security focus"
                  value={input.instructions}
                  onChange={(e) => setInput((prev) => ({ ...prev, instructions: e.target.value }))}
                />
              </div>
            </div>

            <textarea
              className="w-full p-2 border rounded mb-3"
              placeholder="Paste the code to test"
              rows={12}
              value={input.code}
              onChange={(e) => setInput((prev) => ({ ...prev, code: e.target.value }))}
            />

            <label className="flex items-center gap-2 mb-3 text-sm">
              <input
                type="checkbox"
                checked={input.wantFix}
                onChange={(e) => setInput((prev) => ({ ...prev, wantFix: e.target.checked }))}
              />
              Also propose improved code when tests fail
            </label>

            {error && (
              <p className="text-sm" style={{ color: '#b91c1c' }}>
                {error}
              </p>
            )}

            <button className="btn btn-primary w-full" onClick={runTests} disabled={loading}>
              {loading ? 'Generating comprehensive tests and analysis...' : 'Generate & run comprehensive tests'}
            </button>

            {result && (
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-lg font-semibold mb-0">Quality Report</h3>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="btn btn-secondary text-sm"
                      onClick={() => copyToClipboard(buildTextExport(result))}
                    >
                      Copy report
                    </button>
                    <button
                      className="btn btn-secondary text-sm"
                      onClick={() =>
                        saveReview(buildTextExport(result), `${projectName || 'Project'} - Quality Report`)
                      }
                    >
                      Save to project
                    </button>
                  </div>
                </div>

                {/* Overview Section */}
                <div className="border rounded p-4" style={{ backgroundColor: '#f8fafc' }}>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div>
                      <h4 className="text-md font-semibold mb-1">Executive Summary</h4>
                      {result.summary && <p className="text-sm text-gray-700">{result.summary}</p>}
                    </div>
                    <div className="flex gap-2 items-center">
                      {result.overall_score !== undefined && (
                        <div className="text-right">
                          <div className="text-xs text-gray-600">Overall Score</div>
                          <div className={`text-2xl font-bold ${getScoreColor(result.overall_score).badge}`}>
                            {result.overall_score}/100
                          </div>
                        </div>
                      )}
                      {result.overall_verdict && (
                        <span className={`badge ${getScoreColor(result.overall_score || 50).badge}`}>
                          {result.overall_verdict}
                        </span>
                      )}
                    </div>
                  </div>

                  {testStats.total > 0 && (
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      <div className="text-center p-2 rounded" style={{ backgroundColor: '#e0f2fe' }}>
                        <div className="text-lg font-bold">{testStats.total}</div>
                        <div className="text-xs text-gray-600">Total Tests</div>
                      </div>
                      <div className="text-center p-2 rounded" style={{ backgroundColor: '#d1fae5' }}>
                        <div className="text-lg font-bold">{testStats.pass}</div>
                        <div className="text-xs text-gray-600">Passed</div>
                      </div>
                      <div className="text-center p-2 rounded" style={{ backgroundColor: '#fee2e2' }}>
                        <div className="text-lg font-bold">{testStats.fail}</div>
                        <div className="text-xs text-gray-600">Failed</div>
                      </div>
                      <div className="text-center p-2 rounded" style={{ backgroundColor: '#fef3c7' }}>
                        <div className="text-lg font-bold">{testStats.uncertain}</div>
                        <div className="text-xs text-gray-600">Uncertain</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tabs for organized view */}
                <div className="border-b flex gap-2 overflow-x-auto">
                  {['overview', 'metrics', 'tests', 'issues', 'recommendations'].map((tab) => (
                    <button
                      key={tab}
                      className={`px-4 py-2 text-sm font-medium border-b-2 ${
                        activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600'
                      }`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    {result.critical_issues && result.critical_issues.length > 0 && (
                      <div>
                        <h4 className="text-md font-semibold mb-2">Critical Issues</h4>
                        <div className="space-y-2">
                          {result.critical_issues.map((issue, idx) => {
                            const colors = getSeverityColor(issue.severity);
                            return (
                              <div
                                key={idx}
                                className="p-3 rounded border"
                                style={{
                                  backgroundColor: colors.bg,
                                  borderColor: colors.border,
                                  borderWidth: '2px',
                                }}
                              >
                                <div className="flex justify-between items-start mb-1">
                                  <span className="font-semibold" style={{ color: colors.text }}>
                                    {issue.metric}
                                  </span>
                                  <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: colors.border, color: 'white' }}>
                                    {issue.severity}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-700">{issue.description}</p>
                                <p className="text-xs text-gray-600 mt-1">Impact: {issue.impact}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {result.failures_summary && (
                      <div>
                        <h4 className="text-md font-semibold mb-2">Failures Summary</h4>
                        <pre
                          style={{
                            whiteSpace: 'pre-wrap',
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            padding: '0.75rem',
                            borderRadius: '0.5rem',
                            fontSize: '0.9rem',
                          }}
                        >
                          {result.failures_summary}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'metrics' && result.metrics && (
                  <div>
                    <MetricsSection title="Code Quality Metrics" metrics={result.metrics.code_quality} />
                    <MetricsSection title="Reliability Metrics" metrics={result.metrics.reliability} />
                    <MetricsSection title="Security Metrics" metrics={result.metrics.security} />
                    <MetricsSection title="Performance Metrics" metrics={result.metrics.performance} />
                    <MetricsSection title="Test Quality Metrics" metrics={result.metrics.test_quality} />
                    <MetricsSection title="Process Metrics" metrics={result.metrics.process} />
                    <MetricsSection title="Documentation & Other" metrics={result.metrics.documentation_other} />
                  </div>
                )}

                {activeTab === 'tests' && result.tests && result.tests.length > 0 && (
                  <div>
                    <h4 className="text-md font-semibold mb-3">Test Cases ({result.tests.length} total)</h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
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
                            className="p-3 rounded border"
                            style={{ backgroundColor: colors.bg, borderColor: '#e5e7eb' }}
                          >
                            <div className="flex justify-between items-start gap-2 mb-2">
                              <div>
                                <div className="text-sm font-semibold" style={{ color: colors.text }}>
                                  {t.name}
                                </div>
                                <div className="text-xs text-gray-600">
                                  Type: {t.type || 'unit'} | Status: {t.status}
                                </div>
                              </div>
                              <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: colors.text, color: 'white' }}>
                                {t.status}
                              </span>
                            </div>
                            <div className="text-sm text-gray-700 space-y-1">
                              <p>
                                <span className="font-semibold">Input:</span> {t.input}
                              </p>
                              <p>
                                <span className="font-semibold">Expected:</span> {t.expected}
                              </p>
                              <p>
                                <span className="font-semibold">Observed:</span> {t.observed}
                              </p>
                              {t.reason && (
                                <p>
                                  <span className="font-semibold">Reason:</span> {t.reason}
                                </p>
                              )}
                              {t.scalability_note && (
                                <p className="text-xs text-gray-600 italic">
                                  <span className="font-semibold">Scalability:</span> {t.scalability_note}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTab === 'issues' && result.critical_issues && result.critical_issues.length > 0 && (
                  <div>
                    <h4 className="text-md font-semibold mb-3">Critical Issues ({result.critical_issues.length})</h4>
                    <div className="space-y-2">
                      {result.critical_issues.map((issue, idx) => {
                        const colors = getSeverityColor(issue.severity);
                        return (
                          <div
                            key={idx}
                            className="p-4 rounded border"
                            style={{
                              backgroundColor: colors.bg,
                              borderColor: colors.border,
                              borderWidth: '2px',
                            }}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-semibold text-sm" style={{ color: colors.text }}>
                                {issue.metric}
                              </span>
                              <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: colors.border, color: 'white' }}>
                                {issue.severity}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mb-1">{issue.description}</p>
                            <p className="text-xs text-gray-600">Impact: {issue.impact}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTab === 'recommendations' && result.recommendations && result.recommendations.length > 0 && (
                  <div>
                    <h4 className="text-md font-semibold mb-3">Recommendations ({result.recommendations.length})</h4>
                    <div className="space-y-2">
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
                            className="p-4 rounded border"
                            style={{ backgroundColor: colors.bg, borderColor: '#e5e7eb' }}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-semibold text-sm" style={{ color: colors.text }}>
                                {rec.metric}
                              </span>
                              <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: colors.text, color: 'white' }}>
                                {rec.priority}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mb-1">
                              <span className="font-semibold">Action:</span> {rec.action}
                            </p>
                            <p className="text-xs text-gray-600">Rationale: {rec.rationale}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {result.improved_code && (
                  <div className="mt-4">
                    <h4 className="text-md font-semibold mb-2">Improved Code (Proposed)</h4>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        backgroundColor: '#0f172a',
                        color: '#e2e8f0',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        overflowX: 'auto',
                        fontSize: '0.9rem',
                      }}
                    >
                      {result.improved_code}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
