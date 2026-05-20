# Implementation Plan: NLP Requirements Quality Analyzer
## Feature M2 — First Complete ML/NLP Integration

**Generated:** 2026-05-21 | Branch: main | Repo: AI-Software-Engineer

---

## Context

BTech students write bad requirements. "The system should be fast." "The app should be secure." "It must be easy to use." These sentences have no measurable criteria, no clear actor, no numeric threshold. When they reach Implementation Lab, they have nothing concrete to build from.

The existing SRS Editor generates a full IEEE-structured SRS document and stores it in `projects.srs_content`. But after generation, there's zero feedback on quality. Students submit vague requirements and wonder why their projects fail.

This feature adds an NLP pipeline that analyzes each requirement sentence and returns a quality score (0–100) with specific actionable issues. The Gemini API (already in backend) explains each issue in plain English. A badge overlay on the SRS Editor shows per-requirement health at a glance.

This is the first feature in a 6-milestone ML/NLP research layer. All other features (defect predictor, traceability, readiness scorer) build on this foundation.

---

## Milestone Map

| # | Feature | What it enables | Est. |
|---|---------|-----------------|------|
| **M1** | FastAPI foundation + `/ml/static/analyze` (radon) | Defect predictor input | 2h |
| **M2 (THIS PLAN)** | NLP Requirements Quality Analyzer | SRS quality badges | 4h |
| M3 | ML Defect Risk Predictor (PROMISE dataset + SHAP) | ImplementationLab heatmap | 6h |
| M4 | SBERT Traceability Matrix | Req→code coverage overlay | 4h |
| M5 | Phase Readiness Scorer (rule-based, no model) | Gate dashboard | 3h |
| M6 | SDLC Analytics Dashboard (Recharts) | Research evaluation UI | 4h |

M1 is included in this plan as the foundation M2 requires. Both ship together.

---

## Real Problem Solved

**Root cause:** SRS Editor produces text but gives zero quality signal. Students move from vague requirements to design without knowing their SRS is broken.

**Specific failures this catches (with NLP):**
- **Vague terms:** "fast", "easy", "secure", "reliable" — no measurable threshold
- **Missing actor:** No subject in the sentence ("Shall process payments" — who?)
- **Ambiguous pronoun:** "It should handle errors" — what is "it"?
- **Passive without agent:** "Data will be encrypted" — by what? how?
- **Quality term without metric:** "The system must have high availability" — no percentage target

**Score impact per issue:**
- vague_term: -15 points each
- missing_actor: -20 points
- missing_action: -25 points
- ambiguous_pronoun: -12 points
- passive_without_actor: -8 points
- missing_measurable: -18 points

**Label mapping:** ≥80 = good (green), 50–79 = moderate (yellow), <50 = poor (red)

---

## Architecture

```
SRS Editor (React)
  └── "Analyze Quality" button
        ↓ POST /api/ml/requirements/analyze (requireAuth)
Node.js server.js (port 4000)
  ├── Validates session (requireAuth)
  ├── Extracts requirement sentences from SRS text
  ├── Forwards to Python ML service (port 5001)
  │     └── spaCy NLP pipeline → per-sentence scores + raw issues
  ├── For flagged sentences (score < 80): calls Gemini to generate
  │     plain-English explanation (D6: Python has zero API keys)
  ├── Saves result to ml_results table (D2)
  ├── Returns enriched response (scores + Gemini explanations)
  └── 503 fallback: returns last cached result from in-memory Map (OV7)
Python FastAPI (port 5001, binds to 127.0.0.1 only)
  └── /ml/requirements/analyze
        └── spaCy en_core_web_sm → rule-based detection → score
```

---

## Files to Create or Modify

### New Files

| File | Purpose |
|------|---------|
| `ml-service/requirements.txt` | fastapi, uvicorn, spacy, pydantic |
| `ml-service/schemas.py` | Pydantic request/response models |
| `ml-service/nlp/requirements_analyzer.py` | spaCy pipeline + scoring logic |
| `ml-service/main.py` | FastAPI app with lifespan model loading |
| `scripts/download_models.sh` | Idempotent spaCy model download |

### Modified Files

| File | What changes |
|------|-------------|
| `backend/server.js` | Add `ml_results` table, `/api/ml/requirements/analyze` route, health-check poll, in-memory fallback cache |
| `frontend/src/components/SRSEditor.jsx` | Add "Analyze Quality" button (review step only), quality badge overlay per sentence |
| `frontend/src/components/SRSEditor.css` | Badge styles (green/yellow/red) |

