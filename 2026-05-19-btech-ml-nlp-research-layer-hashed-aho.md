# End-to-End Integration Plan: AI Software Engineer Platform
## 4-Day BTech Demo Consolidation + ML/AI Research Layer

**Date:** 2026-05-21 | **Repo:** AI-Software-Engineer | **Branch:** main

---

## Context

The project has a working core SDLC tool (auth, projects, SRS, design, implementation, validation) but feels like a "Frankenstein" because:

1. **Visual fragmentation** — three competing accent gradients (purple, red, green) across phases, no design tokens, padding/typography ad-hoc, multiple `withCredentials` duplications, mixed axios/fetch API patterns.
2. **No integration spine** — each SDLC phase is an island. No project-level dashboard, no progress visibility, no quality scores connecting phases.
3. **Backend tech debt** — 30 routes inline in a 1,913-line [backend/server.js](backend/server.js). Auth applied to only ~50% of routes (`/api/code/*` and `/api/design/*` are unauthenticated). Session secret regenerates on restart. No `.env.example`.
4. **ML/Research layer entirely unbuilt** — plans exist in [2026-05-19-btech-ml-nlp-research-layer-pure-rivest.md](2026-05-19-btech-ml-nlp-research-layer-pure-rivest.md), [2026-05-21-code-intelligence-panel-design.md](2026-05-21-code-intelligence-panel-design.md), [semantic.md](semantic.md), [more_features.md](more_features.md), but they contradict (port 5001 vs 8001, different schemas) and `ml-service/` doesn't exist.

**Outcome:** A single unified visual+navigation language, a project dashboard that surfaces every phase's health, a hardened backend, and four buzzword-grade ML/AI features (NLP analyzer, semantic conflict detector, code intelligence panel, RAG + multi-agent reviews) — all reachable from one cohesive UI in time for a 4-day BTech demo.

---

## Locked Architecture Decisions

| Decision | Value |
|----------|-------|
| ML service shape | **ONE** FastAPI process at `127.0.0.1:8000` hosting all endpoints (NLP, conflict, defect, traceability, RAG) |
| Integration spine | **Persistent left sidebar** with phase progress + score badges, present on every `/projects/:id/*` route |
| Multi-agent home | **"AI Reviews" tab** on the new Project Dashboard |
| Design tokens | Single `frontend/src/styles/tokens.css` — one primary gradient (`#667eea → #764ba2`), one accent (`#22d3ee`), one status set (success `#22c55e`, warn `#eab308`, danger `#ef4444`) |
| ML persistence | One table `ml_results(id, project_id, result_type, payload JSON, score INT, created_at)` |
| Auth on ML routes | `requireAuth` middleware applied to all `/api/ml/*` and remaining unprotected routes |
| Fallback for ML down | `503` with last cached result from `ml_results` (DB-backed, not in-memory) |

---

## Milestone Map (4 days, ~9h each)

| Day | Milestones | Outcome |
|-----|-----------|---------|
| **Day 1** | M0a Design tokens · M0b API client · M0c Backend modularization + auth fix · M0d ml-service scaffold · M0e Persistent sidebar | Foundation: unified visuals, hardened backend, ML service skeleton, integration spine live |
| **Day 2** | M1 Project Dashboard · M2 NLP Requirements Analyzer · M3 Semantic Conflict Detector | First two ML features demoable, dashboard pulls phases together |
| **Day 3** | M4 Code Intelligence Panel (defect predictor + traceability) | Biggest research-credibility feature in ValidationLab |
| **Day 4** | M5 RAG Project Memory · M6 Multi-Agent + Adversarial Reviews · M7 Demo polish | All Layer-3 GenAI features, startup script, README, seed project |

---

# DAY 1 — Foundation

## M0a — Design Tokens & Visual Unification (~2h)

**Goal:** One source of truth for color/spacing/typography. Every component refactored to use tokens, no hardcoded gradients.

**Create:** `frontend/src/styles/tokens.css`

