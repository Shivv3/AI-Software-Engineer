import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

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

    try {
      const stored = JSON.parse(localStorage.getItem('ase.projects')) || [];
      const match = stored.find((item) => item.id === projectId);
      if (match) {
        setProjectName(match.name);
        setProjectNotFound(false);
      } else {
        setProjectNotFound(true);
      }
    } catch {
      setProjectNotFound(true);
    }
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
        'Coming soon: implementation scaffolds, code generation aligned with your SRS, and AI pair‑programming across the stack.',
      actionLabel: 'Implementation Lab (Soon)',
      disabled: true,
      accentClass: 'badge-yellow',
    },
    {
      id: 'testing',
      title: '4. Testing & Quality',
      subtitle: 'Verification, validation and automation',
      description:
        'Coming soon: test‑case generation from requirements, coverage guidance, and automated regression testing strategies.',
      actionLabel: 'Quality Center (Soon)',
      disabled: true,
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
      <div
        style={{
          minHeight: '100vh',
          background:
            'radial-gradient(circle at top left, #e0f2fe 0, transparent 55%), radial-gradient(circle at bottom right, #ede9fe 0, transparent 55%), #f9fafb',
        }}
      >
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
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, #e0f2fe 0, transparent 55%), radial-gradient(circle at bottom right, #ede9fe 0, transparent 55%), #f9fafb',
      }}
    >
      <div className="container">
        {/* Hero */}
        <header className="mb-8" style={{ paddingTop: '2.5rem' }}>
          {projectId && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => navigate('/')}>
                ← Back to projects
              </button>
              <span className="text-sm text-gray-700">
                Working on <strong>{projectName || 'Untitled project'}</strong>
              </span>
            </div>
          )}
          <div className="mb-2">
            <span className="badge badge-blue">AI Software Engineer</span>
          </div>
          <h1
            className="text-2xl font-bold"
            style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}
          >
            Orchestrate your entire Software Development Lifecycle in one place.
          </h1>
          <p className="text-gray-600" style={{ maxWidth: '640px' }}>
            This universal homepage is your command center. Start from requirements, move through
            design and implementation, and finish with robust testing – with AI assisting you at
            every step.
          </p>
        </header>

        {/* Phases grid */}
        <main
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.5rem',
            marginBottom: '3rem',
          }}
        >
          {phases.map((phase) => (
            <section key={phase.id} className="card" style={{ position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0.03,
                  background:
                    phase.id === 'requirements'
                      ? 'linear-gradient(135deg, #3b82f6, #6366f1)'
                      : phase.id === 'design'
                      ? 'linear-gradient(135deg, #10b981, #14b8a6)'
                      : phase.id === 'implementation'
                      ? 'linear-gradient(135deg, #f59e0b, #f97316)'
                      : 'linear-gradient(135deg, #ef4444, #f97373)',
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative' }}>
                <div className="mb-2">
                  <span className={`badge ${phase.accentClass}`}>{phase.title}</span>
                </div>
                <h2 className="text-xl font-semibold mb-1">{phase.subtitle}</h2>
                <p className="text-sm text-gray-600 mb-4">{phase.description}</p>
                <button
                  className="btn btn-primary"
                  onClick={() => handlePhaseClick(phase)}
                  disabled={phase.disabled}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  {phase.actionLabel}
                </button>
              </div>
            </section>
          ))}
        </main>

        {/* Footer hint */}
        <footer className="text-sm text-gray-600" style={{ paddingBottom: '2rem' }}>
          Tip: Start with <strong>Requirements & Analysis</strong> to feed high‑quality inputs into
          every other phase of your AI‑assisted SDLC. To enter a later phase, upload the major
          output document from the previous phase when prompted.
        </footer>

      </div>
    </div>
  );
}
