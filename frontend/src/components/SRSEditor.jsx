import { useState, useRef, useEffect } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import axios from 'axios';

const COMMON_PROMPTS = [
  "Improve clarity",
  "Add acceptance criteria",
  "Add security NFR",
  "Make more specific",
  "Add examples",
  "Add constraints"
];

export default function SRSEditor() {
  const [content, setContent] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [instruction, setInstruction] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const quillRef = useRef();

  const handleTextSelection = () => {
    const editor = quillRef.current.getEditor();
    const range = editor.getSelection();
    if (range && range.length > 0) {
      const text = editor.getText(range.index, range.length);
      setSelectedText(text);
    }
  };

  const handleSuggest = async () => {
    if (!selectedText || !instruction) return;

    const editor = quillRef.current.getEditor();
    const range = editor.getSelection();
    const fullContent = editor.getText();

    try {
      setLoading(true);
      const response = await axios.post('/api/srs/edit', {
        project_id: projectId,
        selected_text: selectedText,
        instruction,
        selection_start: range?.index,
        selection_end: range ? range.index + range.length : null,
        full_content: fullContent
      });
      setSuggestion(response.data);
    } catch (error) {
      console.error('Error getting suggestion:', error);
      alert(error.response?.data?.error || 'Failed to get suggestion');
    } finally {
      setLoading(false);
    }
  };

  const loadVersion = async (version) => {
    try {
      const response = await axios.get(`/api/project/${projectId}/version/${version}`);
      setContent(response.data.srs_content);
      setCurrentVersion(version);
    } catch (error) {
      console.error('Error loading version:', error);
      alert('Failed to load version');
    }
  };

  const [versions, setVersions] = useState([]);
  const [currentVersion, setCurrentVersion] = useState(0);
  const projectId = 'p1'; // In real app, get from route or context

  useEffect(() => {
    loadProjectData();
  }, []);

  const loadProjectData = async () => {
    try {
      const [projectRes, versionsRes] = await Promise.all([
        axios.get(`/api/project/${projectId}`),
        axios.get(`/api/project/${projectId}/versions`)
      ]);
      
      setContent(projectRes.data.srs_content || '');
      setVersions(versionsRes.data);
      setCurrentVersion(versionsRes.data.length);
    } catch (error) {
      console.error('Error loading project data:', error);
    }
  };

  const findAllOccurrences = (text, search) => {
    const results = [];
    let index = 0;
    while ((index = text.indexOf(search, index)) !== -1) {
      results.push(index);
      index += 1;
    }
    return results;
  };

  const applySuggestion = async () => {
    const editor = quillRef.current.getEditor();
    const range = editor.getSelection();
    
    if (range && suggestion) {
      try {
        const fullContent = editor.getText();
        const selectedText = fullContent.slice(range.index, range.index + range.length);
        
        // Check for multiple occurrences
        const occurrences = findAllOccurrences(fullContent, selectedText);
        
        if (occurrences.length > 1) {
          const shouldReplace = window.confirm(
            `Found ${occurrences.length} occurrences of the selected text. Replace at current position only?`
          );
          if (!shouldReplace) return;
        }

        // Store current state for undo
        const originalContent = editor.getText();
        
        // Apply the change
        editor.deleteText(range.index, range.length);
        editor.insertText(range.index, suggestion.suggestion_text);
        
        // Get the new content
        const newContent = editor.getText();

        // Save the new version
        await axios.post('/api/srs/apply', {
          project_id: projectId,
          srs_content: newContent,
          prompt_text: instruction,
          suggestion_text: suggestion.suggestion_text,
          selection_start: range.index,
          selection_end: range.index + suggestion.suggestion_text.length,
          original_content: originalContent
        });

        // Refresh versions
        const versionsRes = await axios.get(`/api/project/${projectId}/versions`);
        setVersions(versionsRes.data);
        setCurrentVersion(versionsRes.data.length);

        // Clear UI state
        setSuggestion(null);
        setSelectedText('');
        setInstruction('');
      } catch (error) {
        console.error('Error applying suggestion:', error);
        alert('Failed to save changes');
      }
    }
  };

  const handleUndo = async () => {
    if (currentVersion > 1) {
      try {
        await loadVersion(currentVersion - 1);
      } catch (error) {
        console.error('Error undoing change:', error);
        alert('Failed to undo');
      }
    }
  };

  const handleExport = async () => {
    try {
      const response = await axios.post('/api/project/current/export', {}, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'srs-document.docx');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      console.error('Error exporting document:', error);
      alert('Failed to export document');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">SRS Editor</h1>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          Export to DOCX
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <div className="mb-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold">Version {currentVersion}</h2>
                <button
                  onClick={handleUndo}
                  className="btn btn-secondary"
                  disabled={currentVersion <= 1}
                  title="Undo last change"
                >
                  Undo
                </button>
              </div>
              <div className="flex gap-2">
                {versions.length > 0 && (
                  <button
                    onClick={() => loadVersion(versions[0].version)}
                    className="btn btn-secondary"
                    disabled={currentVersion === versions[0].version}
                  >
                    Latest Version
                  </button>
                )}
              </div>
            </div>
            {suggestion && (
              <div className="mt-2 p-2 bg-yellow-50 rounded text-sm">
                Note: {suggestion.explanation || 'Reviewing suggested changes'}
                {suggestion.confidence && (
                  <div className="mt-1">
                    Confidence: {(suggestion.confidence * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            )}
          </div>
          <ReactQuill
            ref={quillRef}
            value={content}
            onChange={setContent}
            onChangeSelection={handleTextSelection}
            className="h-[600px] mb-12"
          />
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold mb-3">Version History</h3>
            <div className="max-h-[200px] overflow-y-auto">
              {versions.map((ver) => (
                <div
                  key={ver.version}
                  className={`p-2 mb-2 rounded cursor-pointer hover:bg-gray-50 ${
                    currentVersion === ver.version ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => loadVersion(ver.version)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-medium">v{ver.version}</span>
                      <span className="text-sm text-gray-600 ml-2">
                        {new Date(ver.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <span className={`badge ${
                      ver.editor === 'assistant' ? 'badge-purple' : 'badge-blue'
                    }`}>
                      {ver.editor}
                    </span>
                  </div>
                  {ver.prompt_text && (
                    <p className="text-sm text-gray-600 mt-1">{ver.prompt_text}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          {selectedText && (
            <div className="p-4 border rounded bg-white sticky top-4">
              <h3 className="font-semibold mb-2">Edit Selection</h3>
              <p className="text-sm mb-4 bg-gray-50 p-2 rounded">
                {selectedText}
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Common Instructions
                </label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_PROMPTS.map(prompt => (
                    <button
                      key={prompt}
                      onClick={() => setInstruction(prompt)}
                      className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Enter instruction..."
                className="w-full p-2 border rounded mb-2"
              />

              <button
                onClick={handleSuggest}
                disabled={!instruction || loading}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
              >
                {loading ? 'Getting suggestion...' : 'Suggest'}
              </button>
            </div>
          )}

          {suggestion && (
            <div className="p-4 border rounded bg-white mt-4">
              <h3 className="font-semibold mb-2">Suggestion</h3>
              <p className="text-sm mb-2">{suggestion.suggestion_text}</p>
              {suggestion.explanation && (
                <p className="text-xs text-gray-600 mb-2">
                  {suggestion.explanation}
                </p>
              )}
              {suggestion.confidence && (
                <p className="text-xs text-gray-600 mb-4">
                  Confidence: {(suggestion.confidence * 100).toFixed(1)}%
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={applySuggestion}
                  className="px-4 py-2 bg-green-500 text-white rounded"
                >
                  Apply
                </button>
                <button
                  onClick={() => setSuggestion(null)}
                  className="px-4 py-2 bg-gray-500 text-white rounded"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}