```css
:root {
  /* Primary palette — used everywhere */
  --grad-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --grad-primary-soft: linear-gradient(135deg, rgba(102,126,234,0.15), rgba(118,75,162,0.15));
  --color-accent: #22d3ee;

  /* Status (used for ML/quality scores) */
  --color-success: #22c55e;
  --color-warn:    #eab308;
  --color-danger:  #ef4444;
  --color-info:    #3b82f6;

  /* Surfaces */
  --bg-app:     #0a0e27;
  --bg-card:    rgba(15, 23, 42, 0.6);
  --bg-input:   rgba(30, 41, 59, 0.6);
  --border-card: rgba(148, 163, 184, 0.15);

  /* Text */
  --text-primary:   #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted:     #64748b;

  /* Spacing scale (4px base) */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;

  /* Radius / shadow / blur */
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;
  --shadow-card: 0 8px 32px rgba(0,0,0,0.3);
  --blur-glass: 20px;

  /* Typography */
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --fs-xs: 12px; --fs-sm: 13px; --fs-base: 14px; --fs-lg: 16px;
  --fs-xl: 20px; --fs-2xl: 28px; --fs-3xl: 36px;
}
```

**Import** in `frontend/src/main.jsx` (before App import). Also create:
- `frontend/src/styles/components.css` — shared `.btn-primary`, `.btn-ghost`, `.card`, `.badge-success/.badge-warn/.badge-danger`, `.score-pill` classes.

**Refactor** the following CSS files to swap hex codes → tokens (find/replace):
- [frontend/src/components/SRSEditor.css](frontend/src/components/SRSEditor.css)
- [frontend/src/components/ImplementationLab.css](frontend/src/components/ImplementationLab.css)
- [frontend/src/components/ValidationLab.css](frontend/src/components/ValidationLab.css) — **replace red/orange gradient with `--grad-primary`**
- [frontend/src/components/DesignPage.css](frontend/src/components/DesignPage.css) — **replace green/teal gradient with `--grad-primary`**
- [frontend/src/components/SystemDesignWizard.css](frontend/src/components/SystemDesignWizard.css)
- [frontend/src/components/ProjectsDashboard.css](frontend/src/components/ProjectsDashboard.css)

**Acceptance:** Every primary button across SRS/Design/Implementation/Validation uses the same gradient. Visually walk through all 5 phases in browser — no color whiplash.

---

## M0b — Unified API Client + Auth Context (~1h)

**Create:** `frontend/src/lib/api.js`

```javascript
import axios from 'axios';
export const apiBase = import.meta.env.VITE_API_BASE || '/api';
export const api = axios.create({ baseURL: apiBase, withCredentials: true });
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) window.location.href = '/auth';
    return Promise.reject(err);
  }
);
```

**Create:** `frontend/src/contexts/AuthContext.jsx` — provides `{ user, loading, login, logout, refresh }`. Wraps `App` in `main.jsx`. Removes the five duplicated `axios.defaults.withCredentials = true` lines.

**Refactor:** every component using `axios` or `fetch` → use `api` from `lib/api.js`. Drop direct URL strings, use endpoint paths only (`api.post('/ml/requirements/analyze', ...)`).

**Acceptance:** `grep -r "withCredentials" frontend/src` returns only the one declaration in `lib/api.js`. `grep -r "fetch(" frontend/src` returns no API calls.

---

## M0c — Backend Modularization + Auth Hardening (~3h)

**Restructure** `backend/`:

```
backend/
  server.js                  ← slim bootstrap (~150 lines)
  middleware/
    requireAuth.js
    errorHandler.js          ← unified { error, code, requestId } format
  routes/
    auth.js
    projects.js
    srs.js
    design.js
    code.js                  ← code/generate, translate, test, review
    documents.js             ← extract-text moved here
    ml.js                    ← NEW: all /api/ml/* proxy routes
  services/
    llm.js                   (already exists)
    mlClient.js              ← NEW: axios client to ml-service:8000 + health poll
    cache.js                 ← NEW: DB-backed cache reads for 503 fallback
  db/
    schema.js                ← centralized CREATE TABLE IF NOT EXISTS calls
```

**Apply `requireAuth`** to:
- All `/api/code/*` (currently unprotected)
- All `/api/design/*` (currently unprotected)
- All `/api/srs/*` not already protected
- All `/api/ml/*` (new)
- All `/api/documents/*` (new)

