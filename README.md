# AI Software Engineer

Full-SDLC workbench for requirements, design, implementation, validation, and ML-backed code intelligence.

## Implemented Feature Layers

- Core SDLC: projects, auth, SRS generation, design generation, diagram/schema generation, implementation lab, validation lab.
- NLP/ML research layer: requirements quality analyzer, semantic conflict detector, defect risk predictor, requirements-to-code traceability, RAG retrieval support.
- GenAI layer: multi-agent review panel, RAG project memory, requirement decomposer, adversarial requirement tester, closed-loop refactor flow.

## Human Inputs Needed

Create `.env` from `.env.example` and fill at least one LLM key:

```env
SESSION_SECRET=use-a-stable-random-32-char-secret
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key_optional_fallback
ML_SERVICE_URL=http://127.0.0.1:8000
```

You also need Python 3.11+ or 3.12, Node.js 20+, npm, and enough disk space for Python ML dependencies. The first ML setup downloads spaCy/SBERT assets and can take several minutes.

## One-Command Run

### Windows PowerShell

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\start-all.ps1
```

This script installs Node dependencies, creates `ml-service\.venv`, installs Python dependencies, prepares models, trains the defect predictor if missing, starts the ML service and backend in the background, then runs the frontend in the foreground.

Open the Vite URL, normally:

```text
http://localhost:5173
```

Stop background services:

```powershell
.\scripts\stop-all.ps1
```

### Git Bash / WSL / Linux / macOS

```bash
bash scripts/start-all.sh
```

Stop background services:

```bash
bash scripts/stop-all.sh
```

## Manual Run

Use this when you want separate terminals.

```powershell
npm --prefix backend install
npm --prefix frontend install
python -m venv ml-service\.venv
ml-service\.venv\Scripts\python.exe -m pip install -r ml-service\requirements.txt
```

Prepare models and train the defect predictor:

```powershell
cd ml-service
.\.venv\Scripts\python.exe -m spacy download en_core_web_sm
.\.venv\Scripts\python.exe train_defect_model.py
cd ..
```

Start services:

```powershell
cd ml-service
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```powershell
cd backend
npm run start
```

```powershell
cd frontend
npm run dev
```

## Smoke Tests

```powershell
npm --prefix frontend run build
node --check backend\server.js
ml-service\.venv\Scripts\python.exe -B -c "import sys; sys.path.insert(0, 'ml-service'); import main; print('ml import ok')"
```

Expected ports:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`
- ML service: `http://127.0.0.1:8000`

## Demo Flow

1. Register or log in.
2. Create/open a project.
3. Generate or save an SRS and mark it as context in the sidebar.
4. In SRS review, run Quality Analysis and Conflict Detection.
5. Generate design/code artifacts and save useful outputs to the sidebar as context.
6. Open Quality Center, paste code, run Tests & Quality.
7. Switch to Intelligence and run Code Intelligence for defect risk plus traceability.
8. Use the workspace home panels for Multi-Agent Reviews and RAG Project Memory.

## Notes

- If SBERT or spaCy models are not downloaded yet, the ML service now falls back to local lightweight analyzers so the app still starts.
- LLM-backed routes still need `GEMINI_API_KEY` or `GROQ_API_KEY`.
- Generated model/cache/runtime folders are ignored by git: `.run/`, `ml-service/.venv/`, `ml-service/model_cache/`, and `ml-service/models/`.
