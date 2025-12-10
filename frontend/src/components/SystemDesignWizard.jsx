import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectContext } from './ProjectContext';
import './SystemDesignWizard.css';

export default function SystemDesignWizard() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { documents, projectName, addDocument } = useProjectContext();
  const API_BASE = import.meta.env.VITE_API_BASE || '/api';

  const [form, setForm] = useState({
    cloudPreference: '',
    legacyTech: '',
    teamSkills: '',
    priorities: '',
    isGreenfield: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const [designResult, setDesignResult] = useState(null);
  const [activeTab, setActiveTab] = useState('high_level_design');
  const [saveMessage, setSaveMessage] = useState('');
  const contextDocs = useMemo(() => documents.filter((d) => d.useAsContext), [documents]);

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
    setSaveMessage('');

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
      const response = await fetch(`${API_BASE}/design/system`, {
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
      setDesignResult(data);
      setProcessingStatus('');
      setActiveTab('high_level_design');
    } catch (err) {
      setError(err.message || 'Failed to generate system design');
      setProcessingStatus('');
    } finally {
      setLoading(false);
    }
  };

  const renderList = (items) =>
    !items || items.length === 0 ? (
      <p className="design-empty">No details provided.</p>
    ) : (
      <ul className="design-list">
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    );

  const downloadText = (filename, content) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const toExportText = (result) => {
    if (!result) return '';
    const { high_level_design, tech_stack, implementation_architecture, assumptions, next_steps, design_text } = result;
    if (design_text) return design_text;
    const lines = [];
    if (high_level_design) {
      lines.push('High-Level Design');
      lines.push('- Summary:', high_level_design.summary || '');
      lines.push('- Key components:', ...(high_level_design.key_components || []));
      lines.push('- Data flow:', ...(high_level_design.data_flow || []));
      lines.push('- Integration points:', ...(high_level_design.integration_points || []), '');
    }
    if (tech_stack) {
      lines.push('Tech Stack & Reasoning');
      lines.push('- Frontend:', ...(tech_stack.frontend || []));
      lines.push('- Backend:', ...(tech_stack.backend || []));
      lines.push('- Data:', ...(tech_stack.data || []));
      lines.push('- Infrastructure:', ...(tech_stack.infrastructure || []));
      lines.push('- Observability:', ...(tech_stack.observability || []));
      lines.push('- Reasoning:', tech_stack.reasoning || '');
      lines.push('- Alternatives:', ...(tech_stack.alternatives || []), '');
    }
    if (implementation_architecture) {
      lines.push('Implementation Architecture');
      lines.push('- Style:', implementation_architecture.style || '');
      lines.push('- Services:', ...(implementation_architecture.services || []));
      lines.push('- API strategy:', implementation_architecture.api_strategy || '');
      lines.push('- Data strategy:', implementation_architecture.data_strategy || '');
      lines.push('- Scalability:', implementation_architecture.scalability || '');
      lines.push('- Security:', implementation_architecture.security || '');
      lines.push('- Tradeoffs:', ...(implementation_architecture.tradeoffs || []), '');
    }
    if (assumptions?.length) {
      lines.push('Assumptions:', ...assumptions, '');
    }
    if (next_steps?.length) {
      lines.push('Next steps:', ...next_steps, '');
    }
    return lines.join('\n');
  };

  const handleDownload = () => {
    const txt = toExportText(designResult);
    if (!txt.trim()) {
      setError('Nothing to download. Generate a design first.');
      return;
    }
    const dateTag = new Date().toISOString().split('T')[0];
    downloadText(`System_Design_${dateTag}.txt`, txt);
  };

  const handleSave = async () => {
    const txt = toExportText(designResult);
    if (!txt.trim()) {
      setError('Nothing to save. Generate a design first.');
      return;
    }
    const dateTag = new Date().toISOString().split('T')[0];
    await addDocument({
      name: `System Design ${dateTag}`,
      type: 'Design',
      mime: 'text/plain',
      content: txt,
      useAsContext: true,
      createdAt: new Date().toISOString(),
    });
    setSaveMessage('Saved to sidebar and marked for context');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const renderTabs = () => {
    if (!designResult) {
      return (
        <p className="design-output-placeholder">
          Once generated, your architecture strategy and tech stack recommendations will appear here.
        </p>
      );
    }

    const { high_level_design, tech_stack, implementation_architecture, assumptions, next_steps, design_text } = designResult;

    const renderTabContent = () => {
      if (design_text) {
        return (
          <div className="design-tab-panel">
            <pre className="design-output-pre">{design_text}</pre>
          </div>
        );
      }
      switch (activeTab) {
        case 'high_level_design':
          return (
            <div className="design-tab-panel">
              <h3>High-Level Design</h3>
              {high_level_design?.summary && <p className="design-body">{high_level_design.summary}</p>}
              <h4>Key components</h4>
              {renderList(high_level_design?.key_components)}
              <h4>Data flow</h4>
              {renderList(high_level_design?.data_flow)}
              <h4>Integration points</h4>
              {renderList(high_level_design?.integration_points)}
            </div>
          );
        case 'tech_stack':
          return (
            <div className="design-tab-panel">
              <h3>Tech Stack &amp; Reasoning</h3>
              <h4>Frontend</h4>
              {renderList(tech_stack?.frontend)}
              <h4>Backend</h4>
              {renderList(tech_stack?.backend)}
              <h4>Data</h4>
              {renderList(tech_stack?.data)}
              <h4>Infrastructure</h4>
              {renderList(tech_stack?.infrastructure)}
              <h4>Observability</h4>
              {renderList(tech_stack?.observability)}
              {tech_stack?.reasoning && (
                <p className="design-body">
                  <strong>Reasoning:</strong> {tech_stack.reasoning}
                </p>
              )}
              <h4>Alternatives</h4>
              {renderList(tech_stack?.alternatives)}
            </div>
          );
        case 'implementation_architecture':
          return (
            <div className="design-tab-panel">
              <h3>Implementation Architecture</h3>
              {implementation_architecture?.style && (
                <p className="design-body">
                  <strong>Style:</strong> {implementation_architecture.style}
                </p>
              )}
              <h4>Services / Modules</h4>
              {renderList(implementation_architecture?.services)}
              {implementation_architecture?.api_strategy && (
                <p className="design-body">
                  <strong>API strategy:</strong> {implementation_architecture.api_strategy}
                </p>
              )}
              {implementation_architecture?.data_strategy && (
                <p className="design-body">
                  <strong>Data strategy:</strong> {implementation_architecture.data_strategy}
                </p>
              )}
              {implementation_architecture?.scalability && (
                <p className="design-body">
                  <strong>Scalability:</strong> {implementation_architecture.scalability}
                </p>
              )}
              {implementation_architecture?.security && (
                <p className="design-body">
                  <strong>Security:</strong> {implementation_architecture.security}
                </p>
              )}
              <h4>Trade-offs</h4>
              {renderList(implementation_architecture?.tradeoffs)}
            </div>
          );
        case 'assumptions':
          return (
            <div className="design-tab-panel">
              <h3>Assumptions</h3>
              {renderList(assumptions)}
            </div>
          );
        case 'next_steps':
          return (
            <div className="design-tab-panel">
              <h3>Next Steps</h3>
              {renderList(next_steps)}
            </div>
          );
        default:
          return null;
      }
    };

    return (
      <>
        <div className="design-tabs">
          <button
            className={`design-tab ${activeTab === 'high_level_design' ? 'active' : ''}`}
            onClick={() => setActiveTab('high_level_design')}
          >
            High-Level Design
          </button>
          <button
            className={`design-tab ${activeTab === 'tech_stack' ? 'active' : ''}`}
            onClick={() => setActiveTab('tech_stack')}
          >
            Tech Stack &amp; Reasoning
          </button>
          <button
            className={`design-tab ${activeTab === 'implementation_architecture' ? 'active' : ''}`}
            onClick={() => setActiveTab('implementation_architecture')}
          >
            Implementation Architecture
          </button>
          <button
            className={`design-tab ${activeTab === 'assumptions' ? 'active' : ''}`}
            onClick={() => setActiveTab('assumptions')}
          >
            Assumptions
          </button>
          <button
            className={`design-tab ${activeTab === 'next_steps' ? 'active' : ''}`}
            onClick={() => setActiveTab('next_steps')}
          >
            Next Steps
          </button>
        </div>
        {renderTabContent()}
      </>
    );
  };

  return (
    <div className="system-design-wizard">
      <div className="workspace-container">
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
            Provide constraints and environment details. Documents marked "Use in context" are automatically included.
          </p>
          {contextDocs.length > 0 ? (
            <p className="system-design-context-info success">
              Using {contextDocs.length} document(s) marked "Use in context" from the project sidebar.
            </p>
          ) : (
            <p className="system-design-context-info info">
              No context selected yet. Open the sidebar and toggle "Use in context" on an SRS or other doc.
            </p>
          )}
        </header>

        <div className="system-design-grid">
          <section className="system-design-form-card">
            <h2 className="system-design-form-title">Context Injection</h2>
            <p className="system-design-form-description">
              Describe cloud preference, legacy systems, team skills, and business priorities. Toggle greenfield if applicable.
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

              {saveMessage && (
                <p className="system-design-status success">
                  {saveMessage}
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

          <section className="system-design-output-card">
            <div className="system-design-output-header">
              <h2 className="system-design-output-title">Design Output</h2>
              <div className="system-design-actions">
                <button
                  className="system-design-download-button"
                  onClick={handleDownload}
                  disabled={!designResult}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 11L3 6H6V1H10V6H13L8 11Z" fill="currentColor"/>
                    <path d="M2 13H14V15H2V13Z" fill="currentColor"/>
                  </svg>
                  <span>Download</span>
                </button>
                <button
                  className="system-design-download-button ghost"
                  onClick={handleSave}
                  disabled={!designResult}
                >
                  <span>Save to sidebar</span>
                </button>
              </div>
            </div>

            <div className="system-design-output-content">
              {renderTabs()}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

