import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [renderError, setRenderError] = useState('');

  const mermaidContainerRef = useRef(null);
  const renderIdRef = useRef(0);

  const contextDocs = useMemo(() => documents.filter((d) => d.useAsContext), [documents]);

  // ── Mermaid client-side rendering ──────────────────────────────────────

  const loadMermaid = useCallback(async () => {
    if (window.mermaid) return window.mermaid;
    // Dynamically load Mermaid from CDN
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[data-mermaid-loader]')) {
        // Script already loading, wait for it
        const check = setInterval(() => {
          if (window.mermaid) { clearInterval(check); resolve(window.mermaid); }
        }, 100);
        setTimeout(() => { clearInterval(check); reject(new Error('Mermaid load timeout')); }, 15000);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
      script.setAttribute('data-mermaid-loader', 'true');
      script.onload = () => {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#0f172a',
            primaryColor: '#8b5cf6',
            primaryTextColor: '#e2e8f0',
            primaryBorderColor: '#6d28d9',
            lineColor: '#94a3b8',
            secondaryColor: '#1e293b',
            tertiaryColor: '#334155',
            noteBkgColor: '#1e293b',
            noteTextColor: '#e2e8f0',
            noteBorderColor: '#475569',
            actorBkg: '#1e293b',
            actorBorder: '#8b5cf6',
            actorTextColor: '#e2e8f0',
            actorLineColor: '#94a3b8',
            signalColor: '#e2e8f0',
            signalTextColor: '#e2e8f0',
            labelBoxBkgColor: '#1e293b',
            labelBoxBorderColor: '#475569',
            labelTextColor: '#e2e8f0',
            loopTextColor: '#e2e8f0',
            activationBorderColor: '#8b5cf6',
            activationBkgColor: '#1e293b',
            sequenceNumberColor: '#8b5cf6',
          },
          securityLevel: 'loose',
          fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
        });
        resolve(window.mermaid);
      };
      script.onerror = () => reject(new Error('Failed to load Mermaid library'));
      document.head.appendChild(script);
    });
  }, []);

  const renderMermaidDiagram = useCallback(async (code) => {
    if (!code || !mermaidContainerRef.current) return;
    setRenderError('');
    renderIdRef.current += 1;
    const thisRenderId = renderIdRef.current;

    try {
      const mermaid = await loadMermaid();
      // Clear container
      mermaidContainerRef.current.innerHTML = '';

      // Create a fresh element for rendering
      const uniqueId = `mermaid-diagram-${Date.now()}`;
      const el = document.createElement('div');
      el.id = uniqueId;
      el.textContent = code;
      mermaidContainerRef.current.appendChild(el);

      // Render
      const { svg } = await mermaid.render(uniqueId + '-svg', code);
      if (thisRenderId !== renderIdRef.current) return; // stale render
      mermaidContainerRef.current.innerHTML = svg;

      // Style the rendered SVG
      const svgEl = mermaidContainerRef.current.querySelector('svg');
      if (svgEl) {
        svgEl.style.maxWidth = '100%';
        svgEl.style.height = 'auto';
        svgEl.style.borderRadius = '0.75rem';
      }
    } catch (err) {
      if (thisRenderId !== renderIdRef.current) return;
      console.error('Mermaid render error:', err);
      setRenderError(err.message || 'Failed to render diagram');
      // Show the raw mermaid code as fallback
      if (mermaidContainerRef.current) {
        mermaidContainerRef.current.innerHTML = `<pre class="diagram-code-block">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
      }
    }
  }, [loadMermaid]);

  // Re-render when result changes
  useEffect(() => {
    if (result?.mermaid_code) {
      renderMermaidDiagram(result.mermaid_code);
    }
  }, [result?.mermaid_code, renderMermaidDiagram]);

  // ── Document extraction helpers ────────────────────────────────────────

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

  // ── Submit ─────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setSaveMessage('');
    setRenderError('');

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

      setStatus('Generating diagram — this may take a moment...');
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

  // ── Download as PNG ────────────────────────────────────────────────────

  const handleDownload = async () => {
    if (!mermaidContainerRef.current) return;
    const svgEl = mermaidContainerRef.current.querySelector('svg');
    if (!svgEl) {
      setError('No rendered diagram to download.');
      return;
    }

    try {
      // Convert SVG to PNG via canvas
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2; // 2x for retina quality
        canvas.width = img.naturalWidth * scale;
        canvas.height = img.naturalHeight * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        // Draw white background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `${diagramType}_diagram_${new Date().toISOString().split('T')[0]}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        // Fallback: download as SVG
        const link = document.createElement('a');
        link.href = URL.createObjectURL(svgBlob);
        link.download = `${diagramType}_diagram_${new Date().toISOString().split('T')[0]}.svg`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      };
      img.src = url;
    } catch {
      setError('Failed to export diagram as PNG.');
    }
  };

  // ── Save to sidebar ────────────────────────────────────────────────────

  const handleSaveToSidebar = async () => {
    if (!result?.mermaid_code) {
      setError('No diagram available to save.');
      return;
    }

    const dateTag = new Date().toISOString().split('T')[0];
    const typeName = diagramTypes.find((t) => t.value === (result.diagram_type || diagramType));
    await addDocument({
      name: `${typeName?.label || diagramType} ${dateTag}`,
      type: 'Diagram',
      mime: 'text/plain',
      content: `[Mermaid Diagram: ${typeName?.label || diagramType}]\n\n${result.mermaid_code}`,
      useAsContext: false,
      createdAt: new Date().toISOString(),
    });
    setSaveMessage('Saved to sidebar');
    setError('');
    setTimeout(() => setSaveMessage(''), 4000);
  };

  // ── Copy Mermaid code ──────────────────────────────────────────────────

  const handleCopyCode = async () => {
    if (!result?.mermaid_code) return;
    try {
      await navigator.clipboard.writeText(result.mermaid_code);
      setSaveMessage('Mermaid code copied!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch {
      setError('Failed to copy to clipboard.');
    }
  };

  const diagramTypes = [
    { value: 'sequence', label: 'Sequence Diagram', description: 'Show interactions between components over time', icon: '↔' },
    { value: 'er', label: 'ER Diagram', description: 'Entity-relationship model for database structure', icon: '⬡' },
    { value: 'dataflow', label: 'Data Flow Diagram', description: 'Show how data moves through the system', icon: '⇢' },
    { value: 'usecase', label: 'Use Case Diagram', description: 'Show actors and use cases', icon: '👤' },
    { value: 'architecture', label: 'Architecture Diagram', description: 'High-level system architecture', icon: '🏗' },
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
              </label>

              <div className="diagram-type-grid">
                {diagramTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    className={`diagram-type-card ${diagramType === type.value ? 'selected' : ''}`}
                    onClick={() => setDiagramType(type.value)}
                  >
                    <span className="diagram-type-icon">{type.icon}</span>
                    <span className="diagram-type-name">{type.label}</span>
                    <span className="diagram-type-desc">{type.description}</span>
                  </button>
                ))}
              </div>

              <label className="diagram-label">
                Diagram Details (optional)
                <textarea
                  className="diagram-textarea"
                  rows={8}
                  value={projectInfo}
                  onChange={(e) => setProjectInfo(e.target.value)}
                  placeholder="Add any specific flows, entities, or notes to guide the diagram. Context documents marked as 'Use in context' will be included automatically."
                />
              </label>

              {status && <div className="diagram-status">{status}</div>}
              {error && <div className="diagram-error">{error}</div>}
              {saveMessage && <div className="diagram-success">{saveMessage}</div>}

              <button className="diagram-submit" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <span className="diagram-spinner"></span>
                    Generating...
                  </>
                ) : 'Generate Diagram'}
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
                  disabled={!result?.mermaid_code}
                  title="Download as PNG"
                >
                  ⬇ PNG
                </button>
                <button
                  className="diagram-action"
                  onClick={handleCopyCode}
                  disabled={!result?.mermaid_code}
                  title="Copy Mermaid code"
                >
                  📋 Code
                </button>
                <button
                  className="diagram-action secondary"
                  onClick={handleSaveToSidebar}
                  disabled={!result?.mermaid_code}
                  title="Save to project sidebar"
                >
                  💾 Save
                </button>
              </div>
            </div>

            {!result && (
              <div className="diagram-empty-state">
                <div className="diagram-empty-icon">📐</div>
                <p className="diagram-placeholder">
                  Select a diagram type, provide your project info, and click &quot;Generate Diagram&quot; to create your visualization.
                </p>
              </div>
            )}

            {result && (
              <div className="diagram-output-content">
                {renderError && (
                  <div className="diagram-error" style={{ marginBottom: '1rem' }}>
                    Render issue: {renderError}
                  </div>
                )}
                <div className="diagram-render-container" ref={mermaidContainerRef}>
                  <div className="diagram-render-loading">
                    <span className="diagram-spinner"></span>
                    Rendering diagram...
                  </div>
                </div>

                {result.mermaid_code && (
                  <details className="diagram-code-details">
                    <summary>View Mermaid Source Code</summary>
                    <pre className="diagram-code-block">{result.mermaid_code}</pre>
                  </details>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
