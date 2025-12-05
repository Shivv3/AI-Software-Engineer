import { useRef, useState } from 'react';
import { useProjectContext } from './ProjectContext';

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
      <aside
        className="card"
        style={{
          width: isSidebarCollapsed ? '52px' : '320px',
          transition: 'width 0.2s ease',
          position: 'sticky',
          top: '16px',
          alignSelf: 'flex-start',
          padding: isSidebarCollapsed ? '0.5rem' : '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          {!isSidebarCollapsed && (
            <div>
              <div className="text-sm text-gray-500">Project</div>
              <div className="font-semibold">{projectName || 'Untitled project'}</div>
            </div>
          )}
          <button
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.5rem' }}
            onClick={() => setIsSidebarCollapsed((v) => !v)}
          >
            {isSidebarCollapsed ? '»' : '«'}
          </button>
        </div>

        {!isSidebarCollapsed && (
          <>
            <div className="mt-3" style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => uploadRef.current?.click()}>
                + Upload
              </button>
              <input
                ref={uploadRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
              />
            </div>

            <div className="mt-3">
              <div className="text-sm font-semibold mb-2">Project Documents</div>
              {documents.length === 0 && (
                <div className="text-sm text-gray-600">Nothing saved yet. Generate or upload to see items here.</div>
              )}
              <div className="space-y-2" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-2 rounded border"
                    style={{
                      backgroundColor: '#f8fafc',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto auto',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="text-sm font-semibold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.name}
                      </div>
                      <div className="text-xs text-gray-600" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.type || 'Document'} · {doc.size ? prettySize(doc.size) + ' · ' : ''}
                        {new Date(doc.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <button className="btn btn-secondary text-xs" title="Preview" onClick={() => setPreviewDoc(doc)} style={{ padding: '0.25rem 0.5rem' }}>
                      👁
                    </button>
                    <button className="btn btn-secondary text-xs" title="Download" onClick={() => handleDownload(doc)} style={{ padding: '0.25rem 0.5rem' }}>
                      ⬇
                    </button>
                    <button
                      className="btn btn-secondary text-xs"
                      title="Use in AI context"
                      onClick={() => toggleUseAsContext(doc.id)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: doc.useAsContext ? '#e0f2fe' : undefined,
                      }}
                    >
                      ✓
                    </button>
                    <button className="btn btn-link text-xs" title="Delete" onClick={() => setConfirmDelete(doc)} style={{ padding: '0.25rem 0.35rem' }}>
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {error && (
              <p className="text-sm" style={{ color: '#b91c1c', marginTop: '0.5rem' }}>
                {error}
              </p>
            )}
          </>
        )}
      </aside>

      {previewDoc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
          }}
        >
          <div className="card" style={{ width: '90%', maxWidth: '800px', maxHeight: '85vh', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div>
                <div className="text-lg font-semibold">{previewDoc.name}</div>
                <div className="text-sm text-gray-600">{previewDoc.type || 'Document'}</div>
              </div>
              <button className="btn" onClick={() => setPreviewDoc(null)}>
                Close
              </button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '70vh' }}>
              {previewDoc.content?.startsWith('data:') ? (
                <iframe
                  title={previewDoc.name}
                  src={previewDoc.content}
                  style={{ width: '100%', height: '70vh', border: 'none' }}
                />
              ) : (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    backgroundColor: '#f8fafc',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.9rem',
                  }}
                >
                  {previewDoc.content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '420px', boxShadow: '0 20px 45px rgba(15, 23, 42, 0.35)' }}>
            <h2 className="text-xl font-semibold mb-2">Delete document?</h2>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <strong>{confirmDelete.name}</strong>? This will remove it from the project.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
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

