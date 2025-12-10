import { useRef, useState } from 'react';
import { useProjectContext } from './ProjectContext';
import './ProjectSidebar.css';

const prettySize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MAX_UPLOAD_BYTES = 2.5 * 1024 * 1024; // ~2.5MB limit to avoid localStorage quota issues

export default function ProjectSidebar() {
  const {
    documents,
    removeDocument,
    addDocument,
    toggleUseAsContext,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    projectName,
  } = useProjectContext();
  const [previewDoc, setPreviewDoc] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState('');
  const uploadRef = useRef(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setError('File too large for local storage. Please upload a file under ~2.5MB.');
      if (uploadRef.current) uploadRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result;
      try {
        await addDocument({
          name: file.name,
          type: 'Reference',
          mime: file.type || 'application/octet-stream',
          size: file.size,
          source: 'upload',
          content: base64,
        });
        setError('');
      } catch (err) {
        setError(err.message || 'Failed to save document');
      }
    };
    reader.onerror = () => setError('Failed to read file. Please try again.');
    reader.readAsDataURL(file);
    if (uploadRef.current) uploadRef.current.value = '';
  };

  const handleDownload = (doc) => {
    try {
      const blob = doc.content.startsWith('data:')
        ? fetch(doc.content).then((res) => res.blob())
        : Promise.resolve(new Blob([doc.content], { type: doc.mime || 'text/plain' }));

      blob.then((b) => {
        const url = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.name || 'document';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    } catch (err) {
      setError(err.message || 'Download failed');
    }
  };

  return (
    <>
      <aside className={`project-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!isSidebarCollapsed && (
            <div className="sidebar-project-info">
              <div className="sidebar-project-label">Project</div>
              <div className="sidebar-project-name">{projectName || 'Untitled project'}</div>
            </div>
          )}
          <button
            className="sidebar-toggle-button"
            onClick={() => setIsSidebarCollapsed((v) => !v)}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>

        {!isSidebarCollapsed && (
          <>
            <div className="sidebar-upload-section">
              <button className="sidebar-upload-button" onClick={() => uploadRef.current?.click()}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span>Upload Document</span>
              </button>
              <input
                ref={uploadRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
              />
            </div>

            <div className="sidebar-documents-section">
              <div className="sidebar-section-title">Project Documents</div>
              {documents.length === 0 && (
                <div className="sidebar-empty-state">
                  <div className="sidebar-empty-icon">📁</div>
                  <p>Nothing saved yet. Generate or upload to see items here.</p>
                </div>
              )}
              <div className="sidebar-documents-list">
                {documents.map((doc) => (
                  <div key={doc.id} className="sidebar-document-item">
                    <div className="document-item-content">
                      <div className="document-item-name">{doc.name}</div>
                      <div className="document-item-meta">
                        {doc.type || 'Document'} · {doc.size ? prettySize(doc.size) + ' · ' : ''}
                        {new Date(doc.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="document-item-actions">
                      <button
                        className="document-action-button"
                        title="Preview"
                        onClick={() => setPreviewDoc(doc)}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M8 3C5 3 2.73 5.11 1 8C2.73 10.89 5 13 8 13C11 13 13.27 10.89 15 8C13.27 5.11 11 3 8 3ZM8 11C6.34 11 5 9.66 5 8C5 6.34 6.34 5 8 5C9.66 5 11 6.34 11 8C11 9.66 9.66 11 8 11ZM8 6.5C7.17 6.5 6.5 7.17 6.5 8C6.5 8.83 7.17 9.5 8 9.5C8.83 9.5 9.5 8.83 9.5 8C9.5 7.17 8.83 6.5 8 6.5Z" fill="currentColor"/>
                        </svg>
                      </button>
                      <button
                        className="document-action-button"
                        title="Download"
                        onClick={() => handleDownload(doc)}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M8 11L3 6H6V1H10V6H13L8 11Z" fill="currentColor"/>
                          <path d="M2 13H14V15H2V13Z" fill="currentColor"/>
                        </svg>
                      </button>
                      <button
                        className={`document-action-button ${doc.useAsContext ? 'active' : ''}`}
                        title="Use in AI context"
                        onClick={() => toggleUseAsContext(doc.id)}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M13.5 2L6 9.5L2.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        className="document-action-button delete"
                        title="Delete"
                        onClick={() => setConfirmDelete(doc)}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {error && (
              <div className="sidebar-error">
                <span className="error-icon">⚠</span>
                {error}
              </div>
            )}
          </>
        )}
      </aside>

      {previewDoc && (
        <div className="modal-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{previewDoc.name}</div>
                <div className="modal-subtitle">{previewDoc.type || 'Document'}</div>
              </div>
              <button className="modal-close-button" onClick={() => setPreviewDoc(null)}>
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="modal-content">
              {previewDoc.content?.startsWith('data:') ? (
                <iframe
                  title={previewDoc.name}
                  src={previewDoc.content}
                  style={{ width: '100%', height: '70vh', border: 'none', borderRadius: '0.5rem' }}
                />
              ) : (
                <pre className="modal-pre-content">{previewDoc.content}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon-wrapper">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h2 className="modal-title">Delete document?</h2>
            </div>
            <p className="modal-description">
              Are you sure you want to delete <strong>{confirmDelete.name}</strong>? This will remove it from the project.
            </p>
            <div className="modal-actions">
              <button className="modal-button-cancel" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="modal-button-delete"
                onClick={() => {
                  removeDocument(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
