import { useState } from 'react';
import './ConflictPanel.css';

const TYPE_META = {
  direct_negation: { label: 'Direct Negation', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', icon: '⚡' },
  temporal:        { label: 'Temporal',         color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)', icon: '⏱' },
  quantitative:    { label: 'Quantitative',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: '📊' },
  permission:      { label: 'Permission',       color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', icon: '🔐' },
  existence:       { label: 'Existence',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)', icon: '❓' },
};

function getSeverity(confidence) {
  if (confidence >= 0.85) return { label: 'High', cls: 'severity-high' };
  if (confidence >= 0.65) return { label: 'Medium', cls: 'severity-medium' };
  return { label: 'Low', cls: 'severity-low' };
}

function ConflictCard({ item, index }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[item.conflict_type] || {
    label: item.conflict_type?.replace(/_/g, ' ') || 'Unknown',
    color: '#94a3b8',
    bg: 'rgba(148,163,184,0.08)',
    border: 'rgba(148,163,184,0.2)',
    icon: '⚠',
  };
  const severity = getSeverity(item.confidence || 0);

  return (
    <div
      className="cf-card"
      style={{ borderLeft: `3px solid ${meta.color}` }}
    >
      {/* Card header row */}
      <div className="cf-card-header" onClick={() => setExpanded((v) => !v)}>
        <div className="cf-card-left">
          <span className="cf-index">#{index + 1}</span>
          <span className="cf-type-badge" style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}>
            {meta.icon} {meta.label}
          </span>
          <span className={`cf-severity ${severity.cls}`}>{severity.label} Severity</span>
        </div>
        <div className="cf-card-right">
          <span className="cf-confidence">{Math.round((item.confidence || 0) * 100)}% confidence</span>
          <span className="cf-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Requirements table — always visible */}
      <table className="cf-req-table">
        <thead>
          <tr>
            <th>Requirement A</th>
            <th>Requirement B</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{item.req_a}</td>
            <td>{item.req_b}</td>
          </tr>
        </tbody>
      </table>

      {/* Expanded section: explanation + resolution */}
      {expanded && (
        <div className="cf-detail">
          {item.explanation && (
            <div className="cf-section cf-section-explain">
              <div className="cf-section-label">
                <span className="cf-section-icon">🔍</span> Why it conflicts
              </div>
              <p className="cf-section-text">{item.explanation}</p>
            </div>
          )}
          {item.resolution && (
            <div className="cf-section cf-section-resolve">
              <div className="cf-section-label">
                <span className="cf-section-icon">✅</span> Suggested Resolution
              </div>
              <p className="cf-section-text">{item.resolution}</p>
            </div>
          )}
          {!item.explanation && !item.resolution && (
            <p className="cf-no-detail">No LLM explanation available for this conflict (low confidence pair).</p>
          )}
        </div>
      )}

      {(item.explanation || item.resolution) && (
        <button className="cf-toggle-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Collapse' : 'View Explanation & Resolution'}
        </button>
      )}
    </div>
  );
}

export default function ConflictPanel({ loading, error, conflicts, onAnalyze, requirementsCount, hasRun }) {
  const hasConflicts = Array.isArray(conflicts) && conflicts.length > 0;

  const highCount   = conflicts?.filter((c) => (c.confidence || 0) >= 0.85).length || 0;
  const medCount    = conflicts?.filter((c) => (c.confidence || 0) >= 0.65 && (c.confidence || 0) < 0.85).length || 0;
  const lowCount    = conflicts?.filter((c) => (c.confidence || 0) < 0.65).length || 0;

  return (
    <div className="cf-panel">
      {/* Header */}
      <div className="cf-panel-header">
        <div className="cf-panel-title-block">
          <h3 className="cf-panel-title">⚔ Conflict Detection</h3>
          <p className="cf-panel-subtitle">
            Find contradictions across requirements — powered by semantic analysis + LLM resolution.
          </p>
        </div>
        <button
          className="cf-detect-btn"
          onClick={onAnalyze}
          disabled={loading || requirementsCount === 0}
        >
          {loading ? (
            <span className="cf-loading">
              <span className="cf-spinner" />
              Detecting…
            </span>
          ) : (
            'Detect Conflicts'
          )}
        </button>
      </div>

      {/* Error */}
      {error && <div className="cf-error">{error}</div>}

      {/* Stats bar */}
      {hasConflicts && (
        <div className="cf-stats-bar">
          <div className="cf-stat cf-stat-total">
            <span className="cf-stat-number">{conflicts.length}</span>
            <span className="cf-stat-label">Total Conflicts</span>
          </div>
          <div className="cf-stat cf-stat-high">
            <span className="cf-stat-number">{highCount}</span>
            <span className="cf-stat-label">High Severity</span>
          </div>
          <div className="cf-stat cf-stat-medium">
            <span className="cf-stat-number">{medCount}</span>
            <span className="cf-stat-label">Medium</span>
          </div>
          <div className="cf-stat cf-stat-low">
            <span className="cf-stat-number">{lowCount}</span>
            <span className="cf-stat-label">Low</span>
          </div>
        </div>
      )}

      {/* Content */}
      {hasConflicts ? (
        <div className="cf-list">
          {conflicts.map((item, idx) => (
            <ConflictCard key={`${item.req_a_index}-${item.req_b_index}-${idx}`} item={item} index={idx} />
          ))}
        </div>
      ) : (
        <div className="cf-empty">
          {loading ? (
            <div className="cf-loading-state">
              <div className="cf-spinner-large" />
              <p>Analyzing requirements for conflicts…</p>
            </div>
          ) : hasRun ? (
            <div className="cf-idle-state cf-success-state">
              <span className="cf-idle-icon">✅</span>
              <p>Great! No conflicts detected.</p>
              <p className="cf-idle-sub">All {requirementsCount} requirements are mutually compatible.</p>
            </div>
          ) : (
            <div className="cf-idle-state">
              <span className="cf-idle-icon">🔍</span>
              <p>Run detection to see conflicting requirements.</p>
              <p className="cf-idle-sub">
                {requirementsCount > 0
                  ? `${requirementsCount} requirement${requirementsCount !== 1 ? 's' : ''} ready to analyze.`
                  : 'Generate some SRS content first to enable conflict detection.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
