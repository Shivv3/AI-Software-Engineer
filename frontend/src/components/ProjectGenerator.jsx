import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { strToU8, zipSync } from 'fflate';
import api, { apiBase } from '../lib/api';
import { useProjectContext } from './ProjectContext';
import './ProjectGenerator.css';

const DESIGN_TYPES = ['system_design', 'design'];

function normalizeDoc(doc) {
  return {
    ...doc,
    updatedAt: doc.updatedAt || doc.updated_at || doc.createdAt || doc.created_at,
  };
}

function isDesignDoc(doc) {
  const type = String(doc.type || '').toLowerCase();
  return DESIGN_TYPES.some((candidate) => type.includes(candidate));
}

function stringifyTechStack(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function inferTechStack(content) {
  try {
    const parsed = JSON.parse(content);
    return stringifyTechStack(parsed.tech_stack || parsed.techStack || parsed.stack);
  } catch {
    const text = String(content || '');
    const match = text.match(/tech stack[\s\S]{0,1200}?(?=\n[A-Z][A-Za-z -]{2,}:|\n\n[A-Z][A-Za-z -]{2,}\n|$)/i);
    return match ? match[0].replace(/tech stack\s*:?\s*/i, '').trim() : '';
  }
}

function safeZipPath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.\./g, '').trim();
}

async function writeFileToDirectory(rootHandle, file) {
  const parts = safeZipPath(file.path).split('/').filter(Boolean);
  if (!parts.length) return;
  let current = rootHandle;
  for (const part of parts.slice(0, -1)) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file.code);
  await writable.close();
}

