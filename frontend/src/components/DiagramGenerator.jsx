import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectContext } from './ProjectContext';
import './DiagramGenerator.css';

export default function DiagramGenerator() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { documents, addDocument, projectName } = useProjectContext();

  const API_BASE = import.meta.env.VITE_API_BASE || '/api';
  const [diagramType, setDiagramType] = useState('');
  const [projectInfo, setProjectInfo] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');

  const contextDocs = useMemo(() => documents.filter((d) => d.useAsContext), [documents]);

  const isPdfDataUri = (content) => typeof content === 'string' && content.startsWith('data:application/pdf;base64,');
  const isDocxDataUri = (content, mime) => {
    if (typeof content !== 'string') return false;
    return (
      content.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,') ||
      content.startsWith('data:application/msword;base64,') ||
      (mime && (mime.includes('wordprocessingml') || mime.includes('msword') || mime.includes('word')))
    );
  };
  const isDataUri = (content) => typeof content === 'string' && content.startsWith('data:');

  const extractTextFromDocument = async (doc) => {
    const { content, mime, name } = doc;
    if (!content) return null;
    if (!isDataUri(content)) return content;

    let fileType = 'document';
    if (isPdfDataUri(content)) fileType = 'PDF';
    else if (isDocxDataUri(content, mime)) fileType = 'DOCX';
    else if (content.startsWith('data:text/')) fileType = 'text file';

    setStatus(`Extracting text from ${fileType}: ${name || 'document'}...`);
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
    return data.text || '';
  };

  const buildContextText = async () => {
    if (contextDocs.length === 0) return '';
    const extracted = await Promise.all(contextDocs.map((doc) => extractTextFromDocument(doc)));
    return extracted
      .filter((text) => text && text.trim())
      .map((text, idx) => {
        const doc = contextDocs[idx];
        return doc.name ? `---\n[${doc.name}]\n${text}` : text;
      })
      .join('\n\n');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setSaveMessage('');

    if (!diagramType) {
      setError('Please select a diagram type.');
      return;
    }

    const projectInfoText = projectInfo.trim();

    if (!projectInfoText && contextDocs.length === 0) {
      setError('Provide diagram details or mark at least one sidebar document as "Use in context".');
      return;
    }

    setLoading(true);
    try {
      setStatus(contextDocs.length ? 'Gathering context documents...' : 'Preparing request...');
      const contextText = await buildContextText();

      setStatus('Generating diagram...');
      const response = await fetch(`${API_BASE}/design/diagram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagram_type: diagramType,
          project_info: projectInfoText,
          context_text: contextText,
        }),
      });

      if (!response.ok) {
        let message = 'Failed to generate diagram';
        try {
          const data = await response.json();
          if (data?.error) message = data.error;
        } catch {
          try {
            const text = await response.text();
            if (text) message = text;
          } catch {
            // ignore
          }
        }
        throw new Error(message);
      }

      const data = await response.json();
      setResult(data);
      setStatus('');
    } catch (err) {
      setError(err.message || 'Failed to generate diagram');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result?.image_data) {
      setError('No diagram image available to download.');
      return;
    }

    const link = document.createElement('a');
    link.href = result.image_data;
    link.download = `${diagramType}_diagram_${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleSaveToSidebar = async () => {
    if (!result?.image_data) {
      setError('No diagram image available to save.');
      return;
    }

    const dateTag = new Date().toISOString().split('T')[0];
    await addDocument({
      name: `${diagramType.charAt(0).toUpperCase() + diagramType.slice(1)} Diagram ${dateTag}`,
      type: 'Diagram',
      mime: 'image/png',
      content: result.image_data,
      useAsContext: false,
      createdAt: new Date().toISOString(),
    });
    setSaveMessage('Saved to sidebar');
    setError('');
    setTimeout(() => setSaveMessage(''), 4000);
  };

  const diagramTypes = [
    { value: 'sequence', label: 'Sequence Diagram', description: 'Show interactions between components over time' },
    { value: 'er', label: 'ER Diagram', description: 'Entity-relationship model showing database structure' },
    { value: 'dataflow', label: 'Data Flow Diagram', description: 'Show how data moves through the system' },
    { value: 'usecase', label: 'Use Case Diagram', description: 'Show actors and use cases' },
    { value: 'architecture', label: 'Architecture Diagram', description: 'High-level system architecture overview' },
  ];

  return (
    <div className="diagram-generator">
      <div className="workspace-container">
        <header className="diagram-header">
          <button className="diagram-back-button" onClick={() => navigate(`/projects/${projectId}/design`)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Back to Design Studio</span>
          </button>
          <div className="diagram-badge">Phase 2 · Automated Diagram Generator</div>
          <h1 className="diagram-title">System Design Diagram Generator</h1>
          <p className="diagram-subtitle">
            Generate visual diagrams from your project documentation. Choose a diagram type and provide information
            or select a file from the sidebar. {projectName ? `Workspace: ${projectName}.` : ''}
          </p>
          {contextDocs.length > 0 && (
            <p className="diagram-context success">
              Using {contextDocs.length} document(s) from the sidebar as additional context.
            </p>
          )}
        </header>

        <div className="diagram-grid">
          <section className="diagram-card">
            <h2 className="diagram-card-title">Configure Diagram</h2>
            <p className="diagram-card-description">
              Select the type of diagram you want to generate and provide optional details. Documents marked
              &quot;Use in context&quot; in the sidebar are automatically included.
            </p>
            <form className="diagram-form" onSubmit={handleSubmit}>
              <label className="diagram-label">
                Diagram Type *
                <select
                  className="diagram-select"
                  value={diagramType}
                  onChange={(e) => setDiagramType(e.target.value)}
                  required
                >
                  <option value="">Select a diagram type...</option>
                  {diagramTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label} - {type.description}
                    </option>
                  ))}
                </select>
              </label>

              <label className="diagram-label">
                Diagram Details (optional)
                <textarea
                  className="diagram-textarea"
                  rows={10}
                  value={projectInfo}
                  onChange={(e) => setProjectInfo(e.target.value)}
                  placeholder="Add any specific flows, entities, or notes to guide the diagram. Context documents marked as 'Use in context' will be included automatically."
                />
              </label>

              {status && <div className="diagram-status">{status}</div>}
              {error && <div className="diagram-error">{error}</div>}
              {saveMessage && <div className="diagram-success">{saveMessage}</div>}

              <button className="diagram-submit" type="submit" disabled={loading}>
                {loading ? 'Generating...' : 'Generate Diagram'}
              </button>
            </form>
          </section>

          <section className="diagram-output-card">
            <div className="diagram-output-header">
              <div>
                <h2 className="diagram-card-title">Generated Diagram</h2>
                {result?.diagram_type && (
                  <p className="diagram-model">
                    Type: {diagramTypes.find((t) => t.value === result.diagram_type)?.label || result.diagram_type}
                  </p>
                )}
              </div>
              <div className="diagram-output-actions">
                <button
                  className="diagram-action"
                  onClick={handleDownload}
                  disabled={!result?.image_data}
                >
                  Download PNG
                </button>
                <button
                  className="diagram-action secondary"
                  onClick={handleSaveToSidebar}
                  disabled={!result?.image_data}
                >
                  Save to sidebar
                </button>
              </div>
            </div>

            {!result && (
              <p className="diagram-placeholder">
                The generated diagram will appear here. Select a diagram type, provide information or select a file,
                and click "Generate Diagram" to create your visualization.
              </p>
            )}

            {result && (
              <div className="diagram-output-content">
                {result.image_data ? (
                  <div className="diagram-image-container">
                    <img
                      src={result.image_data}
                      alt={`${result.diagram_type} diagram`}
                      className="diagram-image"
                    />
                  </div>
                ) : result.mermaid_code ? (
                  <div className="diagram-fallback">
                    <p className="diagram-error">
                      {result.error || 'Diagram could not be rendered as image. Mermaid code is available below.'}
                    </p>
                    <details>
                      <summary>View Mermaid Code</summary>
                      <pre className="diagram-code-block">{result.mermaid_code}</pre>
                    </details>
                  </div>
                ) : (
                  <p className="diagram-error">No diagram data available.</p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

