import { useState } from 'react';
import axios from 'axios';
import ResultsPanel from './ResultsPanel';

export default function HomePage() {
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
        project_text: projectData.description,
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
        project_text: projectData.description,
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
        project_text: projectData.description,
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

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Project Analysis Tool</h1>
      
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
            onClick={() => window.location.href = '/srs-editor'}
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
        />
      )}
    </div>
  );
}