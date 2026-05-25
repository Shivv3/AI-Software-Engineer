import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  generateDocId,
  loadProjectDocuments,
} from '../utils/projectDocuments';
import api from '../lib/api';

const ProjectContext = createContext(null);

export const ProjectProvider = ({ projectId, projectName, children }) => {
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [health, setHealth] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  const refreshDocuments = async () => {
    if (!projectId) {
      setDocuments([]);
      setDocumentsLoading(false);
      return [];
    }

    setDocumentsLoading(true);
    try {
      const response = await api.get(`/projects/${projectId}/documents`);
      setDocuments(response.data || []);
      return response.data || [];
    } catch (error) {
      const fallback = loadProjectDocuments(projectId);
      setDocuments(fallback);
      return fallback;
    } finally {
      setDocumentsLoading(false);
    }
  };

  const refreshHealth = async () => {
    if (!projectId) {
      setHealth(null);
      return null;
    }
    try {
      const response = await api.get(`/projects/${projectId}/health`);
      setHealth(response.data);
      return response.data;
    } catch {
      setHealth(null);
      return null;
    }
  };

  useEffect(() => {
    refreshDocuments();
    refreshHealth();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || documentsLoading || documents.length > 0) return;
    const localDocs = loadProjectDocuments(projectId);
    if (!localDocs.length) return;

    let cancelled = false;
    Promise.allSettled(localDocs.map((doc) => api.post(`/projects/${projectId}/documents`, doc)))
      .then(() => {
        if (!cancelled) refreshDocuments();
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, documentsLoading, documents.length]);

  const addDocument = async (doc) => {
    const enriched = {
      id: doc.id || generateDocId(),
      createdAt: doc.createdAt || new Date().toISOString(),
      projectId,
      useAsContext: doc.useAsContext ?? doc.type === 'SRS',
      ...doc,
    };
    const response = await api.post(`/projects/${projectId}/documents`, enriched);
    setDocuments((current) => [response.data, ...current.filter((item) => item.id !== response.data.id)]);
    refreshHealth();
    return response.data;
  };

  const removeDocument = async (docId) => {
    await api.delete(`/projects/${projectId}/documents/${docId}`);
    setDocuments((current) => current.filter((doc) => doc.id !== docId));
    refreshHealth();
  };

  const toggleUseAsContext = async (docId) => {
    const existing = documents.find((doc) => doc.id === docId);
    if (!existing) return;
    const response = await api.patch(`/projects/${projectId}/documents/${docId}`, {
      useAsContext: !existing.useAsContext,
    });
    setDocuments((current) => current.map((doc) => (doc.id === docId ? response.data : doc)));
  };

  const value = useMemo(
    () => ({
      projectId,
      projectName,
      documents,
      documentsLoading,
      health,
      refreshDocuments,
      refreshHealth,
      addDocument,
      removeDocument,
      toggleUseAsContext,
      isSidebarCollapsed,
      setIsSidebarCollapsed,
    }),
    [projectId, projectName, documents, documentsLoading, health, isSidebarCollapsed],
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

