import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

export default function ImplementationLab() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { projectName, documents, addDocument } = useProjectContext();

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
      const response = await axios.post('/api/code/generate', {
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
      const response = await axios.post('/api/code/translate', {
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
      const response = await axios.post('/api/code/review', {
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
            <h1 className="text-2xl font-bold">Implementation Lab</h1>
            <p className="text-gray-600">
              From specs to high-quality code: we pull in your SRS and design documents so you can generate, translate,
              and review code with minimal manual setup.
              {projectName ? ` Project: ${projectName}` : ''}
            </p>
          </div>
          {projectId && (
            <span className="badge badge-yellow" style={{ alignSelf: 'flex-start' }}>
              Phase 3 · Implementation
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
              We will send your “Use in AI context” documents along with requests to improve relevance.
            </p>
          </div>
        )}

        <div className="card mb-4">
          <div className="flex gap-2">
            <button
              className={`btn btn-secondary text-sm ${activeTool === 'generate' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTool('generate')}
            >
              Generate code
            </button>
            <button
              className={`btn btn-secondary text-sm ${activeTool === 'translate' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTool('translate')}
            >
              Translate code
            </button>
            <button
              className={`btn btn-secondary text-sm ${activeTool === 'review' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTool('review')}
            >
              Review code
            </button>
          </div>
        </div>

        {activeTool === 'generate' && (
          <section className="card" style={{ position: 'relative', marginBottom: '1.25rem' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.04,
                background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'relative' }}>
              <div className="mb-2">
                <span className="badge badge-green">Generate</span>
              </div>
              <h2 className="text-xl font-semibold mb-1">Boilerplate from natural language</h2>
              <p className="text-sm text-gray-600 mb-3">
                Describe what you want, choose a language, and we&apos;ll scaffold a starting point with run steps.
              </p>
              <textarea
                className="w-full p-2 border rounded mb-3"
                placeholder="Describe what you want to build (e.g., REST API for tasks, React auth form, Python ETL skeleton)"
                value={generateInput.description}
                onChange={(e) => setGenerateInput((prev) => ({ ...prev, description: e.target.value }))}
                rows={5}
              />
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Target language</label>
                  <select
                    className="input w-full"
                    value={generateInput.targetLanguage}
                    onChange={(e) => setGenerateInput((prev) => ({ ...prev, targetLanguage: e.target.value }))}
                  >
                    {languageOptions.map((lang) => (
                      <option key={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Style / constraints (optional)</label>
                  <input
                    className="input w-full"
                    type="text"
                    placeholder="e.g., functional, clean architecture, framework choice"
                    value={generateInput.style}
                    onChange={(e) => setGenerateInput((prev) => ({ ...prev, style: e.target.value }))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 mb-3 text-sm">
                <input
                  type="checkbox"
                  checked={generateInput.includeTests}
                  onChange={(e) => setGenerateInput((prev) => ({ ...prev, includeTests: e.target.checked }))}
                />
                Include tests / usage snippet
              </label>
              {errors.generate && (
                <p className="text-sm" style={{ color: '#b91c1c' }}>
                  {errors.generate}
                </p>
              )}
              <button
                className="btn btn-primary w-full"
                onClick={handleGenerate}
                disabled={loading.generate}
              >
                {loading.generate ? 'Generating...' : 'Generate code'}
              </button>

              {generateResult && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold mb-0">Result ({generateResult.language})</h3>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-secondary text-sm"
                        onClick={() => copyToClipboard(generateResult.code)}
                      >
                        Copy
                      </button>
                      <button
                        className="btn btn-secondary text-sm"
                        onClick={() =>
                          downloadText(
                            generateResult.filename_suggestion || 'generated-code.txt',
                            generateResult.code
                          )
                        }
                      >
                        Download
                      </button>
                      <button
                        className="btn btn-secondary text-sm"
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
                      <button
                        className="btn btn-secondary text-sm"
                        onClick={testCodeFromGenerate}
                      >
                        Test this
                      </button>
                      <button
                        className="btn btn-secondary text-sm"
                        onClick={reviewCodeFromGenerate}
                      >
                        Review this
                      </button>
                    </div>
                  </div>
                  {generateResult.summary && (
                    <p className="text-sm text-gray-800">{generateResult.summary}</p>
                  )}
                  {generateResult.run_steps && (
                    <div>
                      <h4 className="text-sm font-semibold mb-1">Run</h4>
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
                        {generateResult.run_steps}
                      </pre>
                    </div>
                  )}
                  {generateResult.assumptions && (
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Assumptions:</span> {generateResult.assumptions}
                    </p>
                  )}
                  {generateResult.warnings && (
                    <p className="text-sm" style={{ color: '#b45309' }}>
                      <span className="font-semibold">Warnings:</span> {generateResult.warnings}
                    </p>
                  )}
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
                    {generateResult.code}
                  </pre>
                  {generateResult.tests_or_usage && (
                    <div>
                      <h4 className="text-md font-semibold mb-1">Tests / Usage</h4>
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
                        {generateResult.tests_or_usage}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTool === 'translate' && (
          <section className="card" style={{ position: 'relative', marginBottom: '1.25rem' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.04,
                background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'relative' }}>
              <div className="mb-2">
                <span className="badge badge-yellow">Translate</span>
              </div>
              <h2 className="text-xl font-semibold mb-1">Translate code between languages</h2>
              <p className="text-sm text-gray-600 mb-3">
                Paste existing code and get an idiomatic translation in your target language.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Source language</label>
                  <select
                    className="input w-full"
                    value={translateInput.sourceLanguage}
                    onChange={(e) => setTranslateInput((prev) => ({ ...prev, sourceLanguage: e.target.value }))}
                  >
                    {languageOptions.map((lang) => (
                      <option key={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Target language</label>
                  <select
                    className="input w-full"
                    value={translateInput.targetLanguage}
                    onChange={(e) => setTranslateInput((prev) => ({ ...prev, targetLanguage: e.target.value }))}
                  >
                    {languageOptions.map((lang) => (
                      <option key={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
              </div>
              <textarea
                className="w-full p-2 border rounded mb-3"
                placeholder="Paste source code here"
                rows={8}
                value={translateInput.sourceCode}
                onChange={(e) => setTranslateInput((prev) => ({ ...prev, sourceCode: e.target.value }))}
              />
              <input
                className="input w-full mb-3"
                type="text"
                placeholder="Additional instructions (optional)"
                value={translateInput.instructions}
                onChange={(e) => setTranslateInput((prev) => ({ ...prev, instructions: e.target.value }))}
              />
              {errors.translate && (
                <p className="text-sm" style={{ color: '#b91c1c' }}>
                  {errors.translate}
                </p>
              )}
              <button
                className="btn btn-primary w-full"
                onClick={handleTranslate}
                disabled={loading.translate}
              >
                {loading.translate ? 'Translating...' : 'Translate code'}
              </button>

              {translateResult && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold mb-0">Result ({translateResult.target_language})</h3>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-secondary text-sm"
                        onClick={() => copyToClipboard(translateResult.code)}
                      >
                        Copy
                      </button>
                      <button
                        className="btn btn-secondary text-sm"
                        onClick={() => downloadText('translated-code.txt', translateResult.code)}
                      >
                        Download
                      </button>
                      <button
                        className="btn btn-secondary text-sm"
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
                      <button
                        className="btn btn-secondary text-sm"
                        onClick={testCodeFromTranslate}
                      >
                        Test this
                      </button>
                      <button
                        className="btn btn-secondary text-sm"
                        onClick={reviewCodeFromTranslate}
                      >
                        Review this
                      </button>
                    </div>
                  </div>
                  {translateResult.summary && (
                    <p className="text-sm text-gray-800">{translateResult.summary}</p>
                  )}
                  {translateResult.notes && (
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Notes:</span> {translateResult.notes}
                    </p>
                  )}
                  {translateResult.assumptions && (
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Assumptions:</span> {translateResult.assumptions}
                    </p>
                  )}
                  {translateResult.warnings && (
                    <p className="text-sm" style={{ color: '#b45309' }}>
                      <span className="font-semibold">Warnings:</span> {translateResult.warnings}
                    </p>
                  )}
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
                    {translateResult.code}
                  </pre>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTool === 'review' && (
          <section className="card" style={{ position: 'relative', marginBottom: '1.25rem' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.04,
                background: 'linear-gradient(135deg, #6366f1, #ec4899)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'relative' }}>
              <div className="mb-2">
                <span className="badge badge-purple">Review</span>
              </div>
              <h2 className="text-xl font-semibold mb-1">Automated code review document</h2>
              <p className="text-sm text-gray-600 mb-3">
                Paste a function, file, or small module to get a focused review covering bugs, security issues, and code smells.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Language</label>
                  <select
                    className="input w-full"
                    value={reviewInput.language}
                    onChange={(e) => setReviewInput((prev) => ({ ...prev, language: e.target.value }))}
                  >
                    {languageOptions.map((lang) => (
                      <option key={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Focus (optional)</label>
                  <input
                    className="input w-full"
                    type="text"
                    placeholder="e.g., security, performance, readability"
                    value={reviewInput.focus}
                    onChange={(e) => setReviewInput((prev) => ({ ...prev, focus: e.target.value }))}
                  />
                </div>
              </div>

              <textarea
                className="w-full p-2 border rounded mb-3"
                placeholder="Paste the code you want reviewed"
                rows={10}
                value={reviewInput.code}
                onChange={(e) => setReviewInput((prev) => ({ ...prev, code: e.target.value }))}
              />

              {errors.review && (
                <p className="text-sm" style={{ color: '#b91c1c' }}>
                  {errors.review}
                </p>
              )}

              <button
                className="btn btn-primary w-full"
                onClick={handleReview}
                disabled={loading.review}
              >
                {loading.review ? 'Reviewing...' : 'Run code review'}
              </button>

              {reviewResult && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold mb-0">Review summary</h3>
                    {typeof reviewResult.overall_score === 'number' && (
                      <span className="badge badge-blue">
                        Score: {Math.round(reviewResult.overall_score)} / 100
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-secondary text-sm"
                      onClick={() =>
                        copyToClipboard(buildReviewText(reviewResult))
                      }
                    >
                      Copy review
                    </button>
                    <button
                      className="btn btn-secondary text-sm"
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
                  {reviewResult.summary && (
                    <p className="text-sm text-gray-800">{reviewResult.summary}</p>
                  )}

                  {reviewResult.positives && reviewResult.positives.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-1">What looks good</h4>
                      <ul className="list-disc list-inside text-sm text-gray-700">
                        {reviewResult.positives.map((item, idx) => (
                          <li key={idx}>
                            <span className="font-medium">{item.title}</span>
                            {item.details ? ` – ${item.details}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {reviewResult.findings && reviewResult.findings.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Findings</h4>
                      <div className="space-y-2">
                        {reviewResult.findings.map((f) => (
                          <div
                            key={f.id || `${f.title}-${f.line_hint}`}
                            className="p-2 rounded border"
                            style={{ backgroundColor: '#f8fafc' }}
                          >
                            <div className="flex justify-between items-start gap-2 mb-1">
                              <div>
                                <div className="text-sm font-semibold">{f.title}</div>
                                <div className="text-xs text-gray-600">
                                  {f.category || 'General'}{' '}
                                  {f.line_hint ? `· ${f.line_hint}` : ''}
                                </div>
                              </div>
                              {f.severity && (
                                <span
                                  className="text-xs px-2 py-1 rounded"
                                  style={{
                                    backgroundColor:
                                      f.severity === 'critical'
                                        ? '#fee2e2'
                                        : f.severity === 'high'
                                        ? '#fee2e2'
                                        : f.severity === 'medium'
                                        ? '#fef3c7'
                                        : f.severity === 'low'
                                        ? '#e0f2fe'
                                        : '#e5e7eb',
                                    color:
                                      f.severity === 'critical' || f.severity === 'high'
                                        ? '#b91c1c'
                                        : f.severity === 'medium'
                                        ? '#92400e'
                                        : '#1f2933',
                                  }}
                                >
                                  {f.severity}
                                </span>
                              )}
                            </div>
                            {f.description && (
                              <p className="text-sm text-gray-800 mb-1">{f.description}</p>
                            )}
                            {f.recommendation && (
                              <p className="text-sm text-gray-700">
                                <span className="font-semibold">Recommendation:</span>{' '}
                                {f.recommendation}
                              </p>
                            )}
                            {f.example_fix && (
                              <pre
                                style={{
                                  whiteSpace: 'pre-wrap',
                                  backgroundColor: '#0f172a',
                                  color: '#e2e8f0',
                                  padding: '0.75rem',
                                  borderRadius: '0.5rem',
                                  marginTop: '0.5rem',
                                  fontSize: '0.8rem',
                                }}
                              >
                                {f.example_fix}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {reviewResult.recommendations_summary && (
                    <div>
                      <h4 className="text-sm font-semibold mb-1">Next actions</h4>
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
                        {reviewResult.recommendations_summary}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

