import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  addProjectDocument,
  deleteProjectDocument,
  generateDocId,
  loadProjectDocuments,
  updateProjectDocument,
  persistProjectDocuments,
} from '../utils/projectDocuments';

const ProjectContext = createContext(null);

export const ProjectProvider = ({ projectId, projectName, children }) => {
  const [documents, setDocuments] = useState(() => loadProjectDocuments(projectId));
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  useEffect(() => {
    setDocuments(loadProjectDocuments(projectId));
  }, [projectId]);

  useEffect(() => {
    persistProjectDocuments(projectId, documents);
  }, [projectId, documents]);

  const addDocument = async (doc) => {
    const enriched = {
      id: doc.id || generateDocId(),
      createdAt: doc.createdAt || new Date().toISOString(),
      projectId,
      useAsContext: doc.useAsContext ?? doc.type === 'SRS',
      ...doc,
    };
    const updated = addProjectDocument(projectId, enriched);
    setDocuments(updated);
    return enriched;
  };

  const removeDocument = (docId) => {
    const updated = deleteProjectDocument(projectId, docId);
    setDocuments(updated);
  };

  const toggleUseAsContext = (docId) => {
    const updated = updateProjectDocument(projectId, docId, (doc) => ({
      useAsContext: !doc.useAsContext,
    }));
    setDocuments(updated);
  };

  const value = useMemo(
    () => ({
      projectId,
      projectName,
      documents,
      addDocument,
      removeDocument,
      toggleUseAsContext,
      isSidebarCollapsed,
      setIsSidebarCollapsed,
    }),
    [projectId, projectName, documents, isSidebarCollapsed],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export const useProjectContext = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return ctx;
};

