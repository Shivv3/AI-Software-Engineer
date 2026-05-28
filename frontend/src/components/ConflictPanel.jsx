import { useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import './ConflictPanel.css';

const TYPE_COLORS = {
  direct_negation: '#ef4444',
  temporal: '#f97316',
  quantitative: '#f59e0b',
  permission: '#3b82f6',
  existence: '#8b5cf6',
};

export default function ConflictPanel({
  loading,
  error,
  conflicts,
  graph,
  onAnalyze,
  requirementsCount,
}) {
  const graphData = useMemo(() => {
    return {
      nodes: graph?.nodes || [],
      links: graph?.edges || [],
    };
  }, [graph]);

  return (
    <div className="conflict-panel">
      <div className="conflict-panel-head">
        <div>
          <h3>Semantic Conflict Detector</h3>
          <p>Find contradictions across requirements with semantic + rule-based analysis.</p>
        </div>
        <button className="conflict-button" onClick={onAnalyze} disabled={loading || requirementsCount === 0}>
          {loading ? 'Detecting...' : 'Detect Conflicts'}
        </button>
      </div>

      {error && <div className="conflict-error">{error}</div>}

      {graphData.nodes.length > 0 ? (
        <div className="conflict-graph">
          <ForceGraph2D
            graphData={graphData}
            nodeLabel="label"
            nodeAutoColorBy="id"
            linkColor={(link) => TYPE_COLORS[link.type] || '#94a3b8'}
            linkWidth={(link) => Math.max(1, (link.confidence || 0.4) * 3)}
            height={320}
          />
        </div>
      ) : (
        <div className="conflict-empty">No conflicts detected yet.</div>
      )}

      <div className="conflict-list">
        {conflicts?.length ? (
          conflicts.map((item, idx) => (
            <div key={`${item.req_a_index}-${item.req_b_index}-${idx}`} className="conflict-card">
              <div className="conflict-card-head">
                <span
                  className="conflict-type"
                  style={{ backgroundColor: TYPE_COLORS[item.conflict_type] || '#334155' }}
                >
                  {item.conflict_type.replace('_', ' ')}
                </span>
                <span className="conflict-score">{Math.round(item.confidence * 100)}%</span>
              </div>
              <div className="conflict-text">
                <strong>Req A:</strong> {item.req_a}
              </div>
              <div className="conflict-text">
                <strong>Req B:</strong> {item.req_b}
              </div>
              {item.explanation && <div className="conflict-explanation">{item.explanation}</div>}
            </div>
          ))
        ) : (
          <div className="conflict-empty">Run detection to see conflicts.</div>
        )}
      </div>
    </div>
  );
}