export default function ProjectGenerator() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { projectName, refreshDocuments } = useProjectContext();
  const [designDoc, setDesignDoc] = useState(null);
  const [docsLoading, setDocsLoading] = useState(true);
  const [techStack, setTechStack] = useState('');
  const [phase, setPhase] = useState('idle');
  const [manifest, setManifest] = useState([]);
  const [selectedPaths, setSelectedPaths] = useState(new Set());
  const [files, setFiles] = useState([]);
  const [failed, setFailed] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [completedCount, setCompletedCount] = useState(0);
  const [activeFilePath, setActiveFilePath] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const abortRef = useRef(null);

  const supportsFolderSave = typeof window !== 'undefined' && Boolean(window.showDirectoryPicker);
  const selectedManifest = useMemo(
    () => manifest.filter((entry) => selectedPaths.has(entry.path)),
    [manifest, selectedPaths],
  );
  const progress = selectedManifest.length ? Math.round((completedCount / selectedManifest.length) * 100) : 0;
  const activeFile = files.find((file) => file.path === activeFilePath);
  const canGenerate = Boolean(designDoc && techStack.trim() && selectedManifest.length);

  useEffect(() => {
    let cancelled = false;
    async function loadDocs() {
      setDocsLoading(true);
      try {
        const response = await api.get(`/projects/${projectId}/documents`);
        if (cancelled) return;
        const designDocs = (response.data || [])
          .filter(isDesignDoc)
          .map(normalizeDoc)
          .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        const latest = designDocs[0] || null;
        setDesignDoc(latest);
        setTechStack(latest ? inferTechStack(latest.content) : '');
      } catch (error) {
        if (!cancelled) setErrorMsg(error.response?.data?.error || error.message || 'Failed to load design document');
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    }
    loadDocs();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function handleSSEEvent(event) {
    switch (event.type) {
      case 'manifest_done': {
        const nextManifest = event.manifest || [];
        setManifest(nextManifest);
        setSelectedPaths(new Set(nextManifest.map((entry) => entry.path)));
        setPhase((current) => (current === 'manifesting' ? 'manifest_preview' : current));
        break;
      }
      case 'file_start':
        setManifest((current) => current.map((entry) => (
          entry.path === event.path ? { ...entry, status: 'generating' } : entry
        )));
        break;
      case 'file_done':
        setManifest((current) => current.map((entry) => (
          entry.path === event.path ? { ...entry, status: 'done' } : entry
        )));
        setCompletedCount((count) => count + 1);
        break;
      case 'file_error':
        setManifest((current) => current.map((entry) => (
          entry.path === event.path ? { ...entry, status: 'error', error: event.error } : entry
        )));
        setFailed((current) => [...current, { path: event.path, error: event.error }]);
        setCompletedCount((count) => count + 1);
        break;
      case 'complete':
        setFiles(event.files || []);
        setFailed(event.failed || []);
        if (phase === 'generating') setCompletedCount(selectedManifest.length);
        setPhase((current) => (current === 'generating' ? 'done' : current));
        break;
      case 'error':
        setErrorMsg(event.message || 'Generation failed');
        setPhase('error');
        break;
      default:
        break;
    }
  }

  async function consumeSSE(body) {
    const controller = new AbortController();
    abortRef.current = controller;

    const response = await fetch(`${apiBase}/code/generate-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Request failed with ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      chunks.forEach((chunk) => {
        const dataLine = chunk.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) return;
        handleSSEEvent(JSON.parse(dataLine.slice(5).trim()));
      });
    }
  }

  async function loadManifest() {
    if (!designDoc || !techStack.trim()) return;
    setPhase('manifesting');
    setErrorMsg('');
    setFiles([]);
    setFailed([]);
    setCompletedCount(0);
    try {
      await consumeSSE({
        project_id: projectId,
        design_document_id: designDoc.id,
        tech_stack: techStack,
        preview_only: true,
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        setErrorMsg(error.message || 'Failed to generate manifest');
        setPhase('error');
      }
    }
  }

  async function startGeneration(entries = selectedManifest) {
    if (!designDoc || !techStack.trim() || !entries.length) return;
    setPhase('generating');
    setErrorMsg('');
    setFiles([]);
    setFailed([]);
    setCompletedCount(0);
    setManifest((current) => current.map((entry) => (
      entries.some((item) => item.path === entry.path) ? { ...entry, status: 'queued' } : entry
    )));
    try {
      await consumeSSE({
        project_id: projectId,
        design_document_id: designDoc.id,
        tech_stack: techStack,
        manifest: entries,
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        setErrorMsg(error.message || 'Failed to generate project');
        setPhase('error');
      }
    }
  }

  function cancelGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase(manifest.length ? 'manifest_preview' : 'idle');
    setCompletedCount(0);
  }

  function togglePath(path) {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectByType(type, selected) {
    setSelectedPaths((current) => {
      const next = new Set(current);
      manifest.filter((entry) => entry.type === type).forEach((entry) => {
        if (selected) next.add(entry.path);
        else next.delete(entry.path);
      });
      return next;
    });
  }

  function downloadZip() {
    const entries = {};
    files.forEach((file) => {
      entries[safeZipPath(file.path)] = strToU8(file.code);
    });
    const zipped = zipSync(entries);
    const blob = new Blob([zipped], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `project-${projectId}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveToFolder() {
    try {
      const dirHandle = await window.showDirectoryPicker();
      for (const file of files) {
        await writeFileToDirectory(dirHandle, file);
      }
      setSaveMessage('Generated files saved to the selected folder.');
    } catch {
      setSaveMessage('');
    }
  }

  async function saveResultToSidebar() {
    const content = JSON.stringify({ generated_at: new Date().toISOString(), files }, null, 2);
    await api.post(`/projects/${projectId}/documents`, {
      name: `Generated Project ${new Date().toISOString().slice(0, 10)}`,
      type: 'Code Project',
      mime: 'application/json',
      content,
      useAsContext: false,
    });
    await refreshDocuments();
    setSaveMessage('Generated project manifest saved to the sidebar.');
  }

  const groupedManifest = useMemo(() => {
    return manifest.reduce((acc, entry) => {
      const key = entry.component || 'Project';
      acc[key] = acc[key] || [];
      acc[key].push(entry);
      return acc;
    }, {});
  }, [manifest]);

  return (
    <div className="project-generator">
      <header className="project-generator-header">
        <button className="project-generator-back" onClick={() => navigate(`/projects/${projectId}/implementation`)}>
          Back to Build
        </button>
        <div className="project-generator-badge">Phase 3 - End-to-End Project Generation</div>
        <h1 className="project-generator-title">Generate a runnable code folder</h1>
        <p className="project-generator-subtitle">
          Build a complete project from the latest design, schema, and ER artifacts in {projectName || 'this workspace'}.
        </p>
      </header>

      <section className="project-generator-panel">
        {docsLoading ? (
          <div className="project-generator-muted">Loading design documents...</div>
        ) : designDoc ? (
          <>
            <div className="project-generator-doc">
              <span>Design document</span>
              <strong>{designDoc.name}</strong>
            </div>
            <label className="project-generator-label">
              Confirm tech stack
              <textarea
                value={techStack}
                onChange={(event) => setTechStack(event.target.value)}
                className="project-generator-textarea"
                rows={4}
                placeholder="Example: React, Node.js, Express, SQLite, Vitest"
                disabled={phase === 'generating' || phase === 'manifesting'}
              />
            </label>
            {!techStack.trim() && <div className="project-generator-error">A tech stack is required before generation.</div>}
            <div className="project-generator-actions">
              <button className="project-generator-primary" onClick={loadManifest} disabled={!designDoc || !techStack.trim() || phase === 'manifesting' || phase === 'generating'}>
                {manifest.length ? 'Regenerate Manifest' : 'Create Manifest'}
              </button>
              {phase === 'generating' && (
                <button className="project-generator-secondary" onClick={cancelGeneration}>
                  Cancel
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="project-generator-empty">
            No system design document was found. Save a design document from the System Design page first.
            <button className="project-generator-secondary" onClick={() => navigate(`/projects/${projectId}/design/system`)}>
              Go to Design
            </button>
          </div>
        )}
      </section>

      {errorMsg && <div className="project-generator-error banner">{errorMsg}</div>}

      {manifest.length > 0 && (
        <section className="project-generator-workspace">
          <div className="project-generator-left">
            <div className="project-generator-section-header">
              <div>
                <h2>File Manifest</h2>
                <p>{selectedManifest.length} of {manifest.length} files selected</p>
              </div>
              <div className="project-generator-mini-actions">
                <button onClick={() => selectByType('test', false)}>Skip Tests</button>
                <button onClick={() => selectByType('test', true)}>Include Tests</button>
              </div>
            </div>

            <div className="project-generator-tree">
              {Object.entries(groupedManifest).map(([component, entries]) => (
                <div key={component} className="project-generator-group">
                  <div className="project-generator-group-title">{component}</div>
                  {entries.map((entry) => (
                    <label key={entry.path} className={`project-generator-file ${entry.status || ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedPaths.has(entry.path)}
                        onChange={() => togglePath(entry.path)}
                        disabled={phase === 'generating'}
                      />
                      <button type="button" onClick={() => setActiveFilePath(entry.path)}>{entry.path}</button>
                      <span>{entry.type}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className="project-generator-actions sticky">
              <button className="project-generator-primary" onClick={() => startGeneration()} disabled={!canGenerate || phase === 'generating' || phase === 'manifesting'}>
                Generate {selectedManifest.length} Files
              </button>
              {failed.length > 0 && (
                <button
                  className="project-generator-secondary"
                  onClick={() => startGeneration(manifest.filter((entry) => failed.some((item) => item.path === entry.path)))}
                  disabled={phase === 'generating'}
                >
                  Retry Failed
                </button>
              )}
            </div>
          </div>

          <div className="project-generator-right">
            <div className="project-generator-progress">
              <div className="project-generator-progress-meta">
                <span>{phase === 'done' ? 'Complete' : phase === 'generating' ? 'Generating' : 'Ready'}</span>
                <strong>{progress}%</strong>
              </div>
              <div className="project-generator-progress-track">
                <div style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="project-generator-output-actions">
              <button className="project-generator-primary" onClick={downloadZip} disabled={phase !== 'done' || files.length === 0}>
                Download ZIP
              </button>
              {supportsFolderSave && (
                <button className="project-generator-secondary" onClick={saveToFolder} disabled={phase !== 'done' || files.length === 0}>
                  Save to Folder
                </button>
              )}
              <button className="project-generator-secondary" onClick={saveResultToSidebar} disabled={phase !== 'done' || files.length === 0}>
                Save Record
              </button>
            </div>
            {!supportsFolderSave && <div className="project-generator-muted">Direct folder save requires Chrome or Edge.</div>}
            {saveMessage && <div className="project-generator-success">{saveMessage}</div>}

            <div className="project-generator-preview">
              <div className="project-generator-preview-title">{activeFile?.path || activeFilePath || 'Code preview'}</div>
              <pre>{activeFile?.code || 'Select a completed file after generation to preview its contents.'}</pre>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