---

## Detailed Implementation

### STEP 1 — ml-service/requirements.txt

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
pydantic==2.9.2
spacy==3.7.6
```

Do NOT include sentence-transformers, shap, scikit-learn, or radon here — those belong in M3/M4. Keep this file minimal for M1+M2.

---

### STEP 2 — ml-service/schemas.py

```python
from pydantic import BaseModel, Field, field_validator
from typing import Optional

class RequirementsAnalyzeRequest(BaseModel):
    requirements: list[str] = Field(..., min_length=1)
    project_id: Optional[str] = None

    @field_validator("requirements")
    @classmethod
    def validate_requirements(cls, v):
        if len(v) > 50:
            raise ValueError("Maximum 50 requirements per call")
        stripped = [r.strip() for r in v if r.strip()]
        if not stripped:
            raise ValueError("At least one non-empty requirement required")
        return stripped

class IssueDetail(BaseModel):
    type: str
    description: str

class RequirementScore(BaseModel):
    text: str
    score: int
    label: str           # "good" | "moderate" | "poor"
    issues: list[IssueDetail]

class RequirementsAnalyzeResponse(BaseModel):
    scores: list[RequirementScore]
```

---

### STEP 3 — ml-service/nlp/requirements_analyzer.py

Core detection logic. No API calls here.

```python
import re
import spacy

_nlp = None

VAGUE_ADJECTIVES = {
    "fast", "quick", "slow", "easy", "simple", "secure", "reliable",
    "efficient", "good", "bad", "nice", "friendly", "intuitive",
    "seamless", "smooth", "better", "high", "low", "minimal",
    "adequate", "sufficient", "proper", "effective", "responsive",
    "scalable", "maintainable", "robust",
}

QUALITY_TRIGGERS = {
    "performance", "speed", "latency", "response time", "load time",
    "throughput", "availability", "uptime", "reliability", "security",
    "capacity", "concurrent", "memory", "cpu",
}

AMBIGUOUS_PRONOUNS = {"it", "they", "them", "this", "that", "these", "those"}

PENALTY_WEIGHTS = {
    "vague_term": 15,
    "ambiguous_pronoun": 12,
    "missing_actor": 20,
    "missing_action": 25,
    "passive_without_actor": 8,
    "missing_measurable": 18,
}

def load_nlp():
    global _nlp
    if _nlp is None:
        _nlp = spacy.load("en_core_web_sm")
    return _nlp

def _detect_issues(text: str) -> list[dict]:
    nlp = load_nlp()
    doc = nlp(text)
    issues = []
    text_lower = text.lower()

    # Vague adjectives
    for token in doc:
        if token.pos_ == "ADJ" and token.lemma_.lower() in VAGUE_ADJECTIVES:
            issues.append({
                "type": "vague_term",
                "description": f'"{token.text}" is unmeasurable — add a numeric metric',
            })

    # Ambiguous pronouns as sentence subject/object
    for token in doc:
        if token.pos_ == "PRON" and token.lower_ in AMBIGUOUS_PRONOUNS:
            if token.dep_ in {"nsubj", "nsubjpass", "dobj", "pobj"}:
                issues.append({
                    "type": "ambiguous_pronoun",
                    "description": f'Pronoun "{token.text}" has unclear antecedent — use the explicit noun',
                })
                break

    # Missing actor (no nominal subject)
    has_subject = any(t.dep_ in {"nsubj", "nsubjpass", "csubj", "expl"} for t in doc)
    if not has_subject:
        issues.append({
            "type": "missing_actor",
            "description": "No subject — specify who or what performs this (e.g., 'The system shall...')",
        })

    # Missing action (no verb)
    if not any(t.pos_ in {"VERB", "AUX"} for t in doc):
        issues.append({
            "type": "missing_action",
            "description": "No verb — requirements must state what the system shall do",
        })

    # Passive voice without agent
    is_passive = any(t.dep_ == "nsubjpass" for t in doc)
    has_agent = any(t.dep_ == "agent" for t in doc)
    if is_passive and not has_agent:
        issues.append({
            "type": "passive_without_actor",
            "description": "Passive voice with no agent — specify the actor",
        })

    # Quality trigger with no numeric threshold
    if any(kw in text_lower for kw in QUALITY_TRIGGERS) and not re.search(r"\d+", text):
        issues.append({
            "type": "missing_measurable",
            "description": "Performance requirement with no numeric target — add a threshold (e.g., '< 2s', '99.9%')",
        })

    return issues

