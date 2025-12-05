import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import axios from 'axios';
import { useProjectContext } from './ProjectContext';

const SECTION_MAPPING = {
  '1_introduction': 'Introduction',
  '2_overall_description': 'Overall Description', 
  '3_specific_requirements': 'Specific Requirements'
};

export default function SRSEditor() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams();
  const { addDocument, projectName } = useProjectContext();
  const [currentStep, setCurrentStep] = useState('description'); // 'description', 'questions', 'review', 'progress'
  const [projectDescription, setProjectDescription] = useState('');
  const [generateLoading, setGenerateLoading] = useState(false);
  const [projectId, setProjectId] = useState(null);
  
  // Questions and answers state
  const [srsStructure, setSrsStructure] = useState([]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentSubsectionIndex, setCurrentSubsectionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  
  // Content generation state
  const [generatedContent, setGeneratedContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [savedSections, setSavedSections] = useState([]);
  const [finalSrsContent, setFinalSrsContent] = useState('');
  
  // Progress tracking state
  const [srsStatus, setSrsStatus] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const handleSaveFinalToSidebar = async () => {
    if (!routeProjectId) {
      alert('Open or create a project to save documents.');
      return;
    }
    if (!finalSrsContent.trim()) {
      alert('Generate SRS content first.');
      return;
    }
    await addDocument({
      name: `${projectName || 'Project'} - SRS`,
      type: 'SRS',
      mime: 'text/plain',
      content: finalSrsContent,
      source: 'generated',
      useAsContext: true,
    });
    setSaveMessage('Saved SRS to sidebar.');
    setTimeout(() => setSaveMessage(''), 2000);
  };

  const handleGenerateSRS = async () => {
    if (!projectDescription.trim()) {
      alert('Please enter a project description');
      return;
    }

    try {
      setGenerateLoading(true);
      
      // Create project
      const projectRes = await axios.post('/api/project', {
        title: 'SRS Project',
        project_text: projectDescription
      });
      
      setProjectId(projectRes.data.id);
      
      // Generate questions
      const questionsRes = await axios.post('/api/srs/generate-questions', {
        project_description: projectDescription
      });
      
      setSrsStructure(questionsRes.data.sections);
      setCurrentStep('questions');
      
    } catch (error) {
      console.error('Error generating SRS questions:', error);
      alert('Failed to generate SRS questions');
    } finally {
      setGenerateLoading(false);
    }
  };

  const getCurrentSubsection = () => {
    if (!srsStructure[currentSectionIndex] || !srsStructure[currentSectionIndex].subsections[currentSubsectionIndex]) {
      return null;
    }
    return srsStructure[currentSectionIndex].subsections[currentSubsectionIndex];
  };

  const getAnswerKey = (sectionId, subsectionId) => {
    return `${sectionId.replace(/\./g, '_')}_${subsectionId.replace(/\./g, '_')}`;
  };

  const handleAnswerChange = (questionIndex, answer) => {
    const subsection = getCurrentSubsection();
    if (!subsection) return;

    const answerKey = getAnswerKey(srsStructure[currentSectionIndex].section_id, subsection.subsection_id);
    
    setAnswers(prev => ({
      ...prev,
      [answerKey]: {
        ...prev[answerKey],
        [questionIndex]: answer
      }
    }));
  };

  const isSubsectionComplete = () => {
    const subsection = getCurrentSubsection();
    if (!subsection) return false;

    const answerKey = getAnswerKey(srsStructure[currentSectionIndex].section_id, subsection.subsection_id);
    const subsectionAnswers = answers[answerKey] || {};
    
    return subsection.questions.every((_, index) => 
      subsectionAnswers[index] && subsectionAnswers[index].trim().length > 0
    );
  };

  const handleGenerateContent = async () => {
    const subsection = getCurrentSubsection();
    if (!subsection || !isSubsectionComplete()) return;

    try {
      setContentLoading(true);
      
      const answerKey = getAnswerKey(srsStructure[currentSectionIndex].section_id, subsection.subsection_id);
      const subsectionAnswers = answers[answerKey] || {};
      
      const qaPairs = subsection.questions.map((question, index) => ({
        question,
        answer: subsectionAnswers[index] || ''
      }));

      const response = await axios.post('/api/srs/generate-content', {
        section_title: srsStructure[currentSectionIndex].section_title,
        subsection_title: subsection.subsection_title,
        qa_pairs: qaPairs
      });

      setGeneratedContent(response.data.content);
    } catch (error) {
      console.error('Error generating content:', error);
      alert('Failed to generate content');
    } finally {
      setContentLoading(false);
    }
  };

  const handleSaveContent = async () => {
    const subsection = getCurrentSubsection();
    if (!subsection || !generatedContent) return;

    try {
      const saveData = {
        project_id: projectId,
        section_id: srsStructure[currentSectionIndex].section_id.replace(/\./g, '_'),
        subsection_id: subsection.subsection_id.replace(/\./g, '_'),
        content: generatedContent,
        status: 'approved'
      };
      
      await axios.post('/api/srs/save-section', saveData);

      const sectionKey = `${srsStructure[currentSectionIndex].section_id.replace(/\./g, '_')}_${subsection.subsection_id.replace(/\./g, '_')}`;
      setSavedSections(prev => [...prev.filter(s => s !== sectionKey), sectionKey]);
      
      // Immediately refresh the SRS document to show the new content
      await loadSrsStatus();
      
      // Move to next subsection
      handleNextSubsection();
      setGeneratedContent('');
      

    } catch (error) {
      console.error('Error saving content:', error);
      alert('Failed to save content');
    }
  };

  const handleNextSubsection = () => {
    const section = srsStructure[currentSectionIndex];
    
    if (currentSubsectionIndex < section.subsections.length - 1) {
      setCurrentSubsectionIndex(prev => prev + 1);
    } else if (currentSectionIndex < srsStructure.length - 1) {
      setCurrentSectionIndex(prev => prev + 1);
      setCurrentSubsectionIndex(0);
    } else {
      // All sections complete
      setCurrentStep('review');
      generateFinalSRS();
    }
  };

  const handlePreviousSubsection = () => {
    if (currentSubsectionIndex > 0) {
      setCurrentSubsectionIndex(prev => prev - 1);
    } else if (currentSectionIndex > 0) {
      setCurrentSectionIndex(prev => prev - 1);
      setCurrentSubsectionIndex(srsStructure[currentSectionIndex - 1].subsections.length - 1);
    }
  };

  const generateFinalSRS = async () => {
    try {
      const response = await axios.post(`/api/srs/generate-final/${projectId}`);
      setFinalSrsContent(response.data.content);
      setSrsStatus(prev => ({
        ...prev,
        completedSections: response.data.completedSections,
        totalSections: response.data.totalSections
      }));
    } catch (error) {
      console.error('Error generating final SRS:', error);
      alert('Failed to generate final SRS');
    }
  };

  const loadSrsStatus = async () => {
    if (!projectId) return;
    
    try {
      const response = await axios.get(`/api/srs/status/${projectId}`);
      setSrsStatus(response.data);
      
      // Also generate current SRS content
      const srsResponse = await axios.post(`/api/srs/generate-final/${projectId}`);
      setFinalSrsContent(srsResponse.data.content);
    } catch (error) {
      console.error('Error loading SRS status:', error);
    }
  };

  const handleExportSRS = async () => {
    if (!projectId) return;
    
    try {
      setExportLoading(true);
      
      // First generate/update the current SRS content
      await generateFinalSRS();
      
      // Then export it
      const response = await axios.post(`/api/project/${projectId}/export`, {}, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `SRS-${new Date().toISOString().split('T')[0]}.docx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      console.error('Error exporting SRS:', error);
      alert('Failed to export SRS');
    } finally {
      setExportLoading(false);
    }
  };

  // Load SRS status when projectId changes
  useEffect(() => {
    if (projectId && (currentStep === 'questions' || currentStep === 'progress' || currentStep === 'review')) {
      loadSrsStatus();
    }
  }, [projectId, savedSections.length]);

  const getProgressPercentage = () => {
    if (!srsStructure.length) return 0;
    
    const totalSubsections = srsStructure.reduce((total, section) => 
      total + section.subsections.length, 0);
    
    return Math.round((savedSections.length / totalSubsections) * 100);
  };

  // Wizard Step - Project Description
  if (currentStep === 'description') {
    return (
      <div className="container mx-auto p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">SRS Wizard</h1>
            <button
              onClick={() => navigate(`/projects/${routeProjectId}/requirements`)}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Back to Requirements
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Project Description</h2>
            <p className="text-gray-600 mb-4">
              Please provide a detailed description of your software project. This will be used to generate targeted questions for each section of the SRS document following IEEE Std 830-1998.
            </p>
            <ul className="list-disc list-inside text-gray-600 mb-6 space-y-1">
              <li>Project objectives and goals</li>
              <li>Target users and stakeholders</li>
              <li>Key features and functionality</li>
              <li>Technical requirements and constraints</li>
              <li>Any specific business requirements</li>
            </ul>

            <textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="Enter your detailed project description here..."
              className="w-full h-64 p-4 border border-gray-300 rounded-lg resize-vertical focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleGenerateSRS}
                disabled={generateLoading || !projectDescription.trim()}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {generateLoading ? 'Generating Questions...' : 'Generate SRS Questions'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Questions Step
  if (currentStep === 'questions') {
    const subsection = getCurrentSubsection();
    if (!subsection) return <div>Loading...</div>;

    const answerKey = getAnswerKey(srsStructure[currentSectionIndex].section_id, subsection.subsection_id);
    const subsectionAnswers = answers[answerKey] || {};

    return (
      <div className="container mx-auto p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">SRS Question & Answer</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentStep('description')}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Back to Description
              </button>
              {savedSections.length > 0 && (
                <>
                  <button
                    onClick={() => setCurrentStep('progress')}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    View Progress
                  </button>
                  <button
                    onClick={() => setCurrentStep('review')}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Final Review
                  </button>
                </>
              )}
              {savedSections.length > 0 && (
                <button
                  onClick={handleExportSRS}
                  disabled={exportLoading}
                  className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400"
                >
                  {exportLoading ? 'Exporting...' : 'Export DOCX'}
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between items-center text-sm text-gray-600 mb-2">
              <span>Progress: {getProgressPercentage()}% Complete</span>
              <div className="flex items-center gap-4">
                <span>{savedSections.length} / {srsStructure.reduce((total, section) => total + section.subsections.length, 0)} sections</span>
                {savedSections.length > 0 && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                    Document Available
                  </span>
                )}
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Questions Panel */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="mb-4">
                  <h2 className="text-xl font-semibold">
                    {srsStructure[currentSectionIndex].section_title}
                  </h2>
                  <h3 className="text-lg text-gray-600">
                    {subsection.subsection_title}
                  </h3>
                </div>

                <div className="space-y-6">
                  {subsection.questions.map((question, index) => (
                    <div key={index} className="border-l-4 border-blue-500 pl-4">
                      <label className="block text-sm font-medium mb-2">
                        Question {index + 1}:
                      </label>
                      <p className="text-gray-700 mb-3">{question}</p>
                      <textarea
                        value={subsectionAnswers[index] || ''}
                        onChange={(e) => handleAnswerChange(index, e.target.value)}
                        placeholder="Enter your answer here..."
                        className="w-full h-24 p-3 border border-gray-300 rounded-lg resize-vertical focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex justify-between">
                  <button
                    onClick={handlePreviousSubsection}
                    disabled={currentSectionIndex === 0 && currentSubsectionIndex === 0}
                    className="px-4 py-2 bg-gray-500 text-white rounded disabled:bg-gray-300"
                  >
                    Previous
                  </button>
                  
                  <button
                    onClick={handleGenerateContent}
                    disabled={!isSubsectionComplete() || contentLoading}
                    className="px-6 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
                  >
                    {contentLoading ? 'Generating...' : 'Generate Content'}
                  </button>
                </div>
              </div>
            </div>

            {/* Content Preview Panel */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Generated Content</h3>
                
                {generatedContent ? (
                  <div>
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg max-h-96 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm">{generatedContent}</pre>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveContent}
                        className="px-4 py-2 bg-green-500 text-white rounded flex-1"
                      >
                        Accept & Continue
                      </button>
                      <button
                        onClick={() => setGeneratedContent('')}
                        className="px-4 py-2 bg-yellow-500 text-white rounded"
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">
                    {contentLoading ? 'Generating content...' : 'Answer all questions to generate content'}
                  </p>
                )}
              </div>

              {/* Quick Actions */}
              {savedSections.length > 0 && (
                <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setCurrentStep('progress')}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    >
                      📊 View Progress & Document
                    </button>
                    <button
                      onClick={handleExportSRS}
                      disabled={exportLoading}
                      className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm disabled:bg-gray-400"
                    >
                      💾 {exportLoading ? 'Exporting...' : 'Quick Export'}
                    </button>
                  </div>
                </div>
              )}

              {/* Section Navigation */}
              <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Section Navigation</h3>
                <div className="space-y-2">
                  {srsStructure.map((section, sectionIndex) => (
                    <div key={section.section_id}>
                      <div className="font-medium text-gray-700">{section.section_title}</div>
                      {section.subsections.map((subsec, subsecIndex) => {
                        const isCurrentSubsection = sectionIndex === currentSectionIndex && subsecIndex === currentSubsectionIndex;
                        const sectionKey = `${section.section_id.replace(/\./g, '_')}_${subsec.subsection_id.replace(/\./g, '_')}`;
                        const isSaved = savedSections.includes(sectionKey);
                        
                        return (
                          <div
                            key={subsec.subsection_id}
                            className={`ml-4 p-2 rounded cursor-pointer text-sm ${
                              isCurrentSubsection 
                                ? 'bg-blue-100 text-blue-800' 
                                : isSaved 
                                  ? 'bg-green-100 text-green-800'
                                  : 'hover:bg-gray-100'
                            }`}
                            onClick={() => {
                              setCurrentSectionIndex(sectionIndex);
                              setCurrentSubsectionIndex(subsecIndex);
                              setGeneratedContent('');
                            }}
                          >
                            {isSaved ? '✓ ' : ''}{subsec.subsection_title}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Progress View Step
  if (currentStep === 'progress') {
    return (
      <div className="container mx-auto p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">SRS Progress View</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentStep('questions')}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Continue Questions
              </button>
              <button
                onClick={() => setCurrentStep('review')}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Final Review
              </button>
              <button
                onClick={handleExportSRS}
                disabled={exportLoading || !savedSections.length}
                className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400"
              >
                {exportLoading ? 'Exporting...' : 'Export Current SRS'}
              </button>
              <button
                onClick={handleSaveFinalToSidebar}
                disabled={!finalSrsContent}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                Save to sidebar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Progress Stats */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Progress Overview</h3>
                
                {srsStatus && (
                  <>
                    <div className="mb-4">
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Completion</span>
                        <span>{srsStatus.completionPercentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-green-500 h-3 rounded-full transition-all duration-300" 
                          style={{ width: `${srsStatus.completionPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Completed Sections:</span>
                        <span className="font-medium">{srsStatus.completedSections}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Sections:</span>
                        <span className="font-medium">{srsStatus.totalSections}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Remaining:</span>
                        <span className="font-medium">{srsStatus.totalSections - srsStatus.completedSections}</span>
                      </div>
                    </div>

                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-800">
                        {srsStatus.completionPercentage === 100 
                          ? '🎉 SRS Complete! Ready for final review.' 
                          : `📝 ${srsStatus.totalSections - srsStatus.completedSections} sections remaining`}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Section Status */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Section Status</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {srsStructure.map((section, sectionIndex) => (
                    <div key={section.section_id} className="border-l-2 border-gray-200 pl-3">
                      <div className="font-medium text-gray-700 text-sm">{section.section_title}</div>
                      {section.subsections.map((subsec, subsecIndex) => {
                        const sectionKey = `${section.section_id.replace(/\./g, '_')}_${subsec.subsection_id.replace(/\./g, '_')}`;
                        const isSaved = savedSections.includes(sectionKey);
                        const isCurrentSubsection = sectionIndex === currentSectionIndex && subsecIndex === currentSubsectionIndex;
                        
                        return (
                          <div
                            key={subsec.subsection_id}
                            className={`ml-2 p-1 text-xs flex items-center gap-2 ${
                              isSaved ? 'text-green-600' : 'text-gray-500'
                            }`}
                          >
                            {isSaved ? (
                              <span className="text-green-500">✓</span>
                            ) : (
                              <span className="text-gray-400">○</span>
                            )}
                            <span className={isCurrentSubsection ? 'font-medium' : ''}>
                              {subsec.subsection_title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Document Preview */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold">Current SRS Document</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadSrsStatus()}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Refresh
                    </button>
                    <button
                      onClick={handleExportSRS}
                      disabled={exportLoading || !savedSections.length}
                      className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
                    >
                      {exportLoading ? 'Exporting...' : 'Download DOCX'}
                    </button>
                  </div>
                </div>

                {finalSrsContent ? (
                  <div className="border border-gray-300 rounded-lg">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-300 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Document Preview</span>
                      <span className="text-xs text-gray-500">
                        Last updated: {new Date().toLocaleString()}
                      </span>
                    </div>
                    <div className="p-6 max-h-[600px] overflow-y-auto bg-white">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {finalSrsContent}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading document preview...</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setCurrentStep('questions')}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                📝 Continue Editing
              </button>
              <button
                onClick={() => setCurrentStep('review')}
                disabled={savedSections.length === 0}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
              >
                👀 Final Review
              </button>
              <button
                onClick={handleExportSRS}
                disabled={exportLoading || !savedSections.length}
                className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400"
              >
                💾 {exportLoading ? 'Exporting...' : 'Export Document'}
              </button>
              <button
                onClick={handleSaveFinalToSidebar}
                disabled={!finalSrsContent}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                📁 Save to sidebar
              </button>
              <button
                onClick={() => setCurrentStep('description')}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                🏠 Start New SRS
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Review Step
  if (currentStep === 'review') {
    return (
      <div className="container mx-auto p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">SRS Document Review</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentStep('progress')}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                View Progress
              </button>
              <button
                onClick={() => setCurrentStep('questions')}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Back to Questions
              </button>
              <button
                onClick={handleExportSRS}
                disabled={!finalSrsContent || exportLoading}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
              >
                {exportLoading ? 'Exporting...' : 'Export to DOCX'}
              </button>
              <button
                onClick={handleSaveFinalToSidebar}
                disabled={!finalSrsContent}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                Save to sidebar
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Complete SRS Document</h2>
              <p className="text-gray-600">
                Review the complete Software Requirements Specification document generated from your inputs.
              </p>
            </div>

            {finalSrsContent ? (
              <div className="border border-gray-300 rounded-lg p-6 max-h-[600px] overflow-y-auto">
                <pre className="whitespace-pre-wrap font-sans">{finalSrsContent}</pre>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p>Generating final SRS document...</p>
              </div>
            )}

            <div className="mt-6 flex justify-between">
              <div className="text-sm text-gray-600">
                Progress: {getProgressPercentage()}% Complete ({savedSections.length} sections saved)
              </div>
              {getProgressPercentage() < 100 && (
                <button
                  onClick={() => setCurrentStep('questions')}
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Continue Adding Sections
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}