**Add** `ml_results` table to `db/schema.js`:

```sql
CREATE TABLE IF NOT EXISTS ml_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  result_type TEXT NOT NULL,   -- 'nlp_analysis' | 'conflict' | 'defect' | 'traceability' | 'rag_index'
  payload TEXT NOT NULL,        -- JSON blob
  score INTEGER,                -- summary score 0-100 (NULL for non-scorable)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ml_results_project_type
  ON ml_results(project_id, result_type, created_at DESC);
```

**Create** `.env.example` at repo root:

```
PORT=4000
SESSION_SECRET=change-me-in-prod-32-chars-min
DB_PATH=./backend/data/db.sqlite
GEMINI_API_KEY=
GROQ_API_KEY=
ML_SERVICE_URL=http://127.0.0.1:8000
```

**Fix** session secret: refuse to start in production if `SESSION_SECRET` env var is missing (warn in dev, default to a stable derived value so sessions survive restart).

**Acceptance:**
- `backend/server.js` < 200 lines
- Hitting `/api/code/generate` without a session returns 401
- `wc -l backend/routes/*.js` shows reasonable distribution (no single file > 400 lines)
- `node backend/server.js` starts cleanly with the new structure

---

## M0d — `ml-service/` Scaffold (FastAPI, single process) (~1.5h)

**Create:**

```
ml-service/
  main.py                          ← FastAPI app with lifespan, all endpoints registered
  requirements.txt                 ← fastapi, uvicorn, pydantic, spacy, sentence-transformers,
                                     scikit-learn, shap, radon, networkx, numpy
  schemas.py                       ← all Pydantic request/response models
  nlp/
    __init__.py
    requirements_analyzer.py       ← M2 spaCy detector
    conflict_detector.py           ← M3 SBERT + spaCy
    negation_analyzer.py           ← M3 rule engine
  code_intel/
    __init__.py
    defect_predictor.py            ← M4 RF + SHAP
    traceability.py                ← M4 SBERT similarity
    radon_features.py              ← feature extraction
    train_defect_model.py          ← one-shot training script
    models/                        ← gitignored, holds .joblib
  rag/
    __init__.py
    indexer.py                     ← M5 chunk + embed + store in SQLite
    retriever.py                   ← M5 cosine top-k
  shared/
    model_cache.py                 ← SBERT loader singleton (shared by M3/M4/M5)
    spacy_loader.py                ← spaCy loader singleton (shared by M2/M3)
  scripts/
    download_models.sh             ← idempotent: spacy en_core_web_sm + SBERT all-MiniLM-L6-v2
```

**`main.py` skeleton:**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from shared.spacy_loader import load_nlp
from shared.model_cache import load_sbert

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_nlp()         # warm spaCy
    load_sbert()       # warm SBERT (used by M3/M4/M5)
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/health")
def health(): return {"status": "ok"}

# Routers registered in milestones:
# /nlp/requirements/analyze     (M2)
# /nlp/conflict/detect          (M3)
# /code/defect/predict          (M4)
# /code/traceability/analyze    (M4)
# /rag/index, /rag/query        (M5)
```

**Run with:** `uvicorn main:app --host 127.0.0.1 --port 8000` (no `--reload` in demo mode — SBERT cold start is 5-8s).

**`backend/services/mlClient.js`** polls `/health` 15× at 500ms during Node startup and exposes `mlReady` and `mlPost(path, body)`.

**Acceptance:** `curl http://127.0.0.1:8000/health` returns `{"status":"ok"}`. Node startup logs "ML service ready" after Python is up.

---

## M0e — Persistent Project Sidebar (Integration Spine) (~1.5h)

**Replace** the current document-only `ProjectSidebar.jsx` with a richer one that always shows phase progress.

**Create:** `frontend/src/components/PhaseSidebar.jsx` — rendered inside [frontend/src/components/ProjectLayout.jsx](frontend/src/components/ProjectLayout.jsx) on every `/projects/:id/*` route.

**Layout:**

