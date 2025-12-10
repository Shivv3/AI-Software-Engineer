import { useState } from 'react';
import './ResultsPanel.css';

export default function ResultsPanel({
  sdlcRecommendation,
  projectPlan,
  implicitRequirements,
  onSaveSDLC,
  onDownloadSDLC,
  onSavePlan,
  onDownloadPlan,
  onSaveImplicit,
  onDownloadImplicit,
}) {
  const [addedRequirements, setAddedRequirements] = useState(new Set());

  const handleAddToSRS = (requirement) => {
    // In a real app, this would call an API to add to the SRS
    setAddedRequirements(prev => new Set([...prev, requirement.title]));
  };

  return (
    <div className="results-panel">
      {sdlcRecommendation && (
        <div className="results-card results-card-sdlc">
          <div className="results-card-header">
            <h2 className="results-card-title">SDLC Recommendation</h2>
            <div className="results-accent-line"></div>
          </div>
          <div className="results-card-content">
            <div className="results-field">
              <span className="results-label">Model:</span>
              <span className="results-value">{sdlcRecommendation.model}</span>
            </div>
            <div className="results-field">
              <span className="results-label">Why:</span>
              <span className="results-value">{sdlcRecommendation.why}</span>
            </div>
            {sdlcRecommendation.when_not_to_use && (
              <div className="results-field">
                <span className="results-label">When not to use:</span>
                <span className="results-value">{sdlcRecommendation.when_not_to_use}</span>
              </div>
            )}
            <div className="results-field">
              <span className="results-label">Confidence:</span>
              <span className="results-value results-confidence">
                {(sdlcRecommendation.confidence * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="results-card-actions">
            <button className="results-button-primary" onClick={onSaveSDLC}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2L3 7V13H13V7L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 13V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Save to sidebar</span>
            </button>
            <button className="results-button-secondary" onClick={onDownloadSDLC}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 11L3 6H6V1H10V6H13L8 11Z" fill="currentColor"/>
                <path d="M2 13H14V15H2V13Z" fill="currentColor"/>
              </svg>
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      {projectPlan && (
        <div className="results-card results-card-plan">
          <div className="results-card-header">
            <h2 className="results-card-title">Project Plan</h2>
            <div className="results-accent-line"></div>
          </div>
          <div className="results-card-content">
            <h3 className="results-section-title">Milestones</h3>
            <div className="results-milestones">
              {projectPlan.map((milestone, index) => (
                <div key={index} className="results-milestone">
                  <h4 className="results-milestone-title">{milestone.title}</h4>
                  <p className="results-milestone-duration">Duration: {milestone.duration_weeks} weeks</p>
                  <div className="results-milestone-section">
                    <p className="results-milestone-label">Deliverables:</p>
                    <ul className="results-list">
                      {milestone.deliverables.map((deliverable, i) => (
                        <li key={i}>{deliverable}</li>
                      ))}
                    </ul>
                  </div>
                  {milestone.roles_required && (
                    <div className="results-milestone-section">
                      <p className="results-milestone-label">Roles Required:</p>
                      <ul className="results-list">
                        {milestone.roles_required.map((role, i) => (
                          <li key={i}>{role}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="results-card-actions">
            <button className="results-button-primary" onClick={onSavePlan}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2L3 7V13H13V7L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 13V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Save to sidebar</span>
            </button>
            <button className="results-button-secondary" onClick={onDownloadPlan}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 11L3 6H6V1H10V6H13L8 11Z" fill="currentColor"/>
                <path d="M2 13H14V15H2V13Z" fill="currentColor"/>
              </svg>
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      {implicitRequirements && (
        <div className="results-card results-card-requirements">
          <div className="results-card-header">
            <h2 className="results-card-title">Implicit Requirements</h2>
            <div className="results-accent-line"></div>
          </div>
          <div className="results-card-content">
            <div className="results-requirements-list">
              {implicitRequirements.map((req, index) => (
                <div key={index} className="results-requirement">
                  <div className="results-requirement-header">
                    <div>
                      <h4 className="results-requirement-title">{req.title}</h4>
                      <div className="results-badges">
                        <span className={`results-badge results-badge-${req.type === 'FR' ? 'fr' : 'nfr'}`}>
                          {req.type}
                        </span>
                        <span className={`results-badge results-badge-${req.priority}`}>
                          {req.priority}
                        </span>
                      </div>
                    </div>
                    <button
                      className={`results-add-button ${addedRequirements.has(req.title) ? 'added' : ''}`}
                      onClick={() => handleAddToSRS(req)}
                      disabled={addedRequirements.has(req.title)}
                    >
                      {addedRequirements.has(req.title) ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M13.5 2L6 9.5L2.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span>Added</span>
                        </>
                      ) : (
                        <>
                          <span>Add to SRS</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="results-requirement-description">{req.description}</p>
                  <p className="results-requirement-rationale">
                    <span className="results-rationale-label">Rationale:</span> {req.rationale}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="results-card-actions">
            <button className="results-button-primary" onClick={onSaveImplicit}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2L3 7V13H13V7L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 13V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Save to sidebar</span>
            </button>
            <button className="results-button-secondary" onClick={onDownloadImplicit}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 11L3 6H6V1H10V6H13L8 11Z" fill="currentColor"/>
                <path d="M2 13H14V15H2V13Z" fill="currentColor"/>
              </svg>
              <span>Download</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}