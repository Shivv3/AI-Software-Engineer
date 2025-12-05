import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ResultsPanel from './ResultsPanel';
import { useProjectContext } from './ProjectContext';

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
    <div className="container mx-auto p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Project Analysis Tool</h1>
        {projectId && (
          <div className="text-sm text-gray-600">
            Project: <strong>{projectName || projectData.title || 'Untitled project'}</strong>
          </div>
        )}
      </div>
      <div className="mb-2">
        <button
          onClick={() => navigate(`/projects/${projectId || ''}`)}
          className="px-3 py-2 bg-gray-100 rounded text-sm"
        >
          ← Back to Workspace
        </button>
      </div>
      
      <div className="mb-6">
        <input
          type="text"
          name="title"
          placeholder="Project Title"
          value={projectData.title}
          onChange={handleInputChange}
          className="w-full p-2 mb-4 border rounded"
        />

        <textarea
          name="description"
          placeholder="Project Description"
          value={projectData.description}
          onChange={handleInputChange}
          className="w-full p-2 mb-4 border rounded h-32"
        />

        <div className="grid grid-cols-3 gap-4 mb-4">
          <input
            type="text"
            name="teamSize"
            placeholder="Team Size"
            value={projectData.teamSize}
            onChange={handleInputChange}
            className="p-2 border rounded"
          />
          <input
            type="text"
            name="timeline"
            placeholder="Timeline (months)"
            value={projectData.timeline}
            onChange={handleInputChange}
            className="p-2 border rounded"
          />
          <input
            type="text"
            name="budget"
            placeholder="Budget (optional)"
            value={projectData.budget}
            onChange={handleInputChange}
            className="p-2 border rounded"
          />
        </div>

        <div className="flex gap-4">
          <button
            onClick={recommendSDLC}
            disabled={loading.sdlc || !projectData.description}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
          >
            {loading.sdlc ? 'Analyzing...' : 'Recommend SDLC'}
          </button>
          
          <button
            onClick={generatePlan}
            disabled={loading.plan || !projectData.description}
            className="px-4 py-2 bg-green-500 text-white rounded disabled:bg-gray-400"
          >
            {loading.plan ? 'Generating...' : 'Generate Project Plan'}
          </button>

          <button
            onClick={generateRequirements}
            disabled={loading.requirements || !projectData.description}
            className="px-4 py-2 bg-yellow-500 text-white rounded disabled:bg-gray-400"
          >
            {loading.requirements ? 'Generating...' : 'Generate Implicit Requirements'}
          </button>

          <button
            onClick={() => navigate(projectId ? `/projects/${projectId}/srs-editor` : '/srs-editor')}
            className="px-4 py-2 bg-purple-500 text-white rounded"
          >
            SRS Editor
          </button>
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