```
┌─────────────────────┐
│ ◀ Project Name      │   ← collapsible
│                     │
│ ● Requirements  92  │   ← phase, status dot (filled if done), quality score badge
│ ● Design        78  │
│ ● Implementation —  │   ← em-dash if not started
│ ● Quality        —  │
│                     │
│ ─────────────────── │
│ AI Reviews      ▸   │   ← link to dashboard "Reviews" tab
│ ─────────────────── │
│ Documents       3   │   ← existing doc list moves below
│  • SRS.docx         │
│  • PRD.pdf          │
│ + Upload            │
└─────────────────────┘
```

Phase scores come from `GET /api/projects/:id/health` — a new endpoint that reads the latest `ml_results` row per type and returns:

```json
{
  "requirements": { "score": 92, "status": "good" },
  "design":       { "score": 78, "status": "moderate" },
  "implementation": null,
  "quality":      null
}
```

Until ML features ship, `requirements` returns `null` and the sidebar shows em-dashes. Wiring up phase scores happens incrementally as M2/M3/M4 land.

**Acceptance:** Sidebar visible on all 5 phase pages, click jumps to the phase, collapsible state persists across navigations.

---

# DAY 2 — Dashboard + First Two ML Features

## M1 — Project Dashboard (replaces UniversalHomePage) (~2h)

