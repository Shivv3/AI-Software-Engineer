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
| **Universal artifact IDs** | Every artifact gets a stable typed ID: `REQ-N`, `DES-N`, `CARD-N`, `FILE-N`, `TEST-N`. Issued at creation time, never reused. |
| **Traceability storage** | Single `traceability_links` table — `(source_type, source_id) → (target_type, target_id)` with `link_type` and `confidence`. Manual links have confidence=1.0; SBERT-suggested links have the cosine score |
| **Implementation phase shape** | The Kanban Board **replaces** the current ImplementationLab. `/projects/:id/implementation` renders the Board. Code generation, review, and translation move inside each card. |
| **Traceability for defect/coverage** | Structured links (card↔req, file↔card, test↔card) are the **primary source of truth**. SBERT cosine is layered on as **orphan detection** — flags reqs with no linked card, code with no linked req. |
| **Test linkage** | Tests inherit `req_ids` from their parent card automatically. `TEST-N` rows store `card_id` → transitively trace to requirements through `card.req_ids`. |

---

## End-to-End Traceability Spine

This is the connective tissue. Every artifact has a stable typed ID and is linked into the chain:

```
        SRS Editor                  Design Page             Implementation Board       ValidationLab
   ┌──────────────────┐         ┌──────────────────┐       ┌──────────────────┐    ┌──────────────────┐
   │ REQ-1 (shall...) │◀───────▶│ DES-1 Auth Svc   │◀─────▶│ CARD-1 Login API │───▶│ TEST-1 ✓         │
   │ REQ-2 (shall...) │  covers │ DES-2 Payment    │ deriv │ CARD-2 JWT Mwre  │    │ TEST-2 ✗         │
   │ REQ-3 (shall...) │         │ DES-3 Audit Log  │       │ CARD-3 Refresh   │───▶│ TEST-3 ✓         │
   │ REQ-4 (shall...) │         │                  │       │   ↓ produces     │    │ TEST-4 ✓         │
   └──────────────────┘         └──────────────────┘       │ FILE-1 auth.py   │    └──────────────────┘
            │                            │                  └──────────────────┘             │
            │                            │                           │                       │
            └────────────────────────────┴───────────────────────────┴───────────────────────┘
                                                  │
                                                  ▼
                                    ┌─────────────────────────────┐
                                    │  traceability_links table   │
                                    │  (source, target, type)     │
                                    └─────────────────────────────┘
                                                  │
                                                  ▼
                              ┌─────────────────────────────────────────┐
                              │  Traceability Matrix (Dashboard tab)    │
                              │  Coverage · Heatmap · Orphan detection  │
                              └─────────────────────────────────────────┘
```

**How a single requirement's status is computed:**

```
REQ-4 [Authenticate via JWT]
  ├─ implemented?  → has any CARD with this REQ in card.req_ids?  → CARD-1, CARD-2 ✓
  ├─ has code?     → any FILE linked to those cards?              → FILE-1 ✓
  ├─ tested?       → any TEST linked to those cards?              → TEST-1, TEST-3 ✓
  ├─ passing?      → all linked tests last_status='passed'?       → mixed (TEST-2 failing)
  └─ status:       → "Failing" (red badge on matrix)
```

**SBERT plays a secondary role** — it scans for *suspected* gaps the structured links miss (a function whose semantics match a requirement but was never explicitly linked), surfacing them as "Suggested Links" the user can confirm with one click.

---

## Milestone Map (4 days, ~9h each)

| Day | Milestones | Outcome |
|-----|-----------|---------|
| **Day 1** | M0a Design tokens · M0b API client · M0c Backend modularization + auth fix · M0d ml-service scaffold · M0e Persistent sidebar | Foundation: unified visuals, hardened backend, ML service skeleton, integration spine live |
| **Day 2** | M1 Project Dashboard · **M1.5 Universal artifact IDs + traceability tables** · M2 NLP Analyzer · M3 Conflict Detector | Stable IDs across all artifacts, dashboard live, first two ML features shipping |
| **Day 3** | **M4 Implementation Board** (replaces ImplementationLab) · **M4.5 Test integration with cards** · **M5 Traceability Matrix view** | End-to-end traceability live: SRS → Design → Cards → Code → Tests, visualized in one matrix |
| **Day 4** | **M6 Code Intelligence (defect predictor + SBERT orphan detection)** · M7 RAG Memory · M8 Multi-Agent Reviews · M9 Demo polish | Research credibility (defect ML), Layer-3 GenAI features, demo-ready |

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

