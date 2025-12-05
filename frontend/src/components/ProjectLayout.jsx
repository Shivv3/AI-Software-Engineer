import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ProjectProvider } from './ProjectContext';
import ProjectSidebar from './ProjectSidebar';

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
      <div className="container" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
        <div className="card" style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h1 className="text-2xl font-bold mb-2">Project not found</h1>
          <p className="text-sm text-gray-600 mb-4">
            We could not find this project. It may have been deleted. Please return to the project
            list and open another workspace.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <ProjectProvider projectId={projectId} projectName={projectName}>
      <div
        style={{
          minHeight: '100vh',
          background:
            'radial-gradient(circle at top left, #e0f2fe 0, transparent 55%), radial-gradient(circle at bottom right, #ede9fe 0, transparent 55%), #f9fafb',
        }}
      >
        <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '1rem' }}>
            <div style={{ minWidth: 0 }}>
              <Outlet />
            </div>
            <ProjectSidebar />
          </div>
        </div>
      </div>
    </ProjectProvider>
  );
}

