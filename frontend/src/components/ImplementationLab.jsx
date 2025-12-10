import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useProjectContext } from './ProjectContext';
import './ImplementationLab.css';

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

export default function ImplementationLab() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { projectName, documents, addDocument } = useProjectContext();
  const API_BASE = import.meta.env.VITE_API_BASE || '/api';

  const [activeTool, setActiveTool] = useState('generate'); // 'generate' | 'translate' | 'review'

  const [generateInput, setGenerateInput] = useState({
    description: '',
    targetLanguage: 'Python',
    style: '',
    includeTests: true,
  });

  const [translateInput, setTranslateInput] = useState({
    sourceLanguage: 'JavaScript',
    targetLanguage: 'Python',
    sourceCode: '',
    instructions: '',
  });

  const [reviewInput, setReviewInput] = useState({
    language: 'JavaScript',
    focus: '',
    code: '',
  });

  const [loading, setLoading] = useState({ generate: false, translate: false, review: false });
  const [errors, setErrors] = useState({ generate: '', translate: '', review: '' });
  const [generateResult, setGenerateResult] = useState(null);
  const [translateResult, setTranslateResult] = useState(null);
  const [reviewResult, setReviewResult] = useState(null);
  const sendToTests = (payload) => {
    if (!projectId) {
      alert('Open or create a project to run tests.');
      return;
    }
    navigate(`/projects/${projectId}/quality`, { state: payload });
  };

  const contextText = useMemo(() => {
    const usable = documents.filter((d) => d.useAsContext && d.content);
    if (!usable.length) return '';
    return usable
      .map((d) => `---\n[${d.type || 'Doc'}] ${d.name}\n${d.content}`)
      .join('\n\n');
  }, [documents]);

  // Lightly pre-fill generation description based on SRS / design context so user does less manual setup.
  useEffect(() => {
    if (generateInput.description) return;
    const srsDoc =
      documents.find((d) => d.type === 'SRS' && d.useAsContext) ||
      documents.find((d) => (d.type || '').toLowerCase().includes('srs') && d.useAsContext);
    if (srsDoc) {
      setGenerateInput((prev) => ({
        ...prev,
        description:
          `Based on the SRS document "${srsDoc.name}" for ${projectName || 'this project'}, ` +
          'generate core implementation scaffolding (key services, API handlers, and data access layer).',
      }));
      return;
    }
    const designDoc =
      documents.find((d) => (d.type || '').toLowerCase().includes('design') && d.useAsContext) ||
      documents.find((d) => d.name.toLowerCase().includes('design') && d.useAsContext);
    if (designDoc) {
      setGenerateInput((prev) => ({
        ...prev,
        description:
          `Using the design document "${designDoc.name}" for ${projectName || 'this project'}, ` +
          'generate initial code structure for the main components/services.',
      }));
    }
  }, [documents, projectName, generateInput.description]);

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no-op if clipboard is unavailable
    }
  };

  const downloadText = (filename, content) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const saveDoc = async ({ name, type, content }) => {
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
      type,
      mime: 'text/plain',
      content,
      source: 'generated',
      useAsContext: true,
    });
  };

  const handleGenerate = async () => {
    if (!generateInput.description || !generateInput.targetLanguage) {
      setErrors((prev) => ({ ...prev, generate: 'Description and target language are required.' }));
      return;
    }
    setErrors((prev) => ({ ...prev, generate: '' }));
    setLoading((prev) => ({ ...prev, generate: true }));
    try {
      const response = await axios.post(`${API_BASE}/code/generate`, {
        description: generateInput.description,
        target_language: generateInput.targetLanguage,
        style: generateInput.style,
        include_tests: generateInput.includeTests,
        context: contextText || undefined,
      });
      setGenerateResult(response.data);
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Failed to generate code';
      setErrors((prev) => ({ ...prev, generate: message }));
    } finally {
      setLoading((prev) => ({ ...prev, generate: false }));
    }
  };

  const handleTranslate = async () => {
    if (!translateInput.sourceLanguage || !translateInput.targetLanguage || !translateInput.sourceCode) {
      setErrors((prev) => ({ ...prev, translate: 'Source code, source language, and target language are required.' }));
      return;
    }
    setErrors((prev) => ({ ...prev, translate: '' }));
    setLoading((prev) => ({ ...prev, translate: true }));
    try {
      const response = await axios.post(`${API_BASE}/code/translate`, {
        source_language: translateInput.sourceLanguage,
        target_language: translateInput.targetLanguage,
        source_code: translateInput.sourceCode,
        instructions: translateInput.instructions,
        context: contextText || undefined,
      });
      setTranslateResult(response.data);
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Failed to translate code';
      setErrors((prev) => ({ ...prev, translate: message }));
    } finally {
      setLoading((prev) => ({ ...prev, translate: false }));
    }
  };

  const handleReview = async () => {
    if (!reviewInput.code) {
      setErrors((prev) => ({ ...prev, review: 'Please paste the code you want reviewed.' }));
      return;
    }
    setErrors((prev) => ({ ...prev, review: '' }));
    setLoading((prev) => ({ ...prev, review: true }));
    try {
      const response = await axios.post(`${API_BASE}/code/review`, {
        language: reviewInput.language,
        code: reviewInput.code,
        focus: reviewInput.focus || undefined,
        context: contextText || undefined,
      });
      setReviewResult(response.data);
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Failed to review code';
      setErrors((prev) => ({ ...prev, review: message }));
    } finally {
      setLoading((prev) => ({ ...prev, review: false }));
    }
  };

  const reviewCodeFromGenerate = () => {
    if (!generateResult?.code) return;
    setActiveTool('review');
    setReviewInput((prev) => ({
      ...prev,
      language: generateResult.language || prev.language,
      code: generateResult.code,
    }));
    setReviewResult(null);
  };

  const reviewCodeFromTranslate = () => {
    if (!translateResult?.code) return;
    setActiveTool('review');
    setReviewInput((prev) => ({
      ...prev,
      language: translateResult.target_language || prev.language,
      code: translateResult.code,
    }));
    setReviewResult(null);
  };

  const testCodeFromGenerate = () => {
    if (!generateResult?.code) return;
    sendToTests({
      code: generateResult.code,
      language: generateResult.language || generateInput.targetLanguage,
    });
  };

  const testCodeFromTranslate = () => {
    if (!translateResult?.code) return;
    sendToTests({
      code: translateResult.code,
      language: translateResult.target_language || translateInput.targetLanguage,
    });
  };

  const buildReviewText = (review) => {
    if (!review) return '';
    const lines = [];
    if (review.summary) {
      lines.push('Summary:', review.summary, '');
    }
    if (typeof review.overall_score === 'number') {
      lines.push(`Overall score: ${Math.round(review.overall_score)} / 100`, '');
    }
    if (review.positives?.length) {
      lines.push('What looks good:');
      review.positives.forEach((p, idx) => {
        lines.push(`  ${idx + 1}. ${p.title}${p.details ? ` – ${p.details}` : ''}`);
      });
      lines.push('');
    }
    if (review.findings?.length) {
      lines.push('Findings:');
      review.findings.forEach((f, idx) => {
        lines.push(
          `  ${idx + 1}. [${f.severity || 'info'} / ${f.category || 'general'}] ${f.title}` +
            (f.line_hint ? ` (${f.line_hint})` : ''),
        );
        if (f.description) lines.push(`     - Issue: ${f.description}`);
        if (f.recommendation) lines.push(`     - Recommendation: ${f.recommendation}`);
        if (f.example_fix) lines.push(`     - Example fix:\n${f.example_fix}`);
      });
      lines.push('');
    }
    if (review.recommendations_summary) {
      lines.push('Next actions:', review.recommendations_summary);
    }
    return lines.join('\n');
  };

  return (
    <div className="impl-lab">
      <div className="workspace-container">
        <header className="lab-header">
          <button className="lab-back" onClick={() => navigate(`/projects/${projectId || ''}`)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Back to workspace</span>
          </button>
          <div className="lab-badge lab-badge-yellow">Phase 3 · Implementation</div>
          <h1 className="lab-title">Implementation Lab</h1>
          <p className="lab-subtitle">
            From specs to high-quality code: generate, translate, and review using the same dark workspace as design.
            {projectName ? ` Project: ${projectName}.` : ''}
          </p>
          {contextText ? (
            <p className="lab-context success">
              Using {documents.filter((d) => d.useAsContext).length} context document(s) from the sidebar.
            </p>
          ) : (
            <p className="lab-context info">
              Tip: mark SRS/design docs as "Use in context" to ground generation and reviews.
            </p>
          )}
        </header>

        <div className="lab-tabs">
          <button className={`lab-tab ${activeTool === 'generate' ? 'active' : ''}`} onClick={() => setActiveTool('generate')}>
            Generate code
          </button>
          <button className={`lab-tab ${activeTool === 'translate' ? 'active' : ''}`} onClick={() => setActiveTool('translate')}>
            Translate code
          </button>
          <button className={`lab-tab ${activeTool === 'review' ? 'active' : ''}`} onClick={() => setActiveTool('review')}>
            Review code
          </button>
        </div>

        {activeTool === 'generate' && (
          <section className="lab-card">
            <div className="lab-card-head">
              <div>
                <span className="lab-chip green">Generate</span>
                <h2 className="lab-card-title">Boilerplate from natural language</h2>
                <p className="lab-card-subtitle">
                  Describe what you need, choose a language, and we will scaffold code with run steps and (optional) tests.
                </p>
              </div>
            </div>

            <div className="lab-form-grid">
              <label className="lab-label">
                Description
                <textarea
                  className="lab-textarea"
                  rows={5}
                  placeholder="Describe what you want to build (e.g., REST API for tasks, React auth form, Python ETL skeleton)"
                  value={generateInput.description}
                  onChange={(e) => setGenerateInput((prev) => ({ ...prev, description: e.target.value }))}
                />
              </label>
              <div className="lab-two-cols">
                <label className="lab-label">
                  Target language
                  <select
                    className="lab-input"
                    value={generateInput.targetLanguage}
                    onChange={(e) => setGenerateInput((prev) => ({ ...prev, targetLanguage: e.target.value }))}
                  >
                    {languageOptions.map((lang) => (
                      <option key={lang}>{lang}</option>
                    ))}
                  </select>
                </label>
                <label className="lab-label">
                  Style / constraints (optional)
                  <input
                    className="lab-input"
                    type="text"
                    placeholder="e.g., clean architecture, FastAPI, hexagonal"
                    value={generateInput.style}
                    onChange={(e) => setGenerateInput((prev) => ({ ...prev, style: e.target.value }))}
                  />
                </label>
              </div>
              <label className="lab-checkbox">
                <input
                  type="checkbox"
                  checked={generateInput.includeTests}
                  onChange={(e) => setGenerateInput((prev) => ({ ...prev, includeTests: e.target.checked }))}
                />
                Include tests / usage snippet
              </label>
              {errors.generate && <div className="lab-error">{errors.generate}</div>}
              <button className="lab-button primary" onClick={handleGenerate} disabled={loading.generate}>
                {loading.generate ? 'Generating...' : 'Generate code'}
              </button>
            </div>

            {generateResult && (
              <div className="lab-result">
                <div className="lab-result-header">
                  <div>
                    <h3 className="lab-result-title">Result ({generateResult.language})</h3>
                    {generateResult.summary && <p className="lab-muted">{generateResult.summary}</p>}
                  </div>
                  <div className="lab-actions">
                    <button className="lab-button ghost" onClick={() => copyToClipboard(generateResult.code)}>Copy</button>
                    <button
                      className="lab-button ghost"
                      onClick={() => downloadText(generateResult.filename_suggestion || 'generated-code.txt', generateResult.code)}
                    >
                      Download
                    </button>
                    <button
                      className="lab-button ghost"
                      onClick={() =>
                        saveDoc({
                          name: generateResult.filename_suggestion || `${projectName || 'Project'} - Generated Code`,
                          type: 'Code',
                          content: generateResult.code,
                        })
                      }
                    >
                      Save
                    </button>
                    <button className="lab-button ghost" onClick={testCodeFromGenerate}>Test</button>
                    <button className="lab-button ghost" onClick={reviewCodeFromGenerate}>Review</button>
                  </div>
                </div>

                {generateResult.run_steps && (
                  <div className="lab-section">
                    <div className="lab-section-head">
                      <h4>Run</h4>
                      <button className="lab-mini" onClick={() => copyToClipboard(generateResult.run_steps)}>Copy</button>
                    </div>
                    <pre className="lab-code-block light">{generateResult.run_steps}</pre>
                  </div>
                )}

                {generateResult.assumptions && (
                  <p className="lab-muted"><strong>Assumptions:</strong> {generateResult.assumptions}</p>
                )}
                {generateResult.warnings && (
                  <p className="lab-warning"><strong>Warnings:</strong> {generateResult.warnings}</p>
                )}

                <div className="lab-section">
                  <div className="lab-section-head">
                    <h4>Code</h4>
                    <button className="lab-mini" onClick={() => copyToClipboard(generateResult.code)}>Copy</button>
                  </div>
                  <pre className="lab-code-block dark">{generateResult.code}</pre>
                </div>

                {generateResult.tests_or_usage && (
                  <div className="lab-section">
                    <div className="lab-section-head">
                      <h4>Tests / Usage</h4>
                      <button className="lab-mini" onClick={() => copyToClipboard(generateResult.tests_or_usage)}>Copy</button>
                    </div>
                    <pre className="lab-code-block dark">{generateResult.tests_or_usage}</pre>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {activeTool === 'translate' && (
          <section className="lab-card">
            <div className="lab-card-head">
              <div>
                <span className="lab-chip amber">Translate</span>
                <h2 className="lab-card-title">Translate code between languages</h2>
                <p className="lab-card-subtitle">Paste existing code and get an idiomatic translation.</p>
              </div>
            </div>

            <div className="lab-two-cols">
              <label className="lab-label">
                Source language
                <select
                  className="lab-input"
                  value={translateInput.sourceLanguage}
                  onChange={(e) => setTranslateInput((prev) => ({ ...prev, sourceLanguage: e.target.value }))}
                >
                  {languageOptions.map((lang) => (
                    <option key={lang}>{lang}</option>
                  ))}
                </select>
              </label>
              <label className="lab-label">
                Target language
                <select
                  className="lab-input"
                  value={translateInput.targetLanguage}
                  onChange={(e) => setTranslateInput((prev) => ({ ...prev, targetLanguage: e.target.value }))}
                >
                  {languageOptions.map((lang) => (
                    <option key={lang}>{lang}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="lab-label">
              Source code
              <textarea
                className="lab-textarea"
                rows={8}
                placeholder="Paste source code here"
                value={translateInput.sourceCode}
                onChange={(e) => setTranslateInput((prev) => ({ ...prev, sourceCode: e.target.value }))}
              />
            </label>

            <label className="lab-label">
              Additional instructions (optional)
              <input
                className="lab-input"
                type="text"
                placeholder="e.g., prefer async/await, use idiomatic collections"
                value={translateInput.instructions}
                onChange={(e) => setTranslateInput((prev) => ({ ...prev, instructions: e.target.value }))}
              />
            </label>

            {errors.translate && <div className="lab-error">{errors.translate}</div>}

            <button className="lab-button primary" onClick={handleTranslate} disabled={loading.translate}>
              {loading.translate ? 'Translating...' : 'Translate code'}
            </button>

            {translateResult && (
              <div className="lab-result">
                <div className="lab-result-header">
                  <div>
                    <h3 className="lab-result-title">Result ({translateResult.target_language})</h3>
                    {translateResult.summary && <p className="lab-muted">{translateResult.summary}</p>}
                  </div>
                  <div className="lab-actions">
                    <button className="lab-button ghost" onClick={() => copyToClipboard(translateResult.code)}>Copy</button>
                    <button className="lab-button ghost" onClick={() => downloadText('translated-code.txt', translateResult.code)}>Download</button>
                    <button
                      className="lab-button ghost"
                      onClick={() =>
                        saveDoc({
                          name: `${projectName || 'Project'} - Translated (${translateResult.target_language || translateInput.targetLanguage})`,
                          type: 'Code',
                          content: translateResult.code,
                        })
                      }
                    >
                      Save
                    </button>
                    <button className="lab-button ghost" onClick={testCodeFromTranslate}>Test</button>
                    <button className="lab-button ghost" onClick={reviewCodeFromTranslate}>Review</button>
                  </div>
                </div>

                {translateResult.notes && (
                  <p className="lab-muted"><strong>Notes:</strong> {translateResult.notes}</p>
                )}
                {translateResult.assumptions && (
                  <p className="lab-muted"><strong>Assumptions:</strong> {translateResult.assumptions}</p>
                )}
                {translateResult.warnings && (
                  <p className="lab-warning"><strong>Warnings:</strong> {translateResult.warnings}</p>
                )}

                <div className="lab-section">
                  <div className="lab-section-head">
                    <h4>Code</h4>
                    <button className="lab-mini" onClick={() => copyToClipboard(translateResult.code)}>Copy</button>
                  </div>
                  <pre className="lab-code-block dark">{translateResult.code}</pre>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTool === 'review' && (
          <section className="lab-card">
            <div className="lab-card-head">
              <div>
                <span className="lab-chip purple">Review</span>
                <h2 className="lab-card-title">Automated code review</h2>
                <p className="lab-card-subtitle">Paste code to scan for bugs, security issues, and smells.</p>
              </div>
            </div>

            <div className="lab-two-cols">
              <label className="lab-label">
                Language
                <select
                  className="lab-input"
                  value={reviewInput.language}
                  onChange={(e) => setReviewInput((prev) => ({ ...prev, language: e.target.value }))}
                >
                  {languageOptions.map((lang) => (
                    <option key={lang}>{lang}</option>
                  ))}
                </select>
              </label>
              <label className="lab-label">
                Focus (optional)
                <input
                  className="lab-input"
                  type="text"
                  placeholder="e.g., security, performance, readability"
                  value={reviewInput.focus}
                  onChange={(e) => setReviewInput((prev) => ({ ...prev, focus: e.target.value }))}
                />
              </label>
            </div>

            <label className="lab-label">
              Code to review
              <textarea
                className="lab-textarea"
                rows={10}
                placeholder="Paste the code you want reviewed"
                value={reviewInput.code}
                onChange={(e) => setReviewInput((prev) => ({ ...prev, code: e.target.value }))}
              />
            </label>

            {errors.review && <div className="lab-error">{errors.review}</div>}

            <button className="lab-button primary" onClick={handleReview} disabled={loading.review}>
              {loading.review ? 'Reviewing...' : 'Run code review'}
            </button>

            {reviewResult && (
              <div className="lab-result">
                <div className="lab-result-header">
                  <div>
                    <h3 className="lab-result-title">Review summary</h3>
                    {reviewResult.summary && <p className="lab-muted">{reviewResult.summary}</p>}
                  </div>
                  <div className="lab-actions">
                    {typeof reviewResult.overall_score === 'number' && (
                      <span className="lab-chip blue">Score: {Math.round(reviewResult.overall_score)} / 100</span>
                    )}
                    <button className="lab-button ghost" onClick={() => copyToClipboard(buildReviewText(reviewResult))}>Copy review</button>
                    <button
                      className="lab-button ghost"
                      onClick={() =>
                        saveDoc({
                          name: `${projectName || 'Project'} - Code Review`,
                          type: 'Review',
                          content: buildReviewText(reviewResult),
                        })
                      }
                    >
                      Save review
                    </button>
                  </div>
                </div>

                {reviewResult.positives?.length > 0 && (
                  <div className="lab-section">
                    <h4>What looks good</h4>
                    <ul className="lab-list">
                      {reviewResult.positives.map((item, idx) => (
                        <li key={idx}><strong>{item.title}</strong>{item.details ? ` – ${item.details}` : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {reviewResult.findings?.length > 0 && (
                  <div className="lab-section">
                    <h4>Findings</h4>
                    <div className="lab-findings">
                      {reviewResult.findings.map((f) => (
                        <div key={f.id || `${f.title}-${f.line_hint}`} className="lab-finding">
                          <div className="lab-finding-head">
                            <div>
                              <div className="lab-finding-title">{f.title}</div>
                              <div className="lab-muted tiny">
                                {f.category || 'General'} {f.line_hint ? `· ${f.line_hint}` : ''}
                              </div>
                            </div>
                            {f.severity && <span className={`lab-chip ${f.severity}`}>{f.severity}</span>}
                          </div>
                          {f.description && <p className="lab-muted">{f.description}</p>}
                          {f.recommendation && (
                            <p className="lab-muted"><strong>Recommendation:</strong> {f.recommendation}</p>
                          )}
                          {f.example_fix && <pre className="lab-code-block dark small">{f.example_fix}</pre>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reviewResult.recommendations_summary && (
                  <div className="lab-section">
                    <h4>Next actions</h4>
                    <pre className="lab-code-block light">{reviewResult.recommendations_summary}</pre>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

