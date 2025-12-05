import { useNavigate } from 'react-router-dom';

export default function DesignPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, #e0f2fe 0, transparent 55%), radial-gradient(circle at bottom right, #ede9fe 0, transparent 55%), #f9fafb',
      }}
    >
      <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
        {/* Header / Hero */}
        <header className="mb-8">
          <div className="mb-2">
            <span className="badge badge-green">Phase 2 · System Design</span>
          </div>
          <h1
            className="text-2xl font-bold"
            style={{ fontSize: '2rem', marginBottom: '0.75rem' }}
          >
            Design Studio – from SRS to architecture blueprints.
          </h1>
          <p className="text-gray-600" style={{ maxWidth: '640px' }}>
            You have entered the System Design phase. Using your SRS as the source of truth, this
            workspace will help you explore architecture options, select a tech stack, and derive
            database schemas. The initial features below will be expanded soon.
          </p>
        </header>

        {/* Feature cards */}
        <main
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.5rem',
          }}
        >
          <section className="card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.04,
                background: 'linear-gradient(135deg, #22c55e, #3b82f6)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'relative' }}>
              <div className="mb-2">
                <span className="badge badge-blue">A. High‑Level Design</span>
              </div>
              <h2 className="text-xl font-semibold mb-1">
                System Design &amp; Tech Stack Suggestion
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Soon you&apos;ll be able to feed your SRS into this tool to get recommended
                architectures, service boundaries, integration patterns, and a technology stack that
                aligns with your constraints and non‑functional requirements.
              </p>
              <button
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => navigate('/design/system')}
              >
                Open Consultation Wizard
              </button>
            </div>
          </section>

          <section className="card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.04,
                background: 'linear-gradient(135deg, #6366f1, #f97316)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'relative' }}>
              <div className="mb-2">
                <span className="badge badge-yellow">B. Data Design</span>
              </div>
              <h2 className="text-xl font-semibold mb-1">Database Schema Generator</h2>
              <p className="text-sm text-gray-600 mb-4">
                This tool will analyse entities, relationships, and constraints implied by your SRS
                to propose an initial database schema, complete with tables, keys, and notes on
                normalization and performance trade‑offs.
              </p>
              <button className="btn btn-secondary" disabled style={{ width: '100%' }}>
                Coming Soon
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}


