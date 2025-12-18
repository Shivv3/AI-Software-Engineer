import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { ProjectProvider } from './ProjectContext';
import ProjectSidebar from './ProjectSidebar';
import './WorkspaceLayout.css';

axios.defaults.withCredentials = true;

export default function ProjectLayout() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState(location.state?.projectName || '');
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProject = async () => {
      if (!projectId) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await axios.get(`/api/project/${projectId}`);
        if (response.data) {
          setProjectName(response.data.title || response.data.name || '');
          setNotFound(false);
        } else {
          setNotFound(true);
        }
      } catch (error) {
        console.error('Failed to load project:', error);
        if (error.response?.status === 404) {
          setNotFound(true);
        } else {
          // For other errors, still show not found
          setNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="workspace-layout">
        <div className="workspace-background">
          <div className="gradient-orb gradient-orb-1"></div>
          <div className="gradient-orb gradient-orb-2"></div>
        </div>
        <div className="workspace-container" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="workspace-not-found-card">
            <div style={{ textAlign: 'center' }}>
              <div className="spinner" style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(102, 126, 234, 0.3)',
                borderTopColor: '#667eea',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 1rem'
              }}></div>
              <p style={{ color: '#94a3b8' }}>Loading project...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="workspace-layout">
        <div className="workspace-background">
          <div className="gradient-orb gradient-orb-1"></div>
          <div className="gradient-orb gradient-orb-2"></div>
        </div>
        <div className="workspace-container" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
          <div className="workspace-not-found-card">
            <h1 className="workspace-not-found-title">Project not found</h1>
            <p className="workspace-not-found-text">
              We could not find this project. It may have been deleted. Please return to the project
              list and open another workspace.
            </p>
            <button className="gradient-button" onClick={() => navigate('/')}>
              <span>Back to projects</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProjectProvider projectId={projectId} projectName={projectName}>
      <div className="workspace-layout">
        <div className="workspace-background">
          <div className="gradient-orb gradient-orb-1"></div>
          <div className="gradient-orb gradient-orb-2"></div>
          <div className="gradient-orb gradient-orb-3"></div>
        </div>
        <div className="workspace-container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
          <div className="workspace-grid">
            <div className="workspace-content">
              <Outlet />
            </div>
            <ProjectSidebar />
          </div>
        </div>
      </div>
    </ProjectProvider>
  );
}

