const DOCS_KEY_PREFIX = 'ase.project.docs.';

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const loadProjectDocuments = (projectId) => {
  if (!projectId) return [];
  const raw = localStorage.getItem(`${DOCS_KEY_PREFIX}${projectId}`);
  const parsed = safeParse(raw);
  return Array.isArray(parsed) ? parsed : [];
};

export const persistProjectDocuments = (projectId, docs) => {
  if (!projectId) return;
  localStorage.setItem(`${DOCS_KEY_PREFIX}${projectId}`, JSON.stringify(docs));
};

export const addProjectDocument = (projectId, doc) => {
  const existing = loadProjectDocuments(projectId);
  const updated = [doc, ...existing];
  persistProjectDocuments(projectId, updated);
  return updated;
};

export const updateProjectDocument = (projectId, docId, updater) => {
  const existing = loadProjectDocuments(projectId);
  const updated = existing.map((doc) => (doc.id === docId ? { ...doc, ...updater(doc) } : doc));
  persistProjectDocuments(projectId, updated);
  return updated;
};

export const deleteProjectDocument = (projectId, docId) => {
  const filtered = loadProjectDocuments(projectId).filter((d) => d.id !== docId);
  persistProjectDocuments(projectId, filtered);
  return filtered;
};

export const generateDocId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

