import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectContext } from './ProjectContext';
import './DatabaseSchemaGenerator.css';

export default function DatabaseSchemaGenerator() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { documents, addDocument, projectName } = useProjectContext();

  const API_BASE = import.meta.env.VITE_API_BASE || '/api';
  const [requirementsText, setRequirementsText] = useState('');
  const [outputFormat, setOutputFormat] = useState('auto');
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

    const trimmed = requirementsText.trim();
    if (!trimmed) {
      setError('Please provide data models, entities, or user stories to generate a schema.');
      return;
    }

    setLoading(true);
    try {
      setStatus(contextDocs.length ? 'Gathering context documents...' : 'Preparing prompt...');
      const contextText = await buildContextText();

      setStatus('Generating schema...');
      const response = await fetch(`${API_BASE}/design/schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirements_text: trimmed,
          output_format: outputFormat,
          context_text: contextText,
        }),
      });

      if (!response.ok) {
        // Try to surface meaningful server feedback even if response is HTML/text
        let message = 'Failed to generate schema';
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
      setError(err.message || 'Failed to generate schema');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setSaveMessage('Copied to clipboard');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setError('Could not copy to clipboard');
    }
  };

  const handleSaveToSidebar = async () => {
    if (!result) return;
    const dateTag = new Date().toISOString().split('T')[0];
    const ddl = result.ddl_sql || '';
    const nosql = Array.isArray(result.nosql_collections) && result.nosql_collections.length > 0
      ? JSON.stringify(result.nosql_collections, null, 2)
      : '';
    const entities = Array.isArray(result.entities) ? JSON.stringify(result.entities, null, 2) : '';
    const fallback = result.schema_text || '';
    const content = [ddl, nosql, entities, fallback].filter((part) => part && part.trim()).join('\n\n');

    if (!content) {
      setError('Nothing to save yet. Generate a schema first.');
      return;
    }

    await addDocument({
      name: `Database Schema ${dateTag}`,
      type: 'Schema',
      mime: 'text/plain',
      content,
      useAsContext: true,
      createdAt: new Date().toISOString(),
    });
    setSaveMessage('Saved to sidebar and marked for context');
    setError('');
    setTimeout(() => setSaveMessage(''), 4000);
  };

  const renderEntities = () => {
    if (!result?.entities || result.entities.length === 0) return null;
    return (
      <div className="schema-section">
        <div className="schema-section-header">
          <h3>Entities &amp; Fields</h3>
          <span className="schema-chip">{result.entities.length} entities</span>
        </div>
        <div className="schema-entity-list">
          {result.entities.map((entity) => (
            <div key={entity.name} className="schema-entity-card">
              <div className="schema-entity-header">
                <div>
                  <h4>{entity.name}</h4>
                  {entity.description && <p className="schema-entity-description">{entity.description}</p>}
                </div>
                {entity.indexes?.length ? (
                  <span className="schema-chip subtle">{entity.indexes.length} index{entity.indexes.length > 1 ? 'es' : ''}</span>
                ) : null}
              </div>
              {entity.fields?.length ? (
                <div className="schema-fields-grid">
                  {entity.fields.map((field) => (
                    <div key={field.name} className="schema-field">
                      <div className="schema-field-name">{field.name}</div>
                      <div className="schema-field-type">{field.type}</div>
                      <div className="schema-field-meta">
                        {field.is_primary_key && <span className="schema-pill primary">PK</span>}
                        {field.is_unique && <span className="schema-pill">Unique</span>}
                        {field.nullable === false && <span className="schema-pill">Not null</span>}
                        {field.references && <span className="schema-pill link">Refs {field.references}</span>}
                      </div>
                      {field.notes && <p className="schema-field-notes">{field.notes}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="schema-empty">No fields returned.</p>
              )}
              {entity.indexes?.length ? (
                <div className="schema-indexes">
                  <div className="schema-indexes-title">Indexes</div>
                  <ul>
                    {entity.indexes.map((idx, i) => (
                      <li key={i}>{idx}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {entity.notes && <p className="schema-entity-notes">{entity.notes}</p>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderNosql = () => {
    if (!result?.nosql_collections || result.nosql_collections.length === 0) return null;
    return (
      <div className="schema-section">
        <div className="schema-section-header">
          <h3>NoSQL Collections</h3>
          <span className="schema-chip">{result.nosql_collections.length} collections</span>
        </div>
        <div className="schema-collection-list">
          {result.nosql_collections.map((collection) => (
            <div key={collection.name} className="schema-collection-card">
              <div className="schema-collection-header">
                <h4>{collection.name}</h4>
                {collection.indexes?.length ? (
                  <span className="schema-chip subtle">{collection.indexes.length} index{collection.indexes.length > 1 ? 'es' : ''}</span>
                ) : null}
              </div>
              {collection.notes && <p className="schema-collection-notes">{collection.notes}</p>}
              {collection.document_example && (
                <pre className="schema-code-block">
{JSON.stringify(collection.document_example, null, 2)}
                </pre>
              )}
              {collection.indexes?.length ? (
                <div className="schema-indexes">
                  <div className="schema-indexes-title">Indexes</div>
                  <ul>
                    {collection.indexes.map((idx, i) => (
                      <li key={i}>{idx}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAssumptions = () => {
    const assumptions = result?.assumptions || [];
    if (!assumptions.length) return null;
    return (
      <div className="schema-section">
        <h3>Assumptions &amp; Open Questions</h3>
        <ul className="schema-list">
          {assumptions.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>
    );
  };

  const renderRelationships = () => {
    const relationships = result?.relationships || [];
    if (!relationships.length) return null;
    return (
      <div className="schema-section">
        <h3>Relationships</h3>
        <ul className="schema-list">
          {relationships.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>
    );
  };

  const renderSampleQueries = () => {
    const queries = result?.sample_queries || [];
    if (!queries.length) return null;
    return (
      <div className="schema-section">
        <h3>Sample Queries</h3>
        <ul className="schema-list">
          {queries.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="schema-generator">
      <div className="workspace-container">
        <header className="schema-header">
          <button className="schema-back-button" onClick={() => navigate(`/projects/${projectId}/design`)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Back to Design Studio</span>
          </button>
          <div className="schema-badge">Phase 2 · Data Design</div>
          <h1 className="schema-title">Database Schema Generator</h1>
          <p className="schema-subtitle">
            Paste key entities, data models, or user stories. We will identify tables/collections, relationships,
            and deliver SQL DDL or JSON schemas. {projectName ? `Workspace: ${projectName}.` : ''}
          </p>
          {contextDocs.length > 0 ? (
            <p className="schema-context success">
              Using {contextDocs.length} document(s) from the sidebar as additional context.
            </p>
          ) : (
            <p className="schema-context info">
              Tip: mark SRS or reference docs as "Use in context" in the sidebar to ground the schema.
            </p>
          )}
        </header>

        <div className="schema-grid">
          <section className="schema-card">
            <h2 className="schema-card-title">Describe your data</h2>
            <p className="schema-card-description">
              Provide entities, user stories, or acceptance criteria that imply data requirements. Add constraints or
              performance hints if you have them.
            </p>
            <form className="schema-form" onSubmit={handleSubmit}>
              <label className="schema-label">
                Data models / user stories
                <textarea
                  className="schema-textarea"
                  rows={10}
                  value={requirementsText}
                  onChange={(e) => setRequirementsText(e.target.value)}
                  placeholder="- As a customer I can create an account...\n- Entity: Order { id, status, total, customer_id, placed_at }\n- High read volume on product catalog; writes are moderate."
                />
              </label>

              <div className="schema-options">
                <label className="schema-label">
                  Output format
                  <select
                    className="schema-select"
                    value={outputFormat}
                    onChange={(e) => setOutputFormat(e.target.value)}
                  >
                    <option value="auto">Auto (let the AI choose)</option>
                    <option value="relational">Relational (SQL DDL)</option>
                    <option value="nosql">NoSQL (JSON structure)</option>
                  </select>
                </label>
                <div className="schema-helper">
                  We always include entity metadata; SQL DDL appears when relational makes sense, JSON when NoSQL fits.
                </div>
              </div>

              {status && <div className="schema-status">{status}</div>}
              {error && <div className="schema-error">{error}</div>}
              {saveMessage && <div className="schema-success">{saveMessage}</div>}

              <button className="schema-submit" type="submit" disabled={loading}>
                {loading ? 'Generating...' : 'Generate schema'}
              </button>
            </form>
          </section>

          <section className="schema-output-card">
            <div className="schema-output-header">
              <div>
                <h2 className="schema-card-title">Result</h2>
                {result?.database_model && (
                  <p className="schema-model">Model: {result.database_model}</p>
                )}
              </div>
              <div className="schema-output-actions">
                <button className="schema-action" onClick={() => handleCopy(result?.ddl_sql || result?.schema_text || '')} disabled={!result}>
                  Copy SQL / Text
                </button>
                <button className="schema-action secondary" onClick={handleSaveToSidebar} disabled={!result}>
                  Save to sidebar
                </button>
              </div>
            </div>

            {!result && (
              <p className="schema-placeholder">
                The generated schema will appear here with entities, relationships, and DDL/JSON. It will also highlight
                assumptions and sample queries.
              </p>
            )}

            {result && (
              <div className="schema-output-content">
                {result.overview && (
                  <div className="schema-section">
                    <h3>Overview</h3>
                    <p className="schema-body-text">{result.overview}</p>
                  </div>
                )}

                {renderRelationships()}
                {renderEntities()}

                {result.ddl_sql && (
                  <div className="schema-section">
                    <div className="schema-section-header">
                      <h3>SQL DDL</h3>
                      <button className="schema-mini-action" onClick={() => handleCopy(result.ddl_sql)}>
                        Copy
                      </button>
                    </div>
                    <pre className="schema-code-block">
{result.ddl_sql}
                    </pre>
                  </div>
                )}

                {renderNosql()}
                {renderSampleQueries()}
                {renderAssumptions()}

                {result.schema_text && !result.ddl_sql && !result.nosql_collections && (
                  <div className="schema-section">
                    <h3>Schema</h3>
                    <pre className="schema-code-block">
{result.schema_text}
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

