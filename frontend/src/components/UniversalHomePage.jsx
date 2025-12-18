import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import './UniversalHomePage.css';

axios.defaults.withCredentials = true;

export default function UniversalHomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [projectName, setProjectName] = useState(location.state?.projectName || '');
  const [projectNotFound, setProjectNotFound] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    const loadProject = async () => {
      try {
        const response = await axios.get(`/api/project/${projectId}`);
        if (response.data) {
          setProjectName(response.data.title || response.data.name || '');
          setProjectNotFound(false);
        } else {
          setProjectNotFound(true);
        }
      } catch (error) {
        console.error('Failed to load project:', error);
        setProjectNotFound(true);
      }
    };

    loadProject();
  }, [projectId]);

  const navigateWithProjectState = (path) => {
    if (!projectId) {
      navigate('/');
      return;
    }
    const state = projectId || projectName ? { state: { projectId, projectName } } : undefined;
    navigate(`/projects/${projectId}${path}`, state);
  };

  const phases = [
    {
      id: 'requirements',
      title: '1. Requirements & Analysis',
      subtitle: 'Understand, analyse and scope your project',
      description:
        'Capture project context, get SDLC recommendations, generate a smart project plan and uncover implicit requirements – all powered by your AI Software Engineer.',
      actionLabel: 'Open Requirements Workspace',
      onClick: () => navigateWithProjectState('/requirements'),
      accentClass: 'badge-blue',
    },
    {
      id: 'design',
      title: '2. System Design',
      subtitle: 'Architecture, modules and data flows',
      description:
        'Enter the Design Studio to explore system architecture, module boundaries, data flows and technology choices derived from your SRS.',
      actionLabel: 'Open Design Studio',
      requiresPreviousPhaseDocument: false,
      onClick: () => navigateWithProjectState('/design'),
      accentClass: 'badge-green',
    },
    {
      id: 'implementation',
      title: '3. Coding & Implementation',
      subtitle: 'From specs to high‑quality code',
      description:
        'Generate boilerplate from natural language and translate snippets between languages, aligned with your saved project context.',
      actionLabel: 'Open Implementation Lab',
      onClick: () => navigateWithProjectState('/implementation'),
      disabled: false,
      accentClass: 'badge-yellow',
    },
    {
      id: 'testing',
      title: '4. Testing & Quality',
      subtitle: 'Verification, validation and automation',
      description:
        'Auto-generate test cases, virtually execute them, and get concise failure reports with suggested fixes or improved code.',
      actionLabel: 'Open Quality Center',
      onClick: () => navigateWithProjectState('/quality'),
      disabled: false,
      accentClass: 'badge-red',
    },
  ];

  const handlePhaseClick = (phase) => {
    phase.onClick();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
    setUploadError('');
  };

  const handleConfirmUpload = () => {
    if (!selectedFile) {
      setUploadError('Please select a document before continuing.');
      return;
    }

    const allowedExtensions = ['.doc', '.docx', '.pdf'];
    const fileName = selectedFile.name.toLowerCase();
    const isValidExtension = allowedExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValidExtension) {
      setUploadError('Invalid file type. Please upload a DOC, DOCX, or PDF SRS document.');
      return;
    }

    // At this stage we only validate on the frontend.
    // In future we can send this file to the backend for deeper validation and persistence.
    setIsUploadOpen(false);
    setUploadError('');
    setSelectedFile(null);

    // Navigate to Design page after successful upload
    navigateWithProjectState('/design');
  };

  const handleCancelUpload = () => {
    setIsUploadOpen(false);
    setUploadError('');
    setSelectedFile(null);
  };

  if (projectId && projectNotFound) {
    return (
      <div className="workspace-not-found">
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
    <div className="universal-homepage">
      <div className="workspace-container">
        {/* Hero */}
        <header className="homepage-header">
          {projectId && (
            <div className="homepage-nav">
              <button className="homepage-back-button" onClick={() => navigate('/')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Back to projects</span>
              </button>
              <span className="homepage-project-info">
                Working on <strong>{projectName || 'Untitled project'}</strong>
              </span>
            </div>
          )}
          <div className="homepage-badge-wrapper">
            <span className="homepage-badge">
              <span className="badge-icon">⚡</span>
              AI Software Engineer
            </span>
          </div>
          <h1 className="homepage-title">
            Orchestrate your entire Software Development Lifecycle in one place.
          </h1>
          <p className="homepage-subtitle">
            This universal homepage is your command center. Start from requirements, move through
            design and implementation, and finish with robust testing – with AI assisting you at
            every step.
          </p>
        </header>

        {/* Phases grid */}
        <main className="phases-grid">
          {phases.map((phase) => (
            <section key={phase.id} className={`phase-card phase-${phase.id}`}>
              <div className="phase-card-glow"></div>
              <div className="phase-card-content">
                <div className="phase-badge-wrapper">
                  <span className={`phase-badge phase-badge-${phase.id}`}>{phase.title}</span>
                </div>
                <h2 className="phase-subtitle">{phase.subtitle}</h2>
                <p className="phase-description">{phase.description}</p>
                <button
                  className={`phase-action-button ${phase.disabled ? 'disabled' : ''}`}
                  onClick={() => handlePhaseClick(phase)}
                  disabled={phase.disabled}
                >
                  {phase.actionLabel}
                  {!phase.disabled && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>
            </section>
          ))}
        </main>

        {/* Footer hint */}
        <footer className="homepage-footer">
          <span className="footer-icon">💡</span>
          <span>Tip: Start with <strong>Requirements & Analysis</strong> to feed high‑quality inputs into
          every other phase of your AI‑assisted SDLC. To enter a later phase, upload the major
          output document from the previous phase when prompted.</span>
        </footer>
      </div>
    </div>
  );
}
