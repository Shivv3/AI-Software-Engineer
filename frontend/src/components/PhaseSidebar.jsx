import { useMemo } from 'react';
import { useProjectContext } from './ProjectContext';
import './PhaseSidebar.css';

const phases = [
  { key: 'requirements', label: 'Requirements' },
  { key: 'design', label: 'Design' },
  { key: 'implementation', label: 'Build' },
  { key: 'quality', label: 'Quality' },
];

function scoreClass(score) {
  if (score === null || score === undefined) return 'neutral';
  if (score >= 80) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

export default function PhaseSidebar() {
  const { health } = useProjectContext();
  const phaseData = health?.phases || {};

  const summary = useMemo(() => {
    const documents = health?.documents || 0;
    const links = health?.traceabilityLinks || 0;
    return `${documents} docs · ${links} links`;
  }, [health]);

  return (
    <aside className="phase-sidebar app-card">
      <div className="phase-sidebar-title">SDLC Spine</div>
      <div className="phase-sidebar-summary">{summary}</div>
      <div className="phase-sidebar-list">
        {phases.map((phase, index) => {
          const item = phaseData[phase.key] || {};
          const score = item.score;
          return (
            <div key={phase.key} className="phase-sidebar-item">
              <div className="phase-sidebar-index">{index + 1}</div>
              <div className="phase-sidebar-copy">
                <div className="phase-sidebar-label">{phase.label}</div>
                <div className="phase-sidebar-meta">{item.artifacts || 0} artifacts</div>
              </div>
              <div className={`phase-sidebar-score ${scoreClass(score)}`}>
                {score === null || score === undefined ? '--' : score}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
