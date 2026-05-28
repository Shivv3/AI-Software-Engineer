import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectContext } from './ProjectContext';
import './PhaseSidebar.css';

const phases = [
  { key: 'requirements', label: 'Requirements', path: 'requirements' },
  { key: 'design', label: 'Design', path: 'design' },
  { key: 'implementation', label: 'Build Lab', path: 'implementation' },
  { key: 'generate', label: 'Code Folder', path: 'generate' },
  { key: 'quality', label: 'Quality', path: 'quality' },
];

function scoreClass(score) {
  if (score === null || score === undefined) return 'neutral';
  if (score >= 80) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

export default function PhaseSidebar() {
  const { health } = useProjectContext();
  const navigate = useNavigate();
  const { projectId } = useParams();
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
            <button
              key={phase.key}
              className="phase-sidebar-item"
              type="button"
              onClick={() => navigate(`/projects/${projectId}/${phase.path}`)}
            >
              <div className="phase-sidebar-index">{index + 1}</div>
              <div className="phase-sidebar-copy">
                <div className="phase-sidebar-label">{phase.label}</div>
                <div className="phase-sidebar-meta">{item.artifacts || 0} artifacts</div>
              </div>
              <div className={`phase-sidebar-score ${scoreClass(score)}`}>
                {score === null || score === undefined ? '--' : score}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