## M1.5 — Universal Artifact IDs + Traceability Tables (~1h)

**Goal:** Every artifact (requirement, design component, card, file, test) has a stable typed ID. One table records every link between them. This is the spine of end-to-end traceability.

### Schema additions (in `backend/db/schema.js`)

```sql
-- Tracks the next ID counter per project per type
CREATE TABLE IF NOT EXISTS artifact_counters (
  project_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,   -- 'REQ' | 'DES' | 'CARD' | 'FILE' | 'TEST'
  next_id INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, artifact_type)
);

-- Requirements parsed from SRS (one row per "shall" sentence)
CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  req_id TEXT NOT NULL,           -- 'REQ-1', 'REQ-2'
  text TEXT NOT NULL,
  section TEXT,                    -- 'functional' | 'non-functional' | 'security' | ...
  quality_score INTEGER,           -- last NLP analyzer score
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, req_id)
);

-- Design components extracted from system design doc
CREATE TABLE IF NOT EXISTS design_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  des_id TEXT NOT NULL,            -- 'DES-1' (auth service, payment service, etc.)
  name TEXT NOT NULL,
  type TEXT,                       -- 'service' | 'table' | 'api' | 'module'
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, des_id)
);

-- Universal links table (the spine)
CREATE TABLE IF NOT EXISTS traceability_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  source_type TEXT NOT NULL,       -- 'requirement' | 'design' | 'card' | 'file' | 'test'
  source_id TEXT NOT NULL,         -- 'REQ-1', 'CARD-3', etc.
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  link_type TEXT NOT NULL,         -- 'implements' | 'tests' | 'covers' | 'derived_from'
  confidence REAL DEFAULT 1.0,     -- 1.0 = manual/structured, <1.0 = SBERT-suggested
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, source_type, source_id, target_type, target_id, link_type)
);
CREATE INDEX IF NOT EXISTS idx_trace_source ON traceability_links(project_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_trace_target ON traceability_links(project_id, target_type, target_id);
```

### Backfill from existing SRS

When SRS is finalized (`/api/srs/generate-final` already exists), add a hook that:
1. Parses `srs_content` for sentences containing "shall" or "must"
2. Inserts each as a `requirements` row with auto-incremented `REQ-N` from `artifact_counters`
3. Re-runs on every SRS approval — IDs are stable (text match preserves prior assignments; new sentences get new IDs)

### Helper service: `backend/services/artifacts.js`

```javascript
export function issueId(projectId, type) {
  // atomic increment of artifact_counters; returns 'REQ-7', 'CARD-3', etc.
}
export function linkArtifacts(projectId, source, target, linkType, confidence = 1.0) {
  // INSERT OR IGNORE into traceability_links
}
export function getLinks(projectId, { sourceType, sourceId, targetType, targetId, linkType } = {}) {
  // flexible query for any link slice
}
export function getCoverage(projectId, artifactType) {
  // returns { covered: N, total: M, orphans: [...] }
}
```

### NLP analyzer integration (modifies M2)

When M2 runs, the analyzer receives `requirements` rows directly (with stable IDs) instead of raw sentence strings. Quality scores update `requirements.quality_score` per row. The "Quality" panel in SRSEditor now shows `REQ-3: 67 — fix the vague term 'fast'` instead of just the sentence.

### Design component extraction (extends Design phase)

After `POST /api/design/system` returns, parse the design doc for component names (use a simple regex on headings like `## Auth Service` or `### Payment Gateway`, plus the LLM can be asked to output JSON with `components: [{name, type, description}]`). Insert as `design_components` rows with `DES-N` IDs.

**Acceptance:**
- After SRS generation, `SELECT * FROM requirements WHERE project_id = ?` returns one row per "shall" sentence with stable `REQ-N` IDs
- After Design generation, `SELECT * FROM design_components` shows extracted components
- `linkArtifacts(p, {type:'card', id:'CARD-1'}, {type:'requirement', id:'REQ-4'}, 'implements')` creates the link
- `getLinks(p, {sourceType:'requirement', sourceId:'REQ-4'})` returns all downstream artifacts

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

# DAY 3 — Implementation Board + End-to-End Traceability

## M4 — Implementation Board (replaces ImplementationLab) (~4h)

**Goal:** Convert design artifacts into a Kanban-style board of implementation cards. Each card is linked to specific requirements and design components, and clicking "Generate Code" produces design-aware code that lands as a tracked file.

### M4a — Schema additions (~15min)

Add to `backend/db/schema.js`:

```sql
CREATE TABLE IF NOT EXISTS implementation_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  card_id TEXT NOT NULL,             -- 'CARD-1'
  epic TEXT NOT NULL,                -- 'Auth System', 'Payment Service'
  title TEXT NOT NULL,
  description TEXT,
  complexity TEXT,                    -- 'S' | 'M' | 'L'
  status TEXT DEFAULT 'todo',         -- 'todo' | 'in_progress' | 'generated' | 'reviewed' | 'done'
  position INTEGER DEFAULT 0,
  acceptance_criteria TEXT,           -- JSON array of strings
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, card_id)
);

CREATE TABLE IF NOT EXISTS project_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  file_id TEXT NOT NULL,              -- 'FILE-1'
  card_id TEXT,                       -- the card that produced this file
  path TEXT NOT NULL,                  -- 'backend/auth.py'
  language TEXT,                       -- 'python' | 'javascript' | ...
  content TEXT NOT NULL,
  defect_risk_score REAL,              -- last M6 prediction (0-1)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, file_id)
);
```

### M4b — Breakdown endpoint (~45min)

**`POST /api/implementation/breakdown`** (in `backend/routes/implementation.js`):

```javascript
// Inputs: project_id
// Reads: latest SRS, system_design, schema, requirements[], design_components[]
// Calls Gemini with a prompt that returns strict JSON:
//   { epics: [{ name, cards: [{ title, description, complexity, req_ids: ['REQ-1','REQ-3'],
//                              design_ids: ['DES-2'], acceptance_criteria: ['...']}]}]}
// For each card returned:
//   - issueId(p, 'CARD') → card_id
//   - INSERT into implementation_cards
//   - For each req_id: linkArtifacts(p, {card_id}, {requirement, req_id}, 'implements')
//   - For each des_id: linkArtifacts(p, {card_id}, {design, des_id}, 'derived_from')
```

**Prompt:** `backend/prompts/breakdown.txt` — instructs Gemini to:
1. Group functionality into 3-6 epics
2. For each epic, produce 2-5 cards with vertical-slice scope (one card ≈ one PR)
3. Each card MUST cite `req_ids` and `design_ids` it implements
4. Output strict JSON (uses existing `parseLLMJson`)

### M4c — Card-to-code generation (~1h)

**`POST /api/implementation/cards/:cardId/generate-code`**:

```javascript
// 1. Load card + linked requirements + linked design components
// 2. Build context: { srs_excerpts, design_excerpts, schema, tech_stack, card }
// 3. Call existing llm.generate() with code-gen prompt (reuses /api/code/generate logic)
// 4. Suggest file path (e.g., 'backend/auth.py') — LLM returns this
// 5. issueId(p, 'FILE') → file_id; INSERT into project_files
// 6. linkArtifacts(p, {file_id}, {card_id}, 'implements')
// 7. UPDATE card.status = 'generated'
// 8. Return { file_id, path, content, linked_requirements }
```

### M4d — Frontend: Kanban Board (~2h)

**Replace** [frontend/src/components/ImplementationLab.jsx](frontend/src/components/ImplementationLab.jsx) with `ImplementationBoard.jsx`:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Implementation Board                  [Re-generate cards] [+ Add card] │
├────────────────────────────────────────────────────────────────────────┤
│ EPIC: Auth System                                                       │
│ ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│ │  TODO      │  │  IN PROG   │  │ GENERATED  │  │  DONE      │        │
│ │            │  │            │  │            │  │            │        │
│ │ CARD-1     │  │ CARD-2     │  │ CARD-3     │  │ CARD-4     │        │
│ │ User Login │  │ JWT Mwre   │  │ Reset Pwd  │  │ Logout API │        │
│ │ M · REQ-4  │  │ S · REQ-4  │  │ M · REQ-7  │  │ S · REQ-5  │        │
│ │ [Generate]│  │ [Generate]│  │ [View Code]│  │ ✓ 3 tests  │        │
│ └────────────┘  └────────────┘  └────────────┘  └────────────┘        │
│                                                                         │
│ EPIC: Payment Service                                                   │
│ ...                                                                     │
└────────────────────────────────────────────────────────────────────────┘
```

**Card detail drawer** (opens on click):
- Title, description, complexity badge
- Linked requirements (clickable chips → opens SRS panel showing that REQ)
- Linked design components (chips → opens design doc)
- Acceptance criteria checklist
- Generated code (Monaco-lite viewer with syntax highlighting via `prismjs` — already used elsewhere or add)
- Buttons: "Generate Code" | "Regenerate" | "Generate Tests" | "Mark Done"

Drag-and-drop between columns via `react-beautiful-dnd` (or `@hello-pangea/dnd` — drop-in fork, well-maintained).

**Dashboard wiring:** Implementation phase card shows `{N} cards · {M}% done`. PhaseSidebar score = % cards in "done" status.

**Acceptance:**
- Click "Re-generate cards" → cards populate within 8s, each linked to specific REQ-N
- Click a card → drawer opens showing linked requirements as chips
- Click "Generate Code" → code appears in drawer + a `project_files` row created
- Drag card to "Done" → status persists, sidebar % updates

---

## M4.5 — Testing Integration with Cards (~2h)

**Goal:** ValidationLab's test generation now operates per-card. Tests inherit the card's `req_ids` so a passing/failing test traces back to specific requirements.

### M4.5a — Schema (~10min)

```sql
CREATE TABLE IF NOT EXISTS test_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  test_id TEXT NOT NULL,             -- 'TEST-1'
  card_id TEXT NOT NULL,             -- inherits req_ids transitively
  file_id TEXT,                       -- the source file being tested
  name TEXT NOT NULL,                 -- 'test_login_with_valid_credentials'
  code TEXT NOT NULL,
  framework TEXT,                     -- 'pytest' | 'jest' | 'unittest'
  last_status TEXT DEFAULT 'pending', -- 'passed' | 'failed' | 'pending'
  last_run_at DATETIME,
  failure_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, test_id)
);
```

### M4.5b — Generation endpoint (~45min)

**`POST /api/implementation/cards/:cardId/generate-tests`**:

```javascript
// 1. Load card + its generated file + linked requirements
// 2. Build prompt: "Generate {framework} tests for the following code that verify
//    these requirements: {req texts}. Output JSON array of {name, code}."
// 3. Parse → for each test:
//    - issueId(p, 'TEST') → test_id
//    - INSERT test_cases (card_id = card, file_id = file)
//    - linkArtifacts(p, {test_id}, {card_id}, 'tests')
//    - For each req in card.req_ids: linkArtifacts(p, {test_id}, {req_id}, 'verifies')
// 4. Return list of test IDs + names
```

### M4.5c — Test execution (~30min)

**`POST /api/implementation/tests/run`** — runs a list of tests (or all for a project).

For Python: spawns `pytest` in a temp dir against the assembled `project_files` of language `python`. Captures pass/fail per test and updates `test_cases.last_status`.

For JS: spawns `node` with a tiny in-process assertion harness (avoid full jest install on demo) OR use `vitest --run` if already available.

**Demo simplification:** If real execution is too risky, fall back to "AI-evaluated tests" — Gemini gets the code + tests and returns a JSON `{test_id, status, reason}`. Less rigorous but always works in a demo.

### M4.5d — ValidationLab UI changes (~45min)

[frontend/src/components/ValidationLab.jsx](frontend/src/components/ValidationLab.jsx) gets restructured:

```
┌────────────────────────────────────────────────────────┐
│ ValidationLab                                           │
├────────────────────────────────────────────────────────┤
│ Tests · Intelligence (Day 4) · Coverage                │
├────────────────────────────────────────────────────────┤
│ TESTS TAB                                               │
│                                                         │
│ Filter by card: [All ▼] [Run All Tests]                │
│                                                         │
│ ✓ TEST-1  test_login_valid          CARD-1 → REQ-4    │
│ ✗ TEST-2  test_login_invalid_pwd    CARD-1 → REQ-4    │
│   └ AssertionError: expected 401, got 500              │
│ ✓ TEST-3  test_jwt_expiry           CARD-2 → REQ-4    │
│ ✓ TEST-4  test_password_reset       CARD-3 → REQ-7    │
│                                                         │
│ Summary: 12/15 passing (80%)                            │
└────────────────────────────────────────────────────────┘
```

Each row shows the full trace: `TEST → CARD → REQ`. Click any chip → opens that artifact.

**Dashboard wiring:** Quality phase score = % tests passing. Click a failing test → opens drawer with the failing requirement highlighted ("REQ-4 is at risk").

**Acceptance:**
- Click "Generate Tests" on a card → tests appear in `test_cases`
- Run tests → pass/fail recorded with timestamps
- Failing test shows full trace back to requirement
- Quality phase score on dashboard reflects pass rate

---

## M5 — Traceability Matrix View (the unifier) (~2h)

**Goal:** One view that proves end-to-end traceability. Lives on the Project Dashboard as the **"Traceability" tab** (third tab next to Overview and Reviews).

### M5a — Aggregation endpoint (~30min)

**`GET /api/projects/:id/traceability`** returns:

```json
{
  "requirements": [
    {
      "req_id": "REQ-1",
      "text": "The system shall authenticate users via JWT",
      "quality_score": 92,
      "linked_cards": ["CARD-1", "CARD-2"],
      "linked_files": ["FILE-1", "FILE-3"],
      "linked_tests": ["TEST-1", "TEST-2", "TEST-3"],
      "test_pass_rate": 1.0,
      "status": "implemented"   // 'unimplemented' if no cards, 'untested' if no tests, 'failing' if any test fails
    }
  ],
  "orphan_code": [               // SBERT augmentation: files with no card link or low similarity
    { "file_id": "FILE-7", "path": "backend/utils.py", "reason": "no card link" }
  ],
  "coverage_summary": {
    "total_requirements": 14,
    "implemented": 11,
    "tested": 9,
    "passing": 8,
    "coverage_pct": 78.6
  }
}
```

### M5b — Three visualizations (~1.5h)

**1. Heatmap (default view):**

```
                  CARD-1  CARD-2  CARD-3  CARD-4    Files   Tests   Status
REQ-1 [Auth]       ●       ●                         2       3 ✓    Implemented
REQ-2 [Payments]            ●       ●                2       4 ✓    Implemented
REQ-3 [Logging]                              ●        1       0     Untested ⚠
REQ-4 [GDPR]                                         0       0      UNIMPLEMENTED ✗
REQ-5 [Reports]    ●                ●                2       2 ✗    Failing 🔴
```

Cells colored using design tokens (`--color-success/warn/danger`).

**2. Sankey diagram** (optional, time permitting): `recharts` Sankey component showing flow from Requirements → Cards → Files → Tests with width = link count.

**3. Coverage table:** Sortable list of requirements with status badges, click-to-expand showing the full downstream chain.

### M5c — Frontend component

**`frontend/src/components/TraceabilityMatrix.jsx`** — mounted in the dashboard's "Traceability" tab. Tabs at the top: `Heatmap | Sankey | Coverage`. Filter controls: epic, status, quality score range.

**SBERT augmentation:** Background call to `/api/ml/orphans/detect` — passes all requirements + all `project_files` content, returns suspected mismatches:
- Requirements with `linked_cards=[]` but the LLM auto-suggests "REQ-7 looks similar to FILE-3's content (cosine 0.72) — maybe link?"
- Files with no card link
- A "Suggested Links" panel below the matrix; user clicks "Confirm" → `linkArtifacts(... confidence=0.72)`

**Acceptance:**
- Open Traceability tab → matrix renders with real coverage
- Unimplemented requirements show as red rows
- Click any REQ → drawer shows the full chain (REQ → cards → files → tests + statuses)
- "Suggested Links" panel surfaces SBERT augmentations from M6 (once M6 ships)

---

# DAY 4 — ML Defect, Layer 3 GenAI, Polish

## M6 — Code Intelligence: Defect Predictor + SBERT Orphan Detection (~2.5h)

Implements [2026-05-21-code-intelligence-panel-design.md](2026-05-21-code-intelligence-panel-design.md) — **scoped down**: structured traceability already lives in M4/M4.5/M5, so this milestone delivers (a) the ML defect predictor and (b) SBERT-based **orphan detection** as augmentation on top of the structured links.

### M6a — Train defect model (~1h)

- `ml-service/code_intel/train_defect_model.py`
  - Downloads PROMISE ARFF (kc1, kc2, pc1) from `klainfo/DefectData`
  - Trains `RandomForestClassifier(n_estimators=100, class_weight='balanced', random_state=42)` on 5 features: CC, Halstead Volume, Halstead Effort, LOC, n_functions
  - Saves `defect_rf_v1.joblib` + `model_metadata.json` (AUC, F1, P, R)
  - Synthetic 50-row fallback if download fails
- Run once at setup: `cd ml-service && python -m code_intel.train_defect_model`

### M6b — Defect inference endpoint (~45min)

- `ml-service/code_intel/radon_features.py` — Python: real radon; JS/other: regex CC approximation
- `ml-service/code_intel/defect_predictor.py` — load joblib, `predict_proba`, SHAP TreeExplainer top-3 features
- `ml-service/main.py` — `POST /code/defect/predict`
- `backend/routes/ml.js` — `POST /api/ml/defect/predict`
- **Trigger:** runs automatically when a card's code is generated (M4c). Stores `defect_risk_score` directly on `project_files`. UI on the card drawer shows risk badge + SHAP factors.

### M6c — SBERT orphan detection (~45min)

- `ml-service/code_intel/orphan_detector.py` — SBERT-encode all `requirements` and `project_files`, cosine matrix, flag:
  - Requirements with `linked_cards=[]` AND cosine to any file < 0.45 → confirmed orphan ("unimplemented")
  - Files with cosine < 0.45 to any requirement → orphan code ("no stated requirement")
  - Pairs with cosine > 0.65 but no structured link → "Suggested Link" (user can confirm)
- `ml-service/main.py` — `POST /code/orphans/detect`
- `backend/routes/ml.js` — `POST /api/ml/orphans/detect`
- Surfaced in **M5's Traceability Matrix** "Suggested Links" panel

**Acceptance:**
- After code generation on a card, defect risk badge appears in the drawer
- Click "Detect Orphans" on the Traceability tab → suggested links populate with confidence scores
- Quality phase score on dashboard combines: test pass rate (60%) + (1 - avg defect risk) (40%)

---

## M7 — RAG Project Memory (~2h)

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

## M8 — Multi-Agent Review + Adversarial Stress-Tester (~2h)

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

## M9 — Demo Polish + Startup Script + Seed Project (~2h)

### M9a — Unified startup script (~30min)

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

### M9b — README rewrite (~30min)

Replace existing README with:
- 30-second pitch: "AI-Software-Engineer is a full-SDLC autonomous workbench. Three intelligence layers..."
- 1-command setup: `bash scripts/start-all.sh`
- Architecture diagram (ASCII)
- Feature list with screenshots placeholders
- Demo walkthrough script (10 steps)

### M9c — Seed demo project (~1h)

Add a "Create Demo Project" button on ProjectsDashboard that, in one click, creates a project with:
- A pre-loaded SRS with intentional flaws (some vague terms, one conflict pair)
- Sample code with one high-CC function
- A few uploaded docs

This means a demo can show all features without typing.

Implementation: `POST /api/projects/seed-demo` endpoint that runs the inserts.

### M9d — Loading skeletons & empty states (~1h)

Every ML panel currently renders nothing while loading. Add `<SkeletonRows count={N} />` shared component (uses `--bg-input` shimmer animation). Apply to:
- Quality panel, Conflict panel, Code Intelligence panel, RAG chat, Reviews tab

### M9e — End-to-end smoke pass

Walk through the demo script with all 4 ML services running. Fix anything that looks janky. Capture 3-5 screenshots for the README.

---

## Critical Files to Modify (summary table)

### Frontend

| File | Changes |
|------|---------|
| [frontend/src/main.jsx](frontend/src/main.jsx) | Import tokens.css, components.css; wrap App in AuthProvider |
| `frontend/src/styles/tokens.css` | **NEW** — design tokens |
| `frontend/src/styles/components.css` | **NEW** — shared btn/card/badge classes |
| `frontend/src/lib/api.js` | **NEW** — unified axios |
| `frontend/src/contexts/AuthContext.jsx` | **NEW** |
| `frontend/src/components/PhaseSidebar.jsx` | **NEW** — integration spine |
| `frontend/src/components/ProjectDashboard.jsx` | Rename + rebuild from UniversalHomePage; three tabs: Overview · Traceability · Reviews |
| `frontend/src/components/ImplementationBoard.jsx` | **NEW** — Kanban board, **replaces** ImplementationLab |
| `frontend/src/components/CardDrawer.jsx` | **NEW** — card detail with code viewer, linked artifacts |
| `frontend/src/components/TraceabilityMatrix.jsx` | **NEW** — heatmap/sankey/coverage views |
| `frontend/src/components/ConflictPanel.jsx` | **NEW** — used inside SRSEditor |
| `frontend/src/components/RagChat.jsx` | **NEW** |
| `frontend/src/components/AgentReviewsPanel.jsx` | **NEW** |
| [frontend/src/components/SRSEditor.jsx](frontend/src/components/SRSEditor.jsx) | Add Quality + Conflicts tabs; use REQ-N IDs everywhere |
| [frontend/src/components/ValidationLab.jsx](frontend/src/components/ValidationLab.jsx) | Restructure: Tests tab (per-card), Intelligence tab, Coverage tab |
| [frontend/src/components/ProjectLayout.jsx](frontend/src/components/ProjectLayout.jsx) | Mount PhaseSidebar |
| [frontend/src/components/ImplementationLab.jsx](frontend/src/components/ImplementationLab.jsx) | **DELETE** (replaced by ImplementationBoard) |
| All component `*.css` | Replace hex codes with tokens |

### Backend

| File | Changes |
|------|---------|
| [backend/server.js](backend/server.js) | Reduce to slim bootstrap (~150 lines) |
| `backend/routes/auth.js` | **NEW** — extracted |
| `backend/routes/projects.js` | **NEW** — extracted + adds `/health`, `/activity`, `/traceability` |
| `backend/routes/srs.js` | **NEW** — extracted + parses requirements into `requirements` table on save |
| `backend/routes/design.js` | **NEW** — extracted + extracts components into `design_components` table |
| `backend/routes/code.js` | **NEW** — extracted (translate, review utilities only — generation moves to implementation routes) |
| `backend/routes/implementation.js` | **NEW** — `/breakdown`, `/cards/:id/generate-code`, `/cards/:id/generate-tests`, `/tests/run`, card CRUD |
| `backend/routes/documents.js` | **NEW** — extracted extract-text |
| `backend/routes/ml.js` | **NEW** — all `/api/ml/*` proxy routes |
| `backend/middleware/requireAuth.js` | **NEW** |
| `backend/middleware/errorHandler.js` | **NEW** |
| `backend/services/llm.js` | Keep, extend prompts |
| `backend/services/mlClient.js` | **NEW** — proxy + health poll |
| `backend/services/cache.js` | **NEW** — DB-backed fallback reads |
| `backend/services/artifacts.js` | **NEW** — issueId, linkArtifacts, getLinks, getCoverage |
| `backend/db/schema.js` | **NEW** — central CREATE TABLE: `ml_results`, `rag_chunks`, `artifact_counters`, `requirements`, `design_components`, `traceability_links`, `implementation_cards`, `project_files`, `test_cases` |
| `backend/prompts/breakdown.txt` | **NEW** — design → epics/cards |
| `backend/prompts/generate-card-code.txt` | **NEW** — design-aware code-gen |
| `backend/prompts/generate-card-tests.txt` | **NEW** — test gen with req context |
| `backend/prompts/agents/*.txt` | **NEW** — architect, security, performance, adversarial |

### ML Service

| File | Purpose |
|------|---------|
| `ml-service/main.py` | FastAPI app with lifespan warmup |
| `ml-service/requirements.txt` | fastapi, uvicorn, spacy, sentence-transformers, scikit-learn, shap, radon, networkx, numpy |
| `ml-service/schemas.py` | All Pydantic request/response models |
| `ml-service/shared/spacy_loader.py`, `model_cache.py` | Singletons reused across features |
| `ml-service/nlp/requirements_analyzer.py` | M2 |
| `ml-service/nlp/conflict_detector.py`, `negation_analyzer.py` | M3 |
| `ml-service/code_intel/defect_predictor.py`, `radon_features.py` | M6a/b |
| `ml-service/code_intel/orphan_detector.py` | M6c |
| `ml-service/code_intel/train_defect_model.py` | One-shot training |
| `ml-service/rag/indexer.py`, `retriever.py` | M7 |
| `ml-service/scripts/download_models.sh` | spaCy + SBERT idempotent download |

### Repo root

| File | Changes |
|------|---------|
| `scripts/start-all.sh`, `stop-all.sh` | **NEW** — orchestrated startup |
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
- `/implementation` route shows the Kanban Board (old ImplementationLab gone)
- Click "Generate Implementation Cards" → 3-6 epics with cards appear within 10s, each linked to specific REQ-N IDs
- Click a card → drawer shows linked requirements as chips (clickable)
- Click "Generate Code" → code appears + `project_files` row + link recorded
- Click "Generate Tests" → `test_cases` rows appear, each test traces back to a card → requirement
- Run tests → ValidationLab Tests tab shows pass/fail with full trace (`TEST-2 → CARD-1 → REQ-4`)
- Open Dashboard → Traceability tab → matrix shows REQ rows × CARD cols with colored cells; orphans flagged
- Quality phase score on dashboard updates based on test pass rate

### After Day 4
- After card code generation, defect risk badge appears on card with SHAP top-3 factors
- Click "Detect Orphans" on Traceability tab → SBERT-suggested links surface in "Suggested Links" panel
- Click "Run AI Review" → 4 agent cards populate in <8s
- RAG chat → "Which requirement is unimplemented?" returns answer citing REQ-N IDs + filename evidence
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
| Day 3 (M4 Board) is the biggest single item | If running tight, ship M4a-c only (board + breakdown + code-gen), defer drag-and-drop reordering to Day 4 polish |
| Test execution flakiness on demo | Default to AI-evaluated tests (Gemini scores pass/fail from reading the test+code). Real pytest execution is opt-in via a "Run with pytest" toggle |
| LLM hallucinated REQ-N IDs in card breakdown | Validate against `requirements` table on insert; reject cards that reference non-existent IDs and re-prompt once |
| Card breakdown produces too few or too many cards | Prompt explicitly asks for "vertical-slice scope, 8-15 cards total across 3-6 epics"; user can re-run or manually add/edit cards |

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