def _score(issues: list[dict]) -> int:
    return max(0, 100 - sum(PENALTY_WEIGHTS.get(i["type"], 10) for i in issues))

def _label(score: int) -> str:
    if score >= 80: return "good"
    if score >= 50: return "moderate"
    return "poor"

def analyze_requirements(requirements: list[str]) -> list[dict]:
    return [
        {"text": t, "score": _score(issues := _detect_issues(t)),
         "label": _label(_score(issues)), "issues": issues}
        for t in requirements
    ]
```

---

### STEP 4 — ml-service/main.py

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from schemas import RequirementsAnalyzeRequest, RequirementsAnalyzeResponse
from nlp.requirements_analyzer import analyze_requirements, load_nlp

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_nlp()   # warm up spaCy at startup, not per-request
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ml/requirements/analyze", response_model=RequirementsAnalyzeResponse)
def requirements_analyze(req: RequirementsAnalyzeRequest):
    try:
        scores = analyze_requirements(req.requirements)
        return {"scores": scores}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

Run with: `uvicorn main:app --host 127.0.0.1 --port 5001`

**Do NOT use `--reload` in demo/production mode** — spaCy cold start is 2-5s per worker restart. Use `--reload` only during development.

---

### STEP 5 — scripts/download_models.sh

```bash
#!/bin/bash
# Idempotent: skips download if model already cached
set -e
MODEL_CACHE="$(dirname "$0")/../ml-service"
if python3 -c "import spacy; spacy.load('en_core_web_sm')" 2>/dev/null; then
  echo "spacy en_core_web_sm already installed, skipping."
  exit 0
