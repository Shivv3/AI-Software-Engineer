import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PROJECTS_KEY = 'ase.projects';
const PROJECT_DATA_PREFIX = 'ase.project.data.';

const loadProjects = () => {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const persistProjects = (items) => {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(items));
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const clearProjectData = (projectId) => {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(`${PROJECT_DATA_PREFIX}${projectId}`)) {
      localStorage.removeItem(key);
    }
  });
};

export default function ProjectsDashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => loadProjects());
  const [newProjectName, setNewProjectName] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    persistProjects(projects);
  }, [projects]);

  const handleCreate = () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) {
      setError('Project name is required.');
      return;
    }

    const exists = projects.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setError('A project with this name already exists.');
      return;
    }

    const next = {
      id: generateId(),
      name: trimmed,
      createdAt: new Date().toISOString(),
    };

    setProjects([next, ...projects]);
    setNewProjectName('');
    setError('');
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    clearProjectData(deleteTarget.id);
    setProjects(projects.filter((p) => p.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const openProject = (project) => {
    navigate(`/projects/${project.id}`, { state: { projectName: project.name } });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, #e0f2fe 0, transparent 55%), radial-gradient(circle at bottom right, #ede9fe 0, transparent 55%), #f9fafb',
      }}
    >
      <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
        <header className="mb-8">
          <div className="mb-2">
            <span className="badge badge-blue">AI Software Engineer</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>
            Manage your projects.
          </h1>
          <p className="text-gray-600" style={{ maxWidth: '640px' }}>
            Create a project to spin up a dedicated SDLC workspace. Each project gets its own
            Universal Home, requirements workspace, and design studio.
          </p>
        </header>

        <section className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="text-xl font-semibold mb-2">Create a new project</h2>
          <p className="text-sm text-gray-600 mb-3">
            Give your project a name to create a fresh workspace.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ minWidth: '260px' }}
              type="text"
              placeholder="e.g., Payment Platform Revamp"
              value={newProjectName}
              onChange={(e) => {
                setNewProjectName(e.target.value);
                setError('');
              }}
            />
            <button className="btn btn-primary" onClick={handleCreate}>
              Create Project
            </button>
          </div>
          {error && (
            <p className="text-sm" style={{ color: '#b91c1c', marginTop: '0.5rem' }}>
              {error}
            </p>
          )}
        </section>

        <section>
          <div className="mb-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="text-lg font-semibold mb-0">Your projects</h2>
            <span className="badge badge-gray">{projects.length} total</span>
          </div>

          {projects.length === 0 && (
            <div className="card">
              <p className="text-sm text-gray-600">
                No projects yet. Create one to get started with the AI Software Engineer workflow.
              </p>
            </div>
          )}

          {projects.length > 0 && (
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}
            >
              {projects.map((project) => (
                <section key={project.id} className="card" style={{ position: 'relative' }}>
                  <div style={{ position: 'relative' }}>
                    <div className="mb-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge badge-blue">Project</span>
                      <button className="btn btn-link text-sm" onClick={() => setDeleteTarget(project)}>
                        Delete
                      </button>
                    </div>
                    <h3 className="text-xl font-semibold mb-1" style={{ wordBreak: 'break-word' }}>
                      {project.name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Created {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => openProject(project)}>
                      Open workspace
                    </button>
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>

      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '420px', boxShadow: '0 20px 45px rgba(15, 23, 42, 0.35)' }}>
            <h2 className="text-xl font-semibold mb-2">Delete project?</h2>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will remove
              this project and its saved progress.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleConfirmDelete}>
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