**Refactor:** [frontend/src/components/UniversalHomePage.jsx](frontend/src/components/UniversalHomePage.jsx) → rename concept to `ProjectDashboard.jsx`. Route stays `/projects/:id`.

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│ Project: Online Banking App                       [⚙ Settings]│
├──────────────────────────────────────────────────────────────┤
│ OVERVIEW    REVIEWS    ANALYTICS                              │ ← tabs
├──────────────────────────────────────────────────────────────┤
│ OVERVIEW                                                       │
│ ┌─────────────┬─────────────┬─────────────┬─────────────┐   │
│ │ Requirements│ Design      │ Implement   │ Quality      │   │
│ │ 92 / 100    │ 78 / 100    │  —           │  —           │   │
│ │ 12 reqs     │ 4 diagrams  │ Not started │ Not started  │   │
│ │ 2 conflicts │ Schema OK   │              │              │   │
│ │ [Open ▸]    │ [Open ▸]    │ [Start ▸]   │ [Start ▸]   │   │
│ └─────────────┴─────────────┴─────────────┴─────────────┘   │
│                                                                │
│ Recent Activity                                                │
│  • NLP analysis run 2 min ago — 3 issues found                │
│  • SRS v4 saved 12 min ago                                    │
└──────────────────────────────────────────────────────────────┘
```

The **Reviews tab** is a placeholder until Day 4 (M6). The **Analytics tab** holds the chart from M5 readiness scorer (rule-based, no ML).

**Endpoints needed (in `routes/projects.js`):**
- `GET /api/projects/:id/health` (created above in M0e)
- `GET /api/projects/:id/activity?limit=10` — reads from `ml_results` + `srs_versions` + `logs`, sorted by `created_at desc`

**Acceptance:** Landing on a project shows the dashboard with live phase cards. Click on "Requirements" → goes to HomePage. Cards show real counts pulled from DB.

---

## M2 — NLP Requirements Quality Analyzer (~3h)

Implements the M2 plan from [2026-05-19-btech-ml-nlp-research-layer-pure-rivest.md](2026-05-19-btech-ml-nlp-research-layer-pure-rivest.md) — **but** with these adjustments to match locked decisions:

| Plan said | Use instead |
|-----------|-------------|
| Port 5001 | Port 8000 (single ml-service) |
| Path `/ml/requirements/analyze` | `/nlp/requirements/analyze` |
| In-memory `nlpFallbackCache = new Map()` | DB-backed via `services/cache.js` reading `ml_results` |

**Files to create/use:**
- `ml-service/nlp/requirements_analyzer.py` — spaCy detection (vague terms, ambiguous pronouns, missing actor, missing action, passive without agent, missing measurable) with the exact penalty weights from the existing plan
- `ml-service/schemas.py` — Pydantic models for `RequirementsAnalyzeRequest/Response`
- `backend/routes/ml.js` — `POST /api/ml/requirements/analyze` (requireAuth, proxies to ml-service, enriches < 80 score with Gemini explanation, saves to `ml_results`)
- `frontend/src/components/SRSEditor.jsx` — add "Analyze Quality" button in the review step + quality panel using shared `.score-pill` token classes
- `frontend/src/components/SRSEditor.css` — quality badge styles using `--color-success/warn/danger`

**Wire into sidebar:** After analysis, `GET /api/projects/:id/health` returns the new `requirements.score` (average across sentences). PhaseSidebar shows it.

**Acceptance:**
- Click "Analyze Quality" in SRS → per-sentence cards with score badges and Gemini explanations appear
- Stop ml-service → click again → 503 fallback shows cached results from DB
- Score appears in PhaseSidebar within seconds

---

## M3 — Semantic Conflict Detector (~3h)

Implements [semantic.md](semantic.md) — the SBERT + spaCy two-stage pipeline.

**Files to create:**
- `ml-service/nlp/conflict_detector.py` — SBERT cosine matrix + candidate filter (>0.55 threshold)
- `ml-service/nlp/negation_analyzer.py` — 5-type rule classifier (direct/temporal/quantitative/permission/existence)
- `ml-service/main.py` — register `POST /nlp/conflict/detect`
- `backend/routes/ml.js` — add `POST /api/ml/conflict/detect` (requireAuth, Gemini explanation for confidence > 0.6, saves to `ml_results` as `result_type='conflict'`)
- `frontend/src/components/ConflictPanel.jsx` — sortable cards by confidence, type-color-coded badges
- Install on frontend: `react-force-graph-2d` for graph viz
- Add a **"Conflicts" tab** inside SRSEditor's review step (next to "Quality")

**Reuses SBERT model loaded by `shared/model_cache.py`** — no new download.

**Adds `networkx` to `ml-service/requirements.txt`** (pure Python, no native deps).

**Acceptance:**
- Generate an SRS with intentional conflicts ("system shall store logs for 7 years" + "purge data after 90 days") → conflict panel shows them with confidence > 0.7
- Force graph renders with nodes/edges
- Empty state when no conflicts found

---

# DAY 3 — Code Intelligence Panel

## M4 — Defect Predictor + Traceability Matrix (~6h)

Implements [2026-05-21-code-intelligence-panel-design.md](2026-05-21-code-intelligence-panel-design.md) — **but** on the single ml-service at port 8000.

### M4a — Train defect model (~1.5h)

- `ml-service/code_intel/train_defect_model.py`
  - Downloads PROMISE ARFF files (kc1, kc2, pc1) from `klainfo/DefectData` GitHub mirror
  - Trains `RandomForestClassifier(n_estimators=100, class_weight='balanced', random_state=42)` on 5 features: CC, Halstead Volume, Halstead Effort, LOC, n_functions
  - Saves to `ml-service/code_intel/models/defect_rf_v1.joblib` + `model_metadata.json` (AUC, F1, P, R on held-out 20%)
  - **Synthetic fallback** (~50 examples) if download fails so the demo still works
- Run once: `cd ml-service && python -m code_intel.train_defect_model`

### M4b — Inference endpoint (~1.5h)

- `ml-service/code_intel/radon_features.py` — Python: real radon; JS/other: regex approximation (count `if/for/while/switch/case/catch` as CC)
- `ml-service/code_intel/defect_predictor.py` — load joblib once via `@lru_cache`, `predict_proba`, SHAP TreeExplainer top-3 features
- `ml-service/main.py` — register `POST /code/defect/predict`

### M4c — Traceability endpoint (~1h)

- `ml-service/code_intel/traceability.py` — SBERT encode reqs + functions, cosine matrix, classify links (strong ≥0.65, weak 0.45-0.65), find orphans, compute coverage_pct
- `ml-service/main.py` — register `POST /code/traceability/analyze`

### M4d — Frontend panel (~2h)

- `frontend/src/components/CodeIntelligencePanel.jsx` — two-column layout (defect heatmap left, traceability matrix right) per the design spec, using design tokens
- `frontend/src/components/CodeIntelligencePanel.css`
- `frontend/src/components/ValidationLab.jsx` — add an **"Intelligence" tab** that renders `CodeIntelligencePanel`
- `backend/routes/ml.js` — add `POST /api/ml/defect/predict` and `POST /api/ml/traceability/analyze`, save results to `ml_results`

**Wire into dashboard:** ValidationLab phase card on the dashboard now shows `quality.score` (avg defect_risk inverted to 0-100). Implementation phase card shows traceability `coverage_pct`.

**Acceptance:**
- Paste a Python function with high CC into ValidationLab → Intelligence tab shows risk badge + SHAP top-3 factors
- With SRS requirements in context, traceability matrix shows green/yellow cells + coverage percentage
- Phase scores appear in PhaseSidebar

---

# DAY 4 — Layer 3 Agentic + Demo Polish

## M5 — RAG Project Memory (~2h)

**Files:**
- `ml-service/rag/indexer.py` — chunks documents (SRS, design, code) into ~500-token windows, SBERT-encodes, stores in `ml_results` (`result_type='rag_index'`, payload = `{chunks: [{text, vector_b64, source}]}`) **OR** a separate `rag_chunks` table — pick the table approach for clarity:

```sql
CREATE TABLE IF NOT EXISTS rag_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  source_type TEXT NOT NULL,    -- 'srs' | 'design' | 'code' | 'doc'
  source_id TEXT,
  chunk_text TEXT NOT NULL,
  embedding BLOB NOT NULL,       -- float32 array, 384 dims = 1536 bytes
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- `ml-service/rag/retriever.py` — load embeddings for a project, cosine top-k=3
- `ml-service/main.py` — register `POST /rag/index/{project_id}` and `POST /rag/query`
- `backend/routes/ml.js` — `POST /api/ml/rag/index` (re-index on demand), `POST /api/ml/rag/query` (calls retriever, then Gemini with retrieved context + user question)

