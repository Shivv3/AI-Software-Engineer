import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectContext } from './ProjectContext';
import './SystemDesignWizard.css';

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
    <div className="system-design-wizard">
      <div className="workspace-container">
        {/* Header */}
        <header className="system-design-header">
          <button className="system-design-back-button" onClick={() => navigate(`/projects/${projectId}/design`)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Back to Design Studio</span>
          </button>
          <div className="system-design-badge">System Design &amp; Tech Stack Suggestion</div>
          <h1 className="system-design-title">Consultation Wizard</h1>
          <p className="system-design-subtitle">
            Answer a few high‑level questions about your environment and priorities. Any documents you
            marked as "Use in context" in the sidebar will automatically feed the AI (no need to paste SRS).
          </p>
          {contextDocs.length > 0 && (
            <p className="system-design-context-info success">
              Using {contextDocs.length} document(s) marked "Use in context" from the project sidebar.
            </p>
          )}
          {contextDocs.length === 0 && (
            <p className="system-design-context-info info">
              No context selected yet. Open the sidebar and toggle "Use in context" on an SRS or other doc.
            </p>
          )}
        </header>

        <div className="system-design-grid">
          {/* Left: Form */}
          <section className="system-design-form-card">
            <h2 className="system-design-form-title">Context Injection</h2>
            <p className="system-design-form-description">
              You can describe your existing environment and constraints, or leave it blank for a{' '}
              <strong>Greenfield / best‑practice</strong> recommendation.
            </p>

            <form className="system-design-form" onSubmit={handleSubmit}>
              <div className="system-design-form-group">
                <label className="system-design-label">Cloud / Infrastructure Preference</label>
                <input
                  className="system-design-input"
                  type="text"
                  name="cloudPreference"
                  placeholder="e.g., AWS, Azure, GCP, On‑prem, No preference"
                  value={form.cloudPreference}
                  onChange={handleChange}
                />
              </div>

              <div className="system-design-form-group">
                <label className="system-design-label">Legacy Systems / Tech to Integrate</label>
                <input
                  className="system-design-input"
                  type="text"
                  name="legacyTech"
                  placeholder="e.g., Existing .NET APIs, PHP monolith, Oracle DB"
                  value={form.legacyTech}
                  onChange={handleChange}
                />
              </div>

              <div className="system-design-form-group">
                <label className="system-design-label">Team Skills</label>
                <input
                  className="system-design-input"
                  type="text"
                  name="teamSkills"
                  placeholder="e.g., Strong in JavaScript/TypeScript, some Python, no Go"
                  value={form.teamSkills}
                  onChange={handleChange}
                />
              </div>

              <div className="system-design-form-group">
                <label className="system-design-label">Business Priorities</label>
                <input
                  className="system-design-input"
                  type="text"
                  name="priorities"
                  placeholder="e.g., Speed‑to‑market over scalability, low cost, strict compliance"
                  value={form.priorities}
                  onChange={handleChange}
                />
              </div>

              <div className="system-design-form-group">
                <div className="system-design-checkbox-group">
                  <input
                    type="checkbox"
                    name="isGreenfield"
                    checked={form.isGreenfield}
                    onChange={handleChange}
                    className="system-design-checkbox"
                  />
                  <label className="system-design-checkbox-label">
                    Treat this as a <strong>Greenfield</strong> project (ignore most legacy constraints and
                    aim for best‑practice recommendations).
                  </label>
                </div>
              </div>

              {processingStatus && (
                <p className="system-design-status processing">
                  {processingStatus}
                </p>
              )}

              {error && (
                <p className="system-design-status error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="system-design-submit-button"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                        <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                      </circle>
                    </svg>
                    <span>{processingStatus || 'Generating System Design...'}</span>
                  </>
                ) : (
                  <>
                    <span>Generate System Design</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </>
                )}
              </button>
            </form>
          </section>

          {/* Right: Output */}
          <section className="system-design-output-card">
            <div className="system-design-output-header">
              <h2 className="system-design-output-title">Design Document</h2>
              <button
                className="system-design-download-button"
                onClick={handleDownload}
                disabled={!designMarkdown}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 11L3 6H6V1H10V6H13L8 11Z" fill="currentColor"/>
                  <path d="M2 13H14V15H2V13Z" fill="currentColor"/>
                </svg>
                <span>Download DOCX</span>
              </button>
            </div>

            {!designMarkdown && (
              <p className="system-design-output-placeholder">
                Once generated, your architecture strategy, tech stack recommendations, and Mermaid
                diagram will appear here.
              </p>
            )}

            {designMarkdown && (
              <div className="system-design-output-content">
                <pre className="system-design-output-pre">
                  {designMarkdown}
                </pre>

                {mermaidBlock && (
                  <div className="system-design-mermaid-section">
                    <h3 className="system-design-mermaid-title">Architecture Diagram (Mermaid)</h3>
                    <p className="system-design-mermaid-description">
                      This is a Mermaid diagram definition you can render in tools that support Mermaid.
                    </p>
                    <pre className="system-design-mermaid-pre">
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


