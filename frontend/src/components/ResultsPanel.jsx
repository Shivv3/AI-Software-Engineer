import { useState } from 'react';

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
    <div className="mt-8">
      {sdlcRecommendation && (
        <div className="mb-8 p-4 border rounded">
          <h2 className="text-xl font-bold mb-4">SDLC Recommendation</h2>
          <div className="mb-4">
            <p className="font-semibold">Model: {sdlcRecommendation.model}</p>
            <p className="mt-2"><span className="font-semibold">Why:</span> {sdlcRecommendation.why}</p>
            {sdlcRecommendation.when_not_to_use && (
              <p className="mt-2"><span className="font-semibold">When not to use:</span> {sdlcRecommendation.when_not_to_use}</p>
            )}
            <p className="mt-2">
              <span className="font-semibold">Confidence:</span>{' '}
              {(sdlcRecommendation.confidence * 100).toFixed(1)}%
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="px-3 py-2 bg-blue-500 text-white rounded text-sm" onClick={onSaveSDLC}>
              Save to sidebar
            </button>
            <button className="px-3 py-2 bg-gray-200 text-sm rounded" onClick={onDownloadSDLC}>
              Download
            </button>
          </div>
        </div>
      )}

      {projectPlan && (
        <div className="p-4 border rounded mb-8">
          <h2 className="text-xl font-bold mb-4">Project Plan</h2>
          
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-3">Milestones</h3>
            <div className="space-y-4">
              {projectPlan.map((milestone, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded">
                  <h4 className="font-semibold">{milestone.title}</h4>
                  <p className="text-sm text-gray-600">Duration: {milestone.duration_weeks} weeks</p>
                  <div className="mt-2">
                    <p className="text-sm font-medium">Deliverables:</p>
                    <ul className="list-disc list-inside text-sm">
                      {milestone.deliverables.map((deliverable, i) => (
                        <li key={i}>{deliverable}</li>
                      ))}
                    </ul>
                  </div>
                  {milestone.roles_required && (
                    <div className="mt-2">
                      <p className="text-sm font-medium">Roles Required:</p>
                      <ul className="list-disc list-inside text-sm">
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
          <div className="flex gap-2 flex-wrap">
            <button className="px-3 py-2 bg-blue-500 text-white rounded text-sm" onClick={onSavePlan}>
              Save to sidebar
            </button>
            <button className="px-3 py-2 bg-gray-200 text-sm rounded" onClick={onDownloadPlan}>
              Download
            </button>
          </div>
        </div>
      )}

      {implicitRequirements && (
        <div className="p-4 border rounded">
          <h2 className="text-xl font-bold mb-4">Implicit Requirements</h2>
          <div className="space-y-4">
            {implicitRequirements.map((req, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{req.title}</h4>
                    <div className="flex gap-2 mt-1">
                      <span className={`text-xs px-2 py-1 rounded ${
                        req.type === 'FR' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {req.type}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        {
                          high: 'bg-red-100 text-red-800',
                          medium: 'bg-yellow-100 text-yellow-800',
                          low: 'bg-gray-100 text-gray-800'
                        }[req.priority]
                      }`}>
                        {req.priority}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddToSRS(req)}
                    disabled={addedRequirements.has(req.title)}
                    className="px-3 py-1 text-sm bg-purple-500 text-white rounded disabled:bg-gray-300"
                  >
                    {addedRequirements.has(req.title) ? 'Added' : 'Add to SRS'}
                  </button>
                </div>
                <p className="mt-2 text-sm">{req.description}</p>
                <p className="mt-1 text-sm text-gray-600">
                  <span className="font-medium">Rationale:</span> {req.rationale}
                </p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap mt-3">
            <button className="px-3 py-2 bg-blue-500 text-white rounded text-sm" onClick={onSaveImplicit}>
              Save to sidebar
            </button>
            <button className="px-3 py-2 bg-gray-200 text-sm rounded" onClick={onDownloadImplicit}>
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}