**Frontend:** Chat-style panel inside Dashboard "Reviews" tab. Single text input → answer with source citations (e.g., "From SRS v4: ...").

**Trigger re-index:** after SRS save, after code generation. Show a small "🧠 Memory updated" toast.

**Acceptance:** Ask "Which requirements does the authenticate_user function cover?" → answer cites SRS line + function name with similarity scores.

---

## M6 — Multi-Agent Review + Adversarial Stress-Tester (~2h)

Lives in Dashboard "Reviews" tab. Pure Node-side (no ml-service work) — three parallel Gemini calls.

**Add to `backend/routes/ml.js`:**

```javascript
app.post('/api/ml/reviews/run', requireAuth, async (req, res) => {
  const { project_id, artifact_type } = req.body; // 'srs' | 'design' | 'code'
  const artifact = await loadArtifact(project_id, artifact_type);

  const [arch, sec, perf, adv] = await Promise.all([
    callLLM(prompts.architect(artifact)),
    callLLM(prompts.security(artifact)),
    callLLM(prompts.performance(artifact)),
    callLLM(prompts.adversarial(artifact)),
  ]);

  const result = { architect: arch, security: sec, performance: perf, adversarial: adv };
  await saveMlResult(project_id, 'multi_agent_review', result);
  res.json(result);
});
```

**Prompts** live in `backend/prompts/agents/*.txt` (one per persona). Each persona returns a strict JSON: `{ summary, issues: [{severity, title, description, line_hint}] }`. Use existing `parseLLMJson()`.

**Frontend:** Four side-by-side agent cards in the Reviews tab. Each card collapsible. Severity badges using design tokens.

**Acceptance:** Click "Run AI Review" on the dashboard → four cards populate with persona-specific findings within ~6s (parallel calls).

---

## M7 — Demo Polish + Startup Script + Seed Project (~3h)

### M7a — Unified startup script (~30min)

**Create:** `scripts/start-all.sh`

```bash
#!/usr/bin/env bash
set -e
# 1. Download models if missing
bash ml-service/scripts/download_models.sh
# 2. Train defect model if joblib missing
[ ! -f ml-service/code_intel/models/defect_rf_v1.joblib ] && (cd ml-service && python -m code_intel.train_defect_model)
# 3. Start ml-service (background)
(cd ml-service && uvicorn main:app --host 127.0.0.1 --port 8000) &
# 4. Start backend (background)
(cd backend && npm start) &
# 5. Start frontend (foreground)
cd frontend && npm run dev
```

Plus `scripts/stop-all.sh` to kill background processes.

### M7b — README rewrite (~30min)

Replace existing README with:
- 30-second pitch: "AI-Software-Engineer is a full-SDLC autonomous workbench. Three intelligence layers..."
- 1-command setup: `bash scripts/start-all.sh`
- Architecture diagram (ASCII)
- Feature list with screenshots placeholders
- Demo walkthrough script (10 steps)

### M7c — Seed demo project (~1h)

Add a "Create Demo Project" button on ProjectsDashboard that, in one click, creates a project with:
- A pre-loaded SRS with intentional flaws (some vague terms, one conflict pair)
- Sample code with one high-CC function
- A few uploaded docs

This means a demo can show all features without typing.

Implementation: `POST /api/projects/seed-demo` endpoint that runs the inserts.

### M7d — Loading skeletons & empty states (~1h)

Every ML panel currently renders nothing while loading. Add `<SkeletonRows count={N} />` shared component (uses `--bg-input` shimmer animation). Apply to:
- Quality panel, Conflict panel, Code Intelligence panel, RAG chat, Reviews tab

### M7e — End-to-end smoke pass

Walk through the demo script with all 4 ML services running. Fix anything that looks janky. Capture 3-5 screenshots for the README.

---

## Critical Files to Modify (summary table)

| File | Changes |
|------|---------|
| [frontend/src/main.jsx](frontend/src/main.jsx) | Import tokens.css, components.css; wrap App in AuthProvider |
| [frontend/src/styles/tokens.css](frontend/src/styles/tokens.css) | **NEW** — design tokens |
| [frontend/src/styles/components.css](frontend/src/styles/components.css) | **NEW** — shared btn/card/badge classes |
| [frontend/src/lib/api.js](frontend/src/lib/api.js) | **NEW** — unified axios |
| [frontend/src/contexts/AuthContext.jsx](frontend/src/contexts/AuthContext.jsx) | **NEW** |
| [frontend/src/components/PhaseSidebar.jsx](frontend/src/components/PhaseSidebar.jsx) | **NEW** — integration spine |
| [frontend/src/components/ProjectDashboard.jsx](frontend/src/components/ProjectDashboard.jsx) | Rename + rebuild UniversalHomePage |
| [frontend/src/components/ConflictPanel.jsx](frontend/src/components/ConflictPanel.jsx) | **NEW** |
| [frontend/src/components/CodeIntelligencePanel.jsx](frontend/src/components/CodeIntelligencePanel.jsx) | **NEW** |
| [frontend/src/components/RagChat.jsx](frontend/src/components/RagChat.jsx) | **NEW** |
| [frontend/src/components/AgentReviewsPanel.jsx](frontend/src/components/AgentReviewsPanel.jsx) | **NEW** |
| [frontend/src/components/SRSEditor.jsx](frontend/src/components/SRSEditor.jsx) | Add Quality + Conflicts tabs |
| [frontend/src/components/ValidationLab.jsx](frontend/src/components/ValidationLab.jsx) | Add Intelligence tab |
| [frontend/src/components/ProjectLayout.jsx](frontend/src/components/ProjectLayout.jsx) | Mount PhaseSidebar |
| All `*.css` in components/ | Replace hex codes with tokens |
| [backend/server.js](backend/server.js) | Reduce to slim bootstrap |
| `backend/routes/*.js` | **NEW** — split from server.js |
| `backend/middleware/requireAuth.js` | **NEW** — moved from server.js |
| `backend/middleware/errorHandler.js` | **NEW** |
| `backend/services/mlClient.js` | **NEW** — proxy + health poll |
| `backend/services/cache.js` | **NEW** — DB-backed fallback reads |
| `backend/db/schema.js` | **NEW** — central CREATE TABLE incl. `ml_results`, `rag_chunks` |
| `backend/routes/ml.js` | **NEW** — all `/api/ml/*` proxy routes |
| `backend/prompts/agents/*.txt` | **NEW** — architect, security, performance, adversarial personas |
| `ml-service/**` | **NEW** — entire FastAPI tree as above |
| `scripts/start-all.sh` | **NEW** |
| `.env.example` | **NEW** |
| `README.md` | Rewrite |

---

## Functions/Utilities to Reuse (don't recreate)

- `services/llm.js` → `llm.generate(prompt)` — already supports Gemini + Groq fallback
- `parseLLMJson()` and `extractJson()` in server.js — move to `services/llmUtils.js` during M0c, import everywhere
- `validateLLMResponse()` in server.js — same, move to llmUtils
- `loadPrompt()` — move to `services/prompts.js`
- `ProjectContext` in [frontend/src/components/ProjectContext.jsx](frontend/src/components/ProjectContext.jsx) — keep, extend with `phaseScores` field
- `react-quill` already in package.json — keep, used in SRSEditor
- spaCy `en_core_web_sm` and SBERT `all-MiniLM-L6-v2` downloaded ONCE via `scripts/download_models.sh`, reused across M2/M3/M4/M5

---

## Verification Plan

### After Day 1
- `npm run dev` (frontend) → walk through all 5 phases, primary buttons all show the same purple gradient
- `node backend/server.js` → check `wc -l backend/server.js` < 200
- `curl -X POST http://localhost:4000/api/code/generate -d '{}' -H 'Content-Type: application/json'` → returns 401 (not 200)
- `curl http://127.0.0.1:8000/health` → `{"status":"ok"}`
- Open `/projects/:someId` → PhaseSidebar visible with em-dashes for unscored phases

### After Day 2
- Create a project, generate an SRS with vague requirements, click "Analyze Quality" → quality panel populates with scores < 80 and Gemini explanations
- PhaseSidebar shows `Requirements 67`
- Add a contradictory requirement → run Conflict tab → conflict pair detected with confidence > 0.65
- Dashboard at `/projects/:id` shows updated scores in phase cards

### After Day 3
- ValidationLab → Intelligence tab → paste high-CC Python → defect badge shows "High Risk" with SHAP top-3
- Same paste with SRS requirements in context → traceability matrix renders with coverage_pct
- Stop ml-service → both panels show 503 with last cached result from DB (not in-memory)

### After Day 4
- Click "Run AI Review" → 4 agent cards populate in <8s
- RAG chat → "Which requirement is unimplemented?" returns answer citing SRS line numbers
- `bash scripts/start-all.sh` from clean clone → all services up in <60s (models cached after first run)
- Walk through README demo script start-to-finish without any console errors

---

## Risk Watchlist

| Risk | Mitigation |
|------|------------|
| spaCy/SBERT cold start blocks first request | Lifespan warmup in `main.py` — models load before `/health` returns ok |
| PROMISE dataset download fails on demo Wi-Fi | `train_defect_model.py` ships synthetic 50-row fallback; model is committed to git after first train |
| Gemini rate limits during demo | `services/llm.js` already falls back to Groq; add `GROQ_API_KEY` to `.env` ahead of demo day |
| Backend refactor breaks existing routes | Each route module migrated incrementally with a smoke test before deleting from server.js |
| SBERT model 80MB inflates repo if committed | Add `ml-service/model_cache/` and `*.joblib` to `.gitignore`; `download_models.sh` is idempotent |
| Day 3 (M4) is the biggest single item | If running tight, ship M4a+M4b+M4d only and stub traceability (M4c) as "coming soon" — defect predictor alone is enough wow |

---

## What's NOT in this plan (deferred)

- Real-time analysis as user types (only on-demand buttons)
- Multi-tenancy / roles beyond the existing user-id scope
- Production deployment (Docker, CI/CD)
- M5 Phase Readiness Scorer and M6 SDLC Analytics Dashboard from the original ML plan — replaced by the unified Project Dashboard
- Mobile-responsive layouts (demo is on a laptop)
- WebSocket / live collaboration

These can ship in a follow-up after the demo lands.

---

## GSTACK REVIEW REPORT

| Review | Skill | Scope | Runs | Status | Findings |
|--------|-------|-------|------|--------|----------|
| — | — | — | 0 | NO REVIEWS YET — run `/autoplan` for full plan-review gauntlet | — |