fi
echo "Downloading spaCy en_core_web_sm..."
python3 -m spacy download en_core_web_sm
echo "Done."
```

Run once: `bash scripts/download_models.sh`

---

### STEP 6 — backend/server.js changes

**6a. Add ml_results table** — add after the existing `db.exec(...)` block (after line 165):

```javascript
// ML results persistence (D2: locked schema)
db.exec(`
  CREATE TABLE IF NOT EXISTS ml_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    result_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
```

**6b. ML service health-check + in-memory cache** — add near top of server, after `const db = ...`:

```javascript
// D1: ML service availability tracking
// OV1: 15-attempt × 500ms poll before ML routes accept traffic
let mlServiceReady = false;
const nlpFallbackCache = new Map(); // OV7: keyed by projectId

async function pollMlHealth(maxAttempts = 15, delayMs = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await axios.get('http://127.0.0.1:5001/health', { timeout: 1000 });
      if (res.data?.status === 'ok') {
        mlServiceReady = true;
        console.log('ML service ready');
        return;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  console.warn('ML service not available after startup poll — routes will return 503');
}
pollMlHealth();
```

**6c. Add the NLP analyze route** — add after the existing SRS routes (after line 1370):

```javascript
// POST /api/ml/requirements/analyze
// D3: requireAuth gates all /api/ml/* routes
app.post('/api/ml/requirements/analyze', requireAuth, async (req, res) => {
  const { requirements, project_id } = req.body;

  if (!Array.isArray(requirements) || requirements.length === 0) {
    return res.status(422).json({ error: 'requirements must be a non-empty array' });
  }
  if (requirements.length > 50) {
    return res.status(422).json({ error: 'Maximum 50 requirements per call' });
  }

  // 503 fallback path (OV7): return cached result if ML service is down
  if (!mlServiceReady) {
    const cached = project_id ? nlpFallbackCache.get(project_id) : null;
    return res.status(503).json({
      error: 'Analysis service unavailable',
      cached: cached || null,
    });
  }

  try {
    // 1. Call Python ML service
    const mlRes = await axios.post('http://127.0.0.1:5001/ml/requirements/analyze', {
      requirements,
      project_id,
    }, { timeout: 30000 });

    const scores = mlRes.data.scores;

    // 2. Enrich flagged requirements with Gemini explanations (D6: Gemini in Node.js only)
    const flagged = scores.filter(s => s.score < 80);
    if (flagged.length > 0) {
      const explanationPrompt = `You are a software requirements expert. For each of the following software requirements and their detected issues, provide a concise one-sentence plain-English explanation of why it is problematic and how to fix it.

Return ONLY a JSON array with objects: {"text": "...", "explanation": "..."}

Requirements with issues:
${JSON.stringify(flagged.map(s => ({ text: s.text, issues: s.issues.map(i => i.type) })))}`;

      try {
        const rawExplanation = await callLLM(explanationPrompt);
        const explanations = parseLLMJson(rawExplanation);
        if (Array.isArray(explanations)) {
          const explanationMap = new Map(explanations.map(e => [e.text, e.explanation]));
          scores.forEach(s => {
            if (explanationMap.has(s.text)) {
              s.gemini_explanation = explanationMap.get(s.text);
            }
          });
        }
      } catch (_) {
        // Explanation enrichment is best-effort; continue without it
      }
    }

    // 3. Persist to ml_results (D2)
    if (project_id) {
      db.prepare(`
        INSERT INTO ml_results (project_id, result_type, payload)
        VALUES (?, 'requirements_analysis', ?)
      `).run(project_id, JSON.stringify(scores));

      // Update fallback cache (OV7)
      nlpFallbackCache.set(project_id, { scores, cached_at: new Date().toISOString() });
    }

    return res.json({ scores });
  } catch (err) {
    console.error('ML requirements analyze error:', err.message);
    const cached = project_id ? nlpFallbackCache.get(project_id) : null;
    return res.status(503).json({
      error: 'Analysis service unavailable',
      cached: cached || null,
    });
  }
});
```

**Important:** This route uses `callLLM` which must match the existing LLM service function name. Check `backend/services/llm.js` — the exported function is `callLLM`. Require it at the top of server.js if not already imported.

---

### STEP 7 — SRSEditor.jsx changes

**7a. Add state variables** (add after line 38):

```javascript
const [qualityResults, setQualityResults] = useState(null);
const [qualityLoading, setQualityLoading] = useState(false);
const [qualityError, setQualityError] = useState('');
```

**7b. Add the analyze function** (add after `handleExportSRS`):

```javascript
const handleAnalyzeQuality = async () => {
  if (!finalSrsContent.trim()) return;

  // Extract individual requirement sentences from SRS text
  // Split on sentence boundaries within the "Specific Requirements" section
  const lines = finalSrsContent.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 20 && !l.startsWith('=') && !l.startsWith('-') && !l.startsWith('#'));

  if (lines.length === 0) {
    setQualityError('No requirements found in the SRS text.');
    return;
  }

  setQualityLoading(true);
  setQualityError('');
  try {
    const response = await axios.post('/api/ml/requirements/analyze', {
      requirements: lines.slice(0, 50),
      project_id: projectId,
    });
    setQualityResults(response.data.scores);
  } catch (err) {
    if (err.response?.status === 503) {
      const cached = err.response.data?.cached;
      if (cached) {
        setQualityResults(cached.scores);
        setQualityError('Using cached results (analysis service offline).');
      } else {
        setQualityError('Analysis service unavailable. Start the ML service with: cd ml-service && uvicorn main:app --host 127.0.0.1 --port 5001');
      }
    } else {
      setQualityError('Analysis failed. Please try again.');
    }
  } finally {
    setQualityLoading(false);
  }
};
```

**7c. Add the quality panel render** — in the review step JSX, after the SRS preview block, add:

```jsx
{/* Quality Analysis Panel — shown only in review/progress step */}
<div className="quality-analysis-panel">
  <div className="quality-analysis-header">
    <h3>Requirements Quality Analysis</h3>
    <button
      className="analyze-btn"
      onClick={handleAnalyzeQuality}
      disabled={qualityLoading || !finalSrsContent}
    >
      {qualityLoading ? 'Analyzing...' : 'Analyze Quality'}
    </button>
  </div>
  {qualityError && <p className="quality-error">{qualityError}</p>}
  {qualityResults && (
    <div className="quality-results">
      <div className="quality-summary">
        {(() => {
          const avg = Math.round(qualityResults.reduce((s, r) => s + r.score, 0) / qualityResults.length);
          const label = avg >= 80 ? 'good' : avg >= 50 ? 'moderate' : 'poor';
          return (
            <div className={`quality-avg-badge quality-${label}`}>
              Avg Score: {avg}/100 — {label.toUpperCase()}
            </div>
          );
        })()}
      </div>
      <div className="quality-items">
        {qualityResults.map((item, idx) => (
          <div key={idx} className={`quality-item quality-${item.label}`}>
            <div className="quality-item-header">
              <span className={`quality-badge quality-${item.label}`}>{item.score}</span>
              <span className="quality-item-text">{item.text}</span>
            </div>
            {item.issues.length > 0 && (
              <ul className="quality-issues">
                {item.issues.map((issue, i) => (
                  <li key={i} className="quality-issue">
                    <span className="issue-type">{issue.type.replace(/_/g, ' ')}</span>
                    {item.gemini_explanation
                      ? ` — ${item.gemini_explanation}`
                      : ` — ${issue.description}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )}
</div>
```

**7d. Add CSS** in `SRSEditor.css`:

```css
.quality-analysis-panel { margin-top: 24px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.quality-analysis-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
.quality-analysis-header h3 { margin: 0; font-size: 14px; font-weight: 600; }
.analyze-btn { padding: 6px 14px; background: #4f46e5; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
.analyze-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.quality-error { padding: 8px 16px; color: #b45309; font-size: 13px; background: #fef3c7; margin: 0; }
.quality-results { padding: 12px 16px; }
.quality-avg-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
.quality-items { display: flex; flex-direction: column; gap: 8px; }
.quality-item { padding: 10px 12px; border-radius: 6px; border-left: 3px solid; }
.quality-item.quality-good { background: #f0fdf4; border-color: #22c55e; }
.quality-item.quality-moderate { background: #fefce8; border-color: #eab308; }
.quality-item.quality-poor { background: #fef2f2; border-color: #ef4444; }
.quality-item-header { display: flex; align-items: flex-start; gap: 8px; }
.quality-badge { min-width: 32px; height: 24px; border-radius: 4px; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; color: #fff; }
.quality-good .quality-badge { background: #22c55e; }
.quality-moderate .quality-badge { background: #eab308; }
.quality-poor .quality-badge { background: #ef4444; }
.quality-avg-badge.quality-good { background: #dcfce7; color: #15803d; }
.quality-avg-badge.quality-moderate { background: #fef9c3; color: #92400e; }
.quality-avg-badge.quality-poor { background: #fee2e2; color: #b91c1c; }
.quality-item-text { font-size: 13px; color: #374151; flex: 1; line-height: 1.4; }
.quality-issues { margin: 6px 0 0 40px; padding: 0; list-style: none; }
.quality-issue { font-size: 12px; color: #6b7280; margin-bottom: 3px; }
.issue-type { font-weight: 600; text-transform: capitalize; color: #374151; }
```

---

## Verification Steps (test end-to-end)

1. **Start Python ML service:**
   ```bash
   cd ml-service
   pip install -r requirements.txt
   python3 -m spacy download en_core_web_sm
   uvicorn main:app --host 127.0.0.1 --port 5001
   ```

2. **Verify health:**
   ```bash
   curl http://127.0.0.1:5001/health
   # Expected: {"status":"ok"}
   ```

3. **Test NLP endpoint directly:**
   ```bash
   curl -X POST http://127.0.0.1:5001/ml/requirements/analyze \
     -H "Content-Type: application/json" \
     -d '{"requirements":["The system should be fast","The user shall authenticate using a username and password with a response time under 2 seconds"]}'
   # Expected: two scores, first ~55 (vague_term: fast), second ~85 (clear)
   ```

4. **Start Node.js backend:**
   ```bash
   cd backend && npm run dev
   ```

5. **Log in and generate an SRS** in the frontend, then click "Analyze Quality" — should show per-sentence badges.

6. **503 fallback test:** Stop the ML service, click "Analyze Quality" — should show "Analysis service unavailable" message (or cached results if previously analyzed).

---

## Architecture Decisions Inherited (from locked plan)

| Decision | Applied here |
|----------|-------------|
| D2 | `ml_results(id, project_id, result_type, payload JSON, created_at)` — added to server.js |
| D3 | `requireAuth` on `/api/ml/requirements/analyze` |
| D6 | Gemini called in Node.js proxy, Python has no API key |
| OV1 | 15-attempt × 500ms poll before `mlServiceReady = true` |
| OV7 | `nlpFallbackCache = new Map()` keyed by `project_id` |

---

## GSTACK REVIEW REPORT

| Review | Skill | Scope | Runs | Status | Findings |
|--------|-------|-------|------|--------|----------|
| — | — | — | 0 | NO REVIEWS YET — run `/autoplan` | — |
