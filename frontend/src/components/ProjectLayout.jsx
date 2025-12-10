import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ProjectProvider } from './ProjectContext';
import ProjectSidebar from './ProjectSidebar';
import './WorkspaceLayout.css';

const loadProjects = () => {
  try {
    const raw = localStorage.getItem('ase.projects');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function ProjectLayout() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState(location.state?.projectName || '');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const projects = loadProjects();
    const match = projects.find((p) => p.id === projectId);
    if (match) {
      setProjectName(match.name);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
  }, [projectId]);

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

