import { useState } from 'react';

export default function SystemDesignWizard() {
  const [form, setForm] = useState({
    cloudPreference: '',
    legacyTech: '',
    teamSkills: '',
    priorities: '',
    isGreenfield: false,
    srsText: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [designMarkdown, setDesignMarkdown] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.srsText.trim()) {
      setError('Please paste or provide the key SRS content before generating the design.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/design/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srs_text: form.srsText,
          context: {
            cloudPreference: form.cloudPreference,
            legacyTech: form.legacyTech,
            teamSkills: form.teamSkills,
            priorities: form.priorities,
            isGreenfield: form.isGreenfield,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate system design');
      }

      const data = await response.json();
      setDesignMarkdown(data.design_markdown || '');
    } catch (err) {
      setError(err.message || 'Failed to generate system design');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!designMarkdown) return;

    try {
      const response = await fetch('/api/design/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design_markdown: designMarkdown }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to export design document');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `System_Design_${new Date().toISOString().split('T')[0]}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to export design document');
    }
  };

  const extractMermaid = () => {
    if (!designMarkdown) return null;
    const match = designMarkdown.match(/```mermaid([\s\S]*?)```/);
    return match ? match[0] : null;
  };

  const mermaidBlock = extractMermaid();

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, #e0f2fe 0, transparent 55%), radial-gradient(circle at bottom right, #ede9fe 0, transparent 55%), #f9fafb',
      }}
    >
      <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
        {/* Header */}
        <header className="mb-8">
          <div className="mb-2">
            <span className="badge badge-blue">System Design &amp; Tech Stack Suggestion</span>
          </div>
          <h1
            className="text-2xl font-bold"
            style={{ fontSize: '2rem', marginBottom: '0.75rem' }}
          >
            Consultation Wizard
          </h1>
          <p className="text-gray-600" style={{ maxWidth: '640px' }}>
            Answer a few high‑level questions about your environment and priorities, then paste the
            key parts of your SRS. The AI Software Engineer will propose an architecture strategy,
            tech stack, and a visual Mermaid diagram.
          </p>
        </header>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem' }}>
          {/* Left: Form */}
          <section className="card">
            <h2 className="text-xl font-semibold mb-2">Context Injection</h2>
            <p className="text-sm text-gray-600 mb-4">
              You can describe your existing environment and constraints, or leave it blank for a{' '}
              <strong>Greenfield / best‑practice</strong> recommendation.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="text-sm font-medium mb-1">Cloud / Infrastructure Preference</label>
                <input
                  className="input"
                  type="text"
                  name="cloudPreference"
                  placeholder="e.g., AWS, Azure, GCP, On‑prem, No preference"
                  value={form.cloudPreference}
                  onChange={handleChange}
                />
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium mb-1">Legacy Systems / Tech to Integrate</label>
                <input
                  className="input"
                  type="text"
                  name="legacyTech"
                  placeholder="e.g., Existing .NET APIs, PHP monolith, Oracle DB"
                  value={form.legacyTech}
                  onChange={handleChange}
                />
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium mb-1">Team Skills</label>
                <input
                  className="input"
                  type="text"
                  name="teamSkills"
                  placeholder="e.g., Strong in JavaScript/TypeScript, some Python, no Go"
                  value={form.teamSkills}
                  onChange={handleChange}
                />
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium mb-1">Business Priorities</label>
                <input
                  className="input"
                  type="text"
                  name="priorities"
                  placeholder="e.g., Speed‑to‑market over scalability, low cost, strict compliance"
                  value={form.priorities}
                  onChange={handleChange}
                />
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium mb-1">SRS Content (from previous phase)</label>
                <textarea
                  className="textarea"
                  name="srsText"
                  placeholder="Paste the most important sections of your SRS here (overview, key requirements, NFRs)..."
                  rows={8}
                  value={form.srsText}
                  onChange={handleChange}
                />
              </div>

              <div className="mb-4">
                <label className="text-sm">
                  <input
                    type="checkbox"
                    name="isGreenfield"
                    checked={form.isGreenfield}
                    onChange={handleChange}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Treat this as a <strong>Greenfield</strong> project (ignore most legacy constraints and
                  aim for best‑practice recommendations).
                </label>
              </div>

              {error && (
                <p className="text-sm" style={{ color: '#b91c1c', marginBottom: '0.75rem' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? 'Generating System Design...' : 'Generate System Design'}
              </button>
            </form>
          </section>

          {/* Right: Output */}
          <section className="card" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="text-xl font-semibold mb-0">Design Document</h2>
              <button
                className="btn btn-secondary"
                onClick={handleDownload}
                disabled={!designMarkdown}
              >
                Download DOCX
              </button>
            </div>

            {!designMarkdown && (
              <p className="text-sm text-gray-600">
                Once generated, your architecture strategy, tech stack recommendations, and Mermaid
                diagram will appear here.
              </p>
            )}

            {designMarkdown && (
              <div style={{ overflowY: 'auto', flex: 1, borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: '0.85rem',
                  }}
                >
                  {designMarkdown}
                </pre>

                {mermaidBlock && (
                  <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-1">Architecture Diagram (Mermaid)</h3>
                    <p className="text-sm text-gray-600 mb-2">
                      This is a Mermaid diagram definition you can render in tools that support Mermaid.
                    </p>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        backgroundColor: '#0f172a',
                        color: '#e5e7eb',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        fontSize: '0.8rem',
                      }}
                    >
                      {mermaidBlock}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}


