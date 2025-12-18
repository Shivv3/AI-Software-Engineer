import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './ProjectsDashboard.css';

axios.defaults.withCredentials = true;

export default function ProjectsDashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadUser();
    loadProjects();
  }, []);

  const loadUser = async () => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data.user);
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
      navigate('/auth');
    } catch (error) {
      console.error('Logout failed:', error);
      navigate('/auth');
    }
  };

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await axios.get('/api/projects');
      setProjects(response.data || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
      setError(error.response?.data?.error || 'Failed to load projects. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
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

    try {
      setError('');
      const response = await axios.post('/api/project', {
        title: trimmed,
        project_text: ''
      });

      setProjects([response.data, ...projects]);
      setNewProjectName('');
    } catch (error) {
      console.error('Create project error:', error);
      setError(error.response?.data?.error || 'Failed to create project. Please try again.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setError('');
      await axios.delete(`/api/project/${deleteTarget.id}`);
      setProjects(projects.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      console.error('Delete project error:', error);
      setError(error.response?.data?.error || 'Failed to delete project. Please try again.');
      setDeleteTarget(null);
    }
  };

  const openProject = (project) => {
    navigate(`/projects/${project.id}`, { state: { projectName: project.name } });
  };

  return (
    <div className="projects-dashboard">
      <div className="dashboard-background">
        <div className="gradient-orb gradient-orb-1"></div>
        <div className="gradient-orb gradient-orb-2"></div>
        <div className="gradient-orb gradient-orb-3"></div>
      </div>
      
      <div className="dashboard-container">
        <header className="dashboard-header">
          <div className="header-badge-wrapper">
            <span className="header-badge">
              <span className="badge-icon">⚡</span>
              AI Software Engineer
            </span>
            {user && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                  {user.name} ({user.user_id})
                </span>
                <button
                  onClick={handleLogout}
                  className="logout-button"
                  title="Logout"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H6M10 11L14 7M14 7L10 3M14 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
          <h1 className="dashboard-title">
            Manage your projects
          </h1>
          <p className="dashboard-subtitle">
            Create a project to spin up a dedicated SDLC workspace. Each project gets its own
            Universal Home, requirements workspace, and design studio.
          </p>
        </header>

        <section className="create-project-card">
          <div className="card-header">
            <h2 className="card-title">Create a new project</h2>
            <div className="card-accent-line"></div>
          </div>
          <p className="card-description">
            Give your project a name to create a fresh workspace.
          </p>
          <div className="create-project-form">
            <input
              className="modern-input"
              type="text"
              placeholder="e.g., Payment Platform Revamp"
              value={newProjectName}
              onChange={(e) => {
                setNewProjectName(e.target.value);
                setError('');
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreate();
                }
              }}
            />
            <button className="gradient-button" onClick={handleCreate}>
              <span>Create Project</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          {error && (
            <p className="error-message">
              <span className="error-icon">⚠</span>
              {error}
            </p>
          )}
        </section>

        <section className="projects-section">
          <div className="section-header">
            <h2 className="section-title">Your projects</h2>
            <span className="project-count-badge">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span>
          </div>

          {loading ? (
            <div className="empty-state-card">
              <div className="empty-state-icon">⏳</div>
              <p className="empty-state-text">Loading projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="empty-state-card">
              <div className="empty-state-icon">📁</div>
              <p className="empty-state-text">
                No projects yet. Create one to get started with the AI Software Engineer workflow.
              </p>
            </div>
          ) : null}

          {projects.length > 0 && (
            <div className="projects-grid">
              {projects.map((project) => (
                <div key={project.id} className="project-card">
                  <div className="project-card-content">
                    <div className="project-card-header">
                      <span className="project-badge">
                        <span className="project-badge-dot"></span>
                        Project
                      </span>
                      <button 
                        className="delete-button" 
                        onClick={() => setDeleteTarget(project)}
                        title="Delete project"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                    <h3 className="project-name">{project.name}</h3>
                    <p className="project-date">
                      Created {new Date(project.createdAt).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </p>
                    <button 
                      className="project-open-button" 
                      onClick={() => openProject(project)}
                    >
                      <span>Open workspace</span>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  <div className="project-card-glow"></div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon-wrapper">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h2 className="modal-title">Delete project?</h2>
            </div>
            <p className="modal-description">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will remove
              this project and its saved progress. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="modal-button-cancel" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="modal-button-delete" onClick={handleConfirmDelete}>
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

