import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectContext } from './ProjectContext';

export default function SystemDesignWizard() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { documents, projectName } = useProjectContext();
  const [form, setForm] = useState({
    cloudPreference: '',
    legacyTech: '',
    teamSkills: '',
    priorities: '',
    isGreenfield: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [designMarkdown, setDesignMarkdown] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const contextDocs = documents.filter((d) => d.useAsContext);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Helper function to check if content is a PDF data URI
  const isPdfDataUri = (content) => {
    return typeof content === 'string' && content.startsWith('data:application/pdf;base64,');
  };

  // Helper function to check if content is a DOCX data URI
  const isDocxDataUri = (content, mime) => {
    if (typeof content !== 'string') return false;
    return (
      content.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,') ||
      content.startsWith('data:application/msword;base64,') ||
      (mime && (mime.includes('wordprocessingml') || mime.includes('msword') || mime.includes('word')))
    );
  };

  // Helper function to check if content is any data URI
  const isDataUri = (content) => {
    return typeof content === 'string' && content.startsWith('data:');
  };

  // Extract text from a document (handles PDFs, DOCX, text data URIs, and plain text)
  const extractTextFromDocument = async (doc) => {
    const { content, mime, name } = doc;

    if (!content) {
      return null;
    }

    // If it's already plain text (not a data URI), return as-is
    if (!isDataUri(content)) {
      return content;
    }

    // Determine file type for better status messages
    let fileType = 'document';
    if (isPdfDataUri(content)) {
      fileType = 'PDF';
    } else if (isDocxDataUri(content, mime)) {
      fileType = 'DOCX';
    } else if (content.startsWith('data:text/')) {
      fileType = 'text file';
    }

    // If it's a PDF, DOCX, or other data URI, extract text via backend
    if (isPdfDataUri(content) || isDocxDataUri(content, mime) || isDataUri(content)) {
      try {
        setProcessingStatus(`Extracting text from ${fileType}: ${name || 'document'}...`);
        const response = await fetch('/api/documents/extract-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, mime }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Failed to extract text from ${name || 'document'}`);
        }

        const data = await response.json();
        const extractedText = data.text || '';
        
        if (!extractedText.trim()) {
          console.warn(`Warning: ${name || 'document'} extracted but contains no text`);
        }
        
        return extractedText;
      } catch (err) {
        console.error(`Error extracting text from ${name}:`, err);
        throw new Error(`Failed to extract text from ${name || 'document'}: ${err.message}`);
      }
    }

    return content;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setProcessingStatus('');

    if (contextDocs.length === 0) {
      setError('Mark at least one document as "Use in context" in the sidebar to proceed.');
      return;
    }

    setLoading(true);
    try {
      // Extract text from all context documents
      setProcessingStatus('Processing documents...');
      const textPromises = contextDocs.map((doc) => extractTextFromDocument(doc));
      const extractedTexts = await Promise.all(textPromises);

      // Filter out null/empty results and combine
      const combinedSrs = extractedTexts
        .filter((text) => text && text.trim())
        .map((text, idx) => {
          const doc = contextDocs[idx];
          return doc.name ? `---\n[${doc.name}]\n${text}` : text;
        })
        .join('\n\n');

      if (!combinedSrs || !combinedSrs.trim()) {
        throw new Error('No text content could be extracted from the selected documents. Please ensure your documents contain readable text.');
      }

      setProcessingStatus('Generating system design...');
      const response = await fetch('/api/design/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srs_text: combinedSrs,
          context: {
            cloudPreference: form.cloudPreference,
            legacyTech: form.legacyTech,
            teamSkills: form.teamSkills,
            priorities: form.priorities,
            isGreenfield: form.isGreenfield,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate system design');
      }

      const data = await response.json();
      setDesignMarkdown(data.design_markdown || '');
      setProcessingStatus('');
    } catch (err) {
      setError(err.message || 'Failed to generate system design');
      setProcessingStatus('');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!designMarkdown) return;

    try {
      const response = await fetch('/api/design/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design_markdown: designMarkdown }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to export design document');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `System_Design_${new Date().toISOString().split('T')[0]}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to export design document');
    }
  };

  const extractMermaid = () => {
    if (!designMarkdown) return null;
    const match = designMarkdown.match(/```mermaid([\s\S]*?)```/);
    return match ? match[0] : null;
  };

  const mermaidBlock = extractMermaid();

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, #e0f2fe 0, transparent 55%), radial-gradient(circle at bottom right, #ede9fe 0, transparent 55%), #f9fafb',
      }}
    >
      <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
        {/* Header */}
        <header className="mb-8">
          <div className="mb-2">
            <button className="btn btn-secondary" onClick={() => navigate(`/projects/${projectId}/design`)}>
              ← Back to Design Studio
            </button>
          </div>
          <div className="mb-2">
            <span className="badge badge-blue">System Design &amp; Tech Stack Suggestion</span>
          </div>
          <h1
            className="text-2xl font-bold"
            style={{ fontSize: '2rem', marginBottom: '0.75rem' }}
          >
            Consultation Wizard
          </h1>
          <p className="text-gray-600" style={{ maxWidth: '640px' }}>
            Answer a few high‑level questions about your environment and priorities. Any documents you
            marked as "Use in context" in the sidebar will automatically feed the AI (no need to paste SRS).
          </p>
          {contextDocs.length > 0 && (
            <p className="text-sm text-green-700 mt-2">
              Using {contextDocs.length} document(s) marked "Use in context" from the project sidebar.
            </p>
          )}
          {contextDocs.length === 0 && (
            <p className="text-sm text-gray-600 mt-2">
              No context selected yet. Open the sidebar and toggle "Use in context" on an SRS or other doc.
            </p>
          )}
        </header>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem' }}>
          {/* Left: Form */}
          <section className="card">
            <h2 className="text-xl font-semibold mb-2">Context Injection</h2>
            <p className="text-sm text-gray-600 mb-4">
              You can describe your existing environment and constraints, or leave it blank for a{' '}
              <strong>Greenfield / best‑practice</strong> recommendation.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="text-sm font-medium mb-1">Cloud / Infrastructure Preference</label>
                <input
                  className="input"
                  type="text"
                  name="cloudPreference"
                  placeholder="e.g., AWS, Azure, GCP, On‑prem, No preference"
                  value={form.cloudPreference}
                  onChange={handleChange}
                />
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium mb-1">Legacy Systems / Tech to Integrate</label>
                <input
                  className="input"
                  type="text"
                  name="legacyTech"
                  placeholder="e.g., Existing .NET APIs, PHP monolith, Oracle DB"
                  value={form.legacyTech}
                  onChange={handleChange}
                />
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium mb-1">Team Skills</label>
                <input
                  className="input"
                  type="text"
                  name="teamSkills"
                  placeholder="e.g., Strong in JavaScript/TypeScript, some Python, no Go"
                  value={form.teamSkills}
                  onChange={handleChange}
                />
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium mb-1">Business Priorities</label>
                <input
                  className="input"
                  type="text"
                  name="priorities"
                  placeholder="e.g., Speed‑to‑market over scalability, low cost, strict compliance"
                  value={form.priorities}
                  onChange={handleChange}
                />
              </div>

              <div className="mb-4">
                <label className="text-sm">
                  <input
                    type="checkbox"
                    name="isGreenfield"
                    checked={form.isGreenfield}
                    onChange={handleChange}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Treat this as a <strong>Greenfield</strong> project (ignore most legacy constraints and
                  aim for best‑practice recommendations).
                </label>
              </div>

              {processingStatus && (
                <p className="text-sm" style={{ color: '#059669', marginBottom: '0.75rem' }}>
                  {processingStatus}
                </p>
              )}

              {error && (
                <p className="text-sm" style={{ color: '#b91c1c', marginBottom: '0.75rem' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? (processingStatus || 'Generating System Design...') : 'Generate System Design'}
              </button>
            </form>
          </section>

          {/* Right: Output */}
          <section className="card" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="text-xl font-semibold mb-0">Design Document</h2>
              <button
                className="btn btn-secondary"
                onClick={handleDownload}
                disabled={!designMarkdown}
              >
                Download DOCX
              </button>
            </div>

            {!designMarkdown && (
              <p className="text-sm text-gray-600">
                Once generated, your architecture strategy, tech stack recommendations, and Mermaid
                diagram will appear here.
              </p>
            )}

            {designMarkdown && (
              <div style={{ overflowY: 'auto', flex: 1, borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: '0.85rem',
                  }}
                >
                  {designMarkdown}
                </pre>

                {mermaidBlock && (
                  <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-1">Architecture Diagram (Mermaid)</h3>
                    <p className="text-sm text-gray-600 mb-2">
                      This is a Mermaid diagram definition you can render in tools that support Mermaid.
                    </p>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        backgroundColor: '#0f172a',
                        color: '#e5e7eb',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        fontSize: '0.8rem',
                      }}
                    >
                      {mermaidBlock}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}


