import { useNavigate, useParams } from 'react-router-dom';
import { useProjectContext } from './ProjectContext';
import './DesignPage.css';

export default function DesignPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { projectName } = useProjectContext();

  return (
    <div className="design-page">
      <div className="workspace-container">
        {/* Header / Hero */}
        <header className="design-header">
          <button className="design-back-button" onClick={() => navigate(`/projects/${projectId || ''}`)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Back to workspace</span>
          </button>
          <div className="design-badge">Phase 2 · System Design</div>
          <h1 className="design-title">
            Design Studio – from SRS to architecture blueprints.
          </h1>
          <p className="design-subtitle">
            You have entered the System Design phase{projectName ? ` for ${projectName}` : ''}. Using your SRS as the source of truth, this
            workspace will help you explore architecture options, select a tech stack, and derive
            database schemas. The initial features below will be expanded soon.
          </p>
        </header>

        {/* Feature cards */}
        <main className="design-features-grid">
          <section className="design-feature-card">
            <div className="design-feature-badge design-feature-badge-blue">A. High‑Level Design</div>
            <h2 className="design-feature-title">
              System Design &amp; Tech Stack Suggestion
            </h2>
            <p className="design-feature-description">
              Soon you&apos;ll be able to feed your SRS into this tool to get recommended
              architectures, service boundaries, integration patterns, and a technology stack that
              aligns with your constraints and non‑functional requirements.
            </p>
            <button
              className="design-feature-button"
              onClick={() => navigate(`/projects/${projectId}/design/system`)}
            >
              <span>Open Consultation Wizard</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </section>

          <section className="design-feature-card">
            <div className="design-feature-badge design-feature-badge-yellow">B. Data Design</div>
            <h2 className="design-feature-title">Database Schema Generator</h2>
            <p className="design-feature-description">
              This tool will analyse entities, relationships, and constraints implied by your SRS
              to propose an initial database schema, complete with tables, keys, and notes on
              normalization and performance trade‑offs.
            </p>
            <button className="design-feature-button" disabled>
              Coming Soon
            </button>
          </section>
        </main>
      </div>
    </div>
  );
}


