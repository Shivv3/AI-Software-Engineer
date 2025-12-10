import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ResultsPanel from './ResultsPanel';
import { useProjectContext } from './ProjectContext';
import './HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { addDocument, projectName, documents } = useProjectContext();
  const [projectData, setProjectData] = useState({
    title: '',
    description: '',
    teamSize: '',
    timeline: '',
    budget: ''
  });

  const [loading, setLoading] = useState({
    sdlc: false,
    plan: false,
    requirements: false
  });

  const [results, setResults] = useState({
    sdlcRecommendation: null,
    projectPlan: null,
    implicitRequirements: null
  });

  const [saveMessage, setSaveMessage] = useState('');
  const downloadText = (filename, content) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const makeSDLCText = () => {
    if (!results.sdlcRecommendation) return '';
    const { model, why, when_not_to_use, confidence } = results.sdlcRecommendation;
    return `SDLC Recommendation\nModel: ${model}\nWhy: ${why}\nWhen not to use: ${when_not_to_use || 'n/a'}\nConfidence: ${(
      confidence * 100
    ).toFixed(1)}%`;
  };

  const makePlanText = () => {
    if (!results.projectPlan) return '';
    return results.projectPlan
      .map(
        (m, idx) =>
          `Milestone ${idx + 1}: ${m.title}\nDuration: ${m.duration_weeks} weeks\nDeliverables: ${m.deliverables.join(
            ', ',
          )}${m.roles_required ? `\nRoles: ${m.roles_required.join(', ')}` : ''}`,
      )
      .join('\n\n');
  };

  const makeImplicitText = () => {
    if (!results.implicitRequirements) return '';
    return results.implicitRequirements
      .map((r, idx) => `${idx + 1}. [${r.type}/${r.priority}] ${r.title} - ${r.description}\nRationale: ${r.rationale}`)
      .join('\n\n');
  };

  const contextDocs = documents.filter((d) => d.useAsContext && d.content);
  const getContextText = () =>
    contextDocs
      .map((d) => `---\n[${d.type || 'Doc'}] ${d.name}\n${d.content}`)
      .join('\n\n');

  const saveDoc = async ({ name, type, content }) => {
    if (!projectId) {
      alert('Open or create a project to save documents.');
      return;
    }
    if (!content.trim()) {
      alert('Nothing to save yet.');
      return;
    }
    await addDocument({
      name,
      type,
      mime: 'text/plain',
      content,
      source: 'generated',
      useAsContext: true,
    });
    setSaveMessage('Saved to project sidebar.');
    setTimeout(() => setSaveMessage(''), 2000);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProjectData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const recommendSDLC = async () => {
    if (!projectData.description) {
      alert('Please provide a project description');
      return;
    }
    try {
      setLoading(prev => ({ ...prev, sdlc: true }));
      const response = await axios.post('/api/sdlc/recommend', {
        project_text: `${projectData.description}\n\n${contextDocs.length ? 'Context:\n' + getContextText() : ''}`,
        constraints: {
          team_size: parseInt(projectData.teamSize) || 1,
          timeline: projectData.timeline || '3 months',
          budget: projectData.budget || 'medium'
        }
      });
      
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response from server');
      }
      
      setResults(prev => ({
        ...prev,
        sdlcRecommendation: response.data
      }));
    } catch (error) {
      console.error('Error getting SDLC recommendation:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to get SDLC recommendation';
      alert(errorMessage);
    } finally {
      setLoading(prev => ({ ...prev, sdlc: false }));
    }
  };

  const generatePlan = async () => {
    if (!projectData.description) {
      alert('Please provide a project description');
      return;
    }
    try {
      setLoading(prev => ({ ...prev, plan: true }));
      const response = await axios.post('/api/plan/generate', {
        project_text: `${projectData.description}\n\n${contextDocs.length ? 'Context:\n' + getContextText() : ''}`,
        title: projectData.title || 'Untitled Project',
        team_size: parseInt(projectData.teamSize) || 1,
        timeline: projectData.timeline || '3 months',
        budget: projectData.budget || 'medium'
      });

      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response from server');
      }

      setResults(prev => ({
        ...prev,
        projectPlan: response.data.milestones
      }));
    } catch (error) {
      console.error('Error generating plan:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to generate project plan';
      alert(errorMessage);
    } finally {
      setLoading(prev => ({ ...prev, plan: false }));
    }
  };

  const generateRequirements = async () => {
    if (!projectData.description) {
      alert('Please provide a project description');
      return;
    }
    try {
      setLoading(prev => ({ ...prev, requirements: true }));
      const response = await axios.post('/api/plan/generate', {
        project_text: `${projectData.description}\n\n${contextDocs.length ? 'Context:\n' + getContextText() : ''}`,
        title: projectData.title || 'Untitled Project',
        team_size: parseInt(projectData.teamSize) || 1,
        timeline: projectData.timeline || '3 months',
        budget: projectData.budget || 'medium'
      });

      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response from server');
      }

      setResults(prev => ({
        ...prev,
        implicitRequirements: response.data.implicit_requirements
      }));
    } catch (error) {
      console.error('Error generating requirements:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to generate implicit requirements';
      alert(errorMessage);
    } finally {
      setLoading(prev => ({ ...prev, requirements: false }));
    }
  };

  const buildSrsDraft = () => {
    const parts = [];
    if (projectData.title) parts.push(`Project: ${projectData.title}`);
    if (projectData.description) parts.push(`Description:\n${projectData.description}`);
    if (results.sdlcRecommendation) {
      parts.push(
        `SDLC Recommendation: ${results.sdlcRecommendation.model}\nWhy: ${results.sdlcRecommendation.why}\nConfidence: ${(
          results.sdlcRecommendation.confidence * 100
        ).toFixed(1)}%`,
      );
    }
    if (results.projectPlan) {
      const planText = results.projectPlan
        .map(
          (m, idx) =>
            `Milestone ${idx + 1}: ${m.title}\nDuration: ${m.duration_weeks} weeks\nDeliverables: ${m.deliverables.join(
              ', ',
            )}`,
        )
        .join('\n\n');
      parts.push(`Project Plan:\n${planText}`);
    }
    if (results.implicitRequirements) {
      const reqText = results.implicitRequirements
        .map((r, idx) => `${idx + 1}. [${r.type}/${r.priority}] ${r.title} - ${r.description}`)
        .join('\n');
      parts.push(`Implicit Requirements:\n${reqText}`);
    }
    return parts.join('\n\n');
  };

  const handleSaveToProject = async () => {
    const content = buildSrsDraft();
    if (!projectId) {
      alert('Open or create a project to save documents.');
      return;
    }
    if (!content.trim()) {
      alert('Generate content first (plan or requirements) before saving.');
      return;
    }
    await addDocument({
      name: projectData.title ? `${projectData.title} - SRS Draft` : 'SRS Draft',
      type: 'SRS',
      mime: 'text/plain',
      content,
      source: 'generated',
      useAsContext: true,
    });
    setSaveMessage('Saved to project sidebar.');
    setTimeout(() => setSaveMessage(''), 2500);
  };

  return (
    <div className="requirements-workspace">
      <div className="requirements-header">
        <div className="requirements-header-top">
          <h1 className="requirements-title">Project Analysis Tool</h1>
          {projectId && (
            <div className="requirements-project-info">
              Project: <strong>{projectName || projectData.title || 'Untitled project'}</strong>
            </div>
          )}
        </div>
        <button
          className="requirements-back-button"
          onClick={() => navigate(`/projects/${projectId || ''}`)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Back to Workspace</span>
        </button>
      </div>
      
      <div className="requirements-form-card">
        <div className="requirements-form-header">
          <h2 className="requirements-form-title">Project Information</h2>
          <div className="requirements-accent-line"></div>
        </div>

        <div className="requirements-form-content">
          <input
            type="text"
            name="title"
            placeholder="Project Title"
            value={projectData.title}
            onChange={handleInputChange}
            className="requirements-input"
          />

          <textarea
            name="description"
            placeholder="Project Description"
            value={projectData.description}
            onChange={handleInputChange}
            className="requirements-textarea"
            rows="6"
          />

          <div className="requirements-grid">
            <input
              type="text"
              name="teamSize"
              placeholder="Team Size"
              value={projectData.teamSize}
              onChange={handleInputChange}
              className="requirements-input"
            />
            <input
              type="text"
              name="timeline"
              placeholder="Timeline (months)"
              value={projectData.timeline}
              onChange={handleInputChange}
              className="requirements-input"
            />
            <input
              type="text"
              name="budget"
              placeholder="Budget (optional)"
              value={projectData.budget}
              onChange={handleInputChange}
              className="requirements-input"
            />
          </div>

          <div className="requirements-actions">
            <button
              onClick={recommendSDLC}
              disabled={loading.sdlc || !projectData.description}
              className={`requirements-action-button requirements-button-sdlc ${loading.sdlc || !projectData.description ? 'disabled' : ''}`}
            >
              {loading.sdlc ? (
                <>
                  <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                      <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                    </circle>
                  </svg>
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <span>Recommend SDLC</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </button>
            
            <button
              onClick={generatePlan}
              disabled={loading.plan || !projectData.description}
              className={`requirements-action-button requirements-button-plan ${loading.plan || !projectData.description ? 'disabled' : ''}`}
            >
              {loading.plan ? (
                <>
                  <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                      <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                    </circle>
                  </svg>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <span>Generate Project Plan</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </button>

            <button
              onClick={generateRequirements}
              disabled={loading.requirements || !projectData.description}
              className={`requirements-action-button requirements-button-requirements ${loading.requirements || !projectData.description ? 'disabled' : ''}`}
            >
              {loading.requirements ? (
                <>
                  <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                      <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                    </circle>
                  </svg>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <span>Generate Implicit Requirements</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </button>

            <button
              onClick={() => navigate(projectId ? `/projects/${projectId}/srs-editor` : '/srs-editor')}
              className="requirements-action-button requirements-button-srs"
            >
              <span>SRS Editor</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {(results.sdlcRecommendation || results.projectPlan || results.implicitRequirements) && (
        <ResultsPanel
          sdlcRecommendation={results.sdlcRecommendation}
          projectPlan={results.projectPlan}
          implicitRequirements={results.implicitRequirements}
          onSaveSDLC={() =>
            saveDoc({
              name: `${projectData.title || projectName || 'Project'} - SDLC Recommendation`,
              type: 'SDLC',
              content: makeSDLCText(),
            })
          }
          onDownloadSDLC={() => downloadText('sdlc-recommendation.txt', makeSDLCText())}
          onSavePlan={() =>
            saveDoc({
              name: `${projectData.title || projectName || 'Project'} - Project Plan`,
              type: 'Plan',
              content: makePlanText(),
            })
          }
          onDownloadPlan={() => downloadText('project-plan.txt', makePlanText())}
          onSaveImplicit={() =>
            saveDoc({
              name: `${projectData.title || projectName || 'Project'} - Implicit Requirements`,
              type: 'Requirements',
              content: makeImplicitText(),
            })
          }
          onDownloadImplicit={() => downloadText('implicit-requirements.txt', makeImplicitText())}
        />
      )}

      {saveMessage && <p className="text-sm text-green-700 mt-2">{saveMessage}</p>}
    </div>
  );
}