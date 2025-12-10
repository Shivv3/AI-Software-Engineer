  import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import axios from 'axios';
import { useProjectContext } from './ProjectContext';
import './SRSEditor.css';

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
      <div className="srs-editor">
        <div className="workspace-container">
          <div className="srs-editor-header">
            <h1 className="srs-editor-title">SRS Wizard</h1>
            <div className="srs-editor-actions">
              <button
                className="srs-editor-button srs-editor-button-secondary"
                onClick={() => navigate(`/projects/${routeProjectId}/requirements`)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Back to Requirements</span>
              </button>
            </div>
          </div>

          <div className="srs-editor-card">
            <h2 className="srs-editor-card-title">Project Description</h2>
            <p className="srs-editor-card-description">
              Please provide a detailed description of your software project. This will be used to generate targeted questions for each section of the SRS document following IEEE Std 830-1998.
            </p>
            <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: '#94a3b8', marginBottom: '1.5rem', lineHeight: '1.8' }}>
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
              className="srs-editor-textarea"
              style={{ minHeight: '200px' }}
            />

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleGenerateSRS}
                disabled={generateLoading || !projectDescription.trim()}
                className="srs-editor-generate-button"
              >
                {generateLoading ? (
                  <>
                    <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                        <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                      </circle>
                    </svg>
                    <span>Generating Questions...</span>
                  </>
                ) : (
                  <>
                    <span>Generate SRS Questions</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </>
                )}
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
    if (!subsection) return <div className="srs-editor" style={{ padding: '2rem', textAlign: 'center', color: '#f1f5f9' }}>Loading...</div>;

    const answerKey = getAnswerKey(srsStructure[currentSectionIndex].section_id, subsection.subsection_id);
    const subsectionAnswers = answers[answerKey] || {};

    return (
      <div className="srs-editor">
        <div className="workspace-container">
          <div className="srs-editor-header">
            <h1 className="srs-editor-title">SRS Question & Answer</h1>
            <div className="srs-editor-actions">
              <button
                className="srs-editor-button srs-editor-button-secondary"
                onClick={() => setCurrentStep('description')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Back to Description</span>
              </button>
              {savedSections.length > 0 && (
                <>
                  <button
                    className="srs-editor-button srs-editor-button-primary"
                    onClick={() => setCurrentStep('progress')}
                  >
                    <span>View Progress</span>
                  </button>
                  <button
                    className="srs-editor-button srs-editor-button-primary"
                    onClick={() => setCurrentStep('review')}
                  >
                    <span>Final Review</span>
                  </button>
                </>
              )}
              {savedSections.length > 0 && (
                <button
                  className="srs-editor-button srs-editor-button-primary"
                  onClick={handleExportSRS}
                  disabled={exportLoading}
                >
                  {exportLoading ? (
                    <>
                      <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                          <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                        </circle>
                      </svg>
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <span>Export DOCX</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="srs-editor-progress">
            <div className="srs-editor-progress-header">
              <span>Progress: {getProgressPercentage()}% Complete</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span>{savedSections.length} / {srsStructure.reduce((total, section) => total + section.subsections.length, 0)} sections</span>
                {savedSections.length > 0 && (
                  <span style={{ padding: '0.25rem 0.625rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '50px', fontSize: '0.75rem', color: '#6ee7b7' }}>
                    Document Available
                  </span>
                )}
              </div>
            </div>
            <div className="srs-editor-progress-bar">
              <div 
                className="srs-editor-progress-fill" 
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>
          </div>

          <div className="srs-editor-grid">
            {/* Questions Panel */}
            <div className="srs-editor-questions-panel">
              <div className="srs-editor-section-info">
                <h2 className="srs-editor-section-title">
                  {srsStructure[currentSectionIndex].section_title}
                </h2>
                <h3 className="srs-editor-subsection-title">
                  {subsection.subsection_title}
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {subsection.questions.map((question, index) => (
                  <div key={index} className="srs-editor-question-item">
                    <label className="srs-editor-question-label">
                      Question {index + 1}:
                    </label>
                    <p className="srs-editor-question-text">{question}</p>
                    <textarea
                      value={subsectionAnswers[index] || ''}
                      onChange={(e) => handleAnswerChange(index, e.target.value)}
                      placeholder="Enter your answer here..."
                      className="srs-editor-answer-textarea"
                    />
                  </div>
                ))}
              </div>

              <div className="srs-editor-actions-bottom">
                <button
                  className="srs-editor-nav-button"
                  onClick={handlePreviousSubsection}
                  disabled={currentSectionIndex === 0 && currentSubsectionIndex === 0}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Previous</span>
                </button>
                
                <button
                  className="srs-editor-generate-button"
                  onClick={handleGenerateContent}
                  disabled={!isSubsectionComplete() || contentLoading}
                >
                  {contentLoading ? (
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
                      <span>Generate Content</span>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Content Preview Panel */}
            <div className="srs-editor-sidebar">
              <div className="srs-editor-preview-card">
                <h3 className="srs-editor-preview-title">Generated Content</h3>
                
                {generatedContent ? (
                  <div>
                    <div className="srs-editor-preview-content">
                      {generatedContent}
                    </div>
                    
                    <div className="srs-editor-preview-actions">
                      <button
                        className="srs-editor-accept-button"
                        onClick={handleSaveContent}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M13.5 2L6 9.5L2.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>Accept & Continue</span>
                      </button>
                      <button
                        className="srs-editor-regenerate-button"
                        onClick={() => setGeneratedContent('')}
                      >
                        <span>Regenerate</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="srs-editor-preview-placeholder">
                    {contentLoading ? 'Generating content...' : 'Answer all questions to generate content'}
                  </p>
                )}
              </div>

              {/* Quick Actions */}
              {savedSections.length > 0 && (
                <div className="srs-editor-preview-card" style={{ marginTop: '1.5rem' }}>
                  <h3 className="srs-editor-preview-title">Quick Actions</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button
                      className="srs-editor-button srs-editor-button-primary"
                      onClick={() => setCurrentStep('progress')}
                      style={{ fontSize: '0.875rem', padding: '0.625rem 1rem' }}
                    >
                      <span>📊 View Progress & Document</span>
                    </button>
                    <button
                      className="srs-editor-button srs-editor-button-primary"
                      onClick={handleExportSRS}
                      disabled={exportLoading}
                      style={{ fontSize: '0.875rem', padding: '0.625rem 1rem' }}
                    >
                      {exportLoading ? (
                        <>
                          <svg className="spinner" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                              <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                            </circle>
                          </svg>
                          <span>Exporting...</span>
                        </>
                      ) : (
                        <span>💾 Quick Export</span>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Section Navigation */}
              <div className="srs-editor-navigation-card" style={{ marginTop: '1.5rem' }}>
                <h3 className="srs-editor-nav-title">Section Navigation</h3>
                <div className="srs-editor-nav-list">
                  {srsStructure.map((section, sectionIndex) => (
                    <div key={section.section_id} className="srs-editor-nav-section">
                      <div className="srs-editor-nav-section-title">{section.section_title}</div>
                      {section.subsections.map((subsec, subsecIndex) => {
                        const isCurrentSubsection = sectionIndex === currentSectionIndex && subsecIndex === currentSubsectionIndex;
                        const sectionKey = `${section.section_id.replace(/\./g, '_')}_${subsec.subsection_id.replace(/\./g, '_')}`;
                        const isSaved = savedSections.includes(sectionKey);
                        
                        return (
                          <div
                            key={subsec.subsection_id}
                            className={`srs-editor-nav-item ${isCurrentSubsection ? 'current' : ''} ${isSaved ? 'completed' : ''}`}
                            onClick={() => {
                              setCurrentSectionIndex(sectionIndex);
                              setCurrentSubsectionIndex(subsecIndex);
                              setGeneratedContent('');
                            }}
                          >
                            {subsec.subsection_title}
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
      <div className="srs-editor">
        <div className="workspace-container">
          <div className="srs-editor-header">
            <h1 className="srs-editor-title">SRS Progress View</h1>
            <div className="srs-editor-actions">
              <button
                className="srs-editor-button srs-editor-button-primary"
                onClick={() => setCurrentStep('questions')}
              >
                <span>Continue Questions</span>
              </button>
              <button
                className="srs-editor-button srs-editor-button-primary"
                onClick={() => setCurrentStep('review')}
              >
                <span>Final Review</span>
              </button>
              <button
                className="srs-editor-button srs-editor-button-primary"
                onClick={handleExportSRS}
                disabled={exportLoading || !savedSections.length}
              >
                {exportLoading ? (
                  <>
                    <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                        <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                      </circle>
                    </svg>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <span>Export Current SRS</span>
                )}
              </button>
              <button
                className="srs-editor-button srs-editor-button-primary"
                onClick={handleSaveFinalToSidebar}
                disabled={!finalSrsContent}
              >
                Save to sidebar
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '1.5rem' }}>
            {/* Progress Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="srs-editor-card">
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f1f5f9', margin: '0 0 1rem 0' }}>Progress Overview</h3>
                
                {srsStatus && (
                  <>
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                        <span>Completion</span>
                        <span>{srsStatus.completionPercentage}%</span>
                      </div>
                      <div className="srs-editor-progress-bar">
                        <div 
                          className="srs-editor-progress-fill" 
                          style={{ width: `${srsStatus.completionPercentage}%`, background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)' }}
                        ></div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Completed Sections:</span>
                        <span style={{ fontWeight: 500, color: '#f1f5f9' }}>{srsStatus.completedSections}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Sections:</span>
                        <span style={{ fontWeight: 500, color: '#f1f5f9' }}>{srsStatus.totalSections}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Remaining:</span>
                        <span style={{ fontWeight: 500, color: '#f1f5f9' }}>{srsStatus.totalSections - srsStatus.completedSections}</span>
                      </div>
                    </div>

                    <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '0.5rem' }}>
                      <p style={{ fontSize: '0.875rem', color: '#93c5fd', margin: 0 }}>
                        {srsStatus.completionPercentage === 100 
                          ? '🎉 SRS Complete! Ready for final review.' 
                          : `📝 ${srsStatus.totalSections - srsStatus.completedSections} sections remaining`}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Section Status */}
              <div className="srs-editor-card">
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f1f5f9', margin: '0 0 1rem 0' }}>Section Status</h3>
                <div className="srs-editor-nav-list">
                  {srsStructure.map((section, sectionIndex) => (
                    <div key={section.section_id} className="srs-editor-nav-section">
                      <div className="srs-editor-nav-section-title">{section.section_title}</div>
                      {section.subsections.map((subsec, subsecIndex) => {
                        const sectionKey = `${section.section_id.replace(/\./g, '_')}_${subsec.subsection_id.replace(/\./g, '_')}`;
                        const isSaved = savedSections.includes(sectionKey);
                        const isCurrentSubsection = sectionIndex === currentSectionIndex && subsecIndex === currentSubsectionIndex;
                        
                        return (
                          <div
                            key={subsec.subsection_id}
                            className={`srs-editor-nav-item ${isCurrentSubsection ? 'current' : ''} ${isSaved ? 'completed' : ''}`}
                            style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}
                          >
                            {subsec.subsection_title}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Document Preview */}
            <div>
              <div className="srs-editor-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>Current SRS Document</h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="srs-editor-button srs-editor-button-secondary"
                      onClick={() => loadSrsStatus()}
                      style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem' }}
                    >
                      <span>Refresh</span>
                    </button>
                    <button
                      className="srs-editor-button srs-editor-button-primary"
                      onClick={handleExportSRS}
                      disabled={exportLoading || !savedSections.length}
                      style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem' }}
                    >
                      {exportLoading ? (
                        <>
                          <svg className="spinner" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                              <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                            </circle>
                          </svg>
                          <span>Exporting...</span>
                        </>
                      ) : (
                        <span>Download DOCX</span>
                      )}
                    </button>
                  </div>
                </div>

                {finalSrsContent ? (
                  <div style={{ border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '0.75rem', overflow: 'hidden' }}>
                    <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '0.75rem 1rem', borderBottom: '1px solid rgba(148, 163, 184, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1' }}>Document Preview</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Last updated: {new Date().toLocaleString()}
                      </span>
                    </div>
                    <div style={{ padding: '1.5rem', maxHeight: '600px', overflowY: 'auto', background: 'rgba(30, 41, 59, 0.2)' }}>
                      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.875rem', lineHeight: '1.6', color: '#e2e8f0', margin: 0 }}>
                        {finalSrsContent}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem', border: '2px dashed rgba(148, 163, 184, 0.2)', borderRadius: '0.75rem' }}>
                    <div className="spinner" style={{ width: '2rem', height: '2rem', border: '2px solid rgba(102, 126, 234, 0.3)', borderTopColor: '#667eea', borderRadius: '50%', margin: '0 auto 1rem' }}></div>
                    <p style={{ color: '#94a3b8' }}>Loading document preview...</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="srs-editor-card" style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f1f5f9', margin: '0 0 1rem 0' }}>Quick Actions</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button
                className="srs-editor-button srs-editor-button-primary"
                onClick={() => setCurrentStep('questions')}
              >
                <span>📝 Continue Editing</span>
              </button>
              <button
                className="srs-editor-button srs-editor-button-primary"
                onClick={() => setCurrentStep('review')}
                disabled={savedSections.length === 0}
              >
                <span>👀 Final Review</span>
              </button>
              <button
                className="srs-editor-button srs-editor-button-primary"
                onClick={handleExportSRS}
                disabled={exportLoading || !savedSections.length}
              >
                {exportLoading ? (
                  <>
                    <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                        <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                      </circle>
                    </svg>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <span>💾 Export Document</span>
                )}
              </button>
              <button
                className="srs-editor-button srs-editor-button-primary"
                onClick={handleSaveFinalToSidebar}
                disabled={!finalSrsContent}
              >
                <span>📁 Save to sidebar</span>
              </button>
              <button
                className="srs-editor-button srs-editor-button-secondary"
                onClick={() => setCurrentStep('description')}
              >
                <span>🏠 Start New SRS</span>
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
      <div className="srs-editor">
        <div className="workspace-container">
          <div className="srs-editor-header">
            <h1 className="srs-editor-title">SRS Document Review</h1>
            <div className="srs-editor-actions">
              <button
                className="srs-editor-button srs-editor-button-primary"
                onClick={() => setCurrentStep('progress')}
              >
                <span>View Progress</span>
              </button>
              <button
                className="srs-editor-button srs-editor-button-secondary"
                onClick={() => setCurrentStep('questions')}
              >
                <span>Back to Questions</span>
              </button>
              <button
                className="srs-editor-button srs-editor-button-primary"
                onClick={handleExportSRS}
                disabled={!finalSrsContent || exportLoading}
              >
                {exportLoading ? (
                  <>
                    <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                        <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                      </circle>
                    </svg>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <span>Export to DOCX</span>
                )}
              </button>
              <button
                className="srs-editor-button srs-editor-button-primary"
                onClick={handleSaveFinalToSidebar}
                disabled={!finalSrsContent}
              >
                <span>Save to sidebar</span>
              </button>
            </div>
          </div>

          <div className="srs-editor-card">
            <div style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f1f5f9', margin: '0 0 0.5rem 0' }}>Complete SRS Document</h2>
              <p style={{ fontSize: '0.9375rem', color: '#94a3b8', margin: 0 }}>
                Review the complete Software Requirements Specification document generated from your inputs.
              </p>
            </div>

            {finalSrsContent ? (
              <div style={{ border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '0.75rem', padding: '1.5rem', maxHeight: '600px', overflowY: 'auto', background: 'rgba(30, 41, 59, 0.2)' }}>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#e2e8f0', lineHeight: '1.6', margin: 0 }}>{finalSrsContent}</pre>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <div className="spinner" style={{ width: '3rem', height: '3rem', border: '2px solid rgba(102, 126, 234, 0.3)', borderTopColor: '#667eea', borderRadius: '50%', margin: '0 auto 1rem' }}></div>
                <p style={{ color: '#94a3b8' }}>Generating final SRS document...</p>
              </div>
            )}

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                Progress: {getProgressPercentage()}% Complete ({savedSections.length} sections saved)
              </div>
              {getProgressPercentage() < 100 && (
                <button
                  className="srs-editor-button srs-editor-button-primary"
                  onClick={() => setCurrentStep('questions')}
                >
                  <span>Continue Adding Sections</span>
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