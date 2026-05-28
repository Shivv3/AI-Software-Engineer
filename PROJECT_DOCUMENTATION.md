# AI Software Engineer - End-to-End Project Documentation

This document describes the full project flow and implementation details across the frontend and backend. It follows the page flow the user experiences (Auth -> Projects -> Workspace -> SDLC phases), and explains which UI elements are connected to which backend endpoints and technologies.

## 1) System Overview

### 1.1 Architecture at a glance

- Frontend: React 18 + Vite + React Router + Axios.
- Backend: Express 5, SQLite (better-sqlite3), session auth, LLM orchestration (Gemini/Groq), doc export (docx), file text extraction (pdf-parse, mammoth), diagram rendering (puppeteer + Mermaid).
- ML service: Python FastAPI (ml-service) provides NLP and code intelligence endpoints. Backend forwards requests to the ML service.

### 1.2 Runtime and ports

- Frontend (Vite dev server): http://localhost:5173
- Backend API: http://localhost:4000
- ML service: http://127.0.0.1:8000

### 1.3 API proxy

The Vite dev server proxies all /api requests to the backend. This allows the frontend to call relative /api routes without CORS issues in local dev.

## 2) Frontend Structure and Core Mechanics

### 2.1 App entry, providers, and global styles

- Entry point renders App inside AuthProvider. This provides session-aware auth state to all routes.
- Global styles are composed from:
  - tokens (color system and design tokens)
  - components (shared button/pill styles)
  - index and App base styles
  - React Quill CSS

### 2.2 Routing and page layout

- Routes:
  - /auth -> AuthPage
  - / -> ProjectsDashboard (protected)
  - /projects/:projectId -> ProjectLayout (protected) with nested pages:
    - index -> UniversalHomePage
    - /requirements -> HomePage
    - /design -> DesignPage
    - /design/system -> SystemDesignWizard
    - /design/schema -> DatabaseSchemaGenerator
    - /design/diagram -> DiagramGenerator
    - /srs-editor -> SRSEditor
    - /implementation -> ImplementationLab
    - /quality -> ValidationLab

### 2.3 AuthContext and API client

- AuthContext:
  - On load, calls /api/auth/me to hydrate user session.
  - Provides login, register, logout helpers.
- API client:
  - Axios with baseURL from VITE_API_BASE (defaults to /api).
  - Sends credentials (cookies) with each request.
  - Auto-redirects to /auth on 401.

### 2.4 ProjectContext and document persistence

ProjectContext is the main state manager inside ProjectLayout.

- Loads project documents from backend: GET /api/projects/:projectId/documents
- Fallback to localStorage if API call fails (project-specific storage key).
- If localStorage has docs and backend has none, it attempts to POST them to the backend.
- Tracks:
  - documents (project artifacts)
  - health metrics (GET /api/projects/:projectId/health)
  - sidebar collapse state
- Document operations:
  - Add: POST /api/projects/:projectId/documents
  - Delete: DELETE /api/projects/:projectId/documents/:docId
  - Toggle context: PATCH /api/projects/:projectId/documents/:docId

### 2.5 Sidebar system

- PhaseSidebar shows SDLC health summary from /api/projects/:projectId/health.
- ProjectSidebar manages documents:
  - Upload file (max ~2.5MB to avoid localStorage quota).
  - Preview (iframe for data URIs or preformatted text).
  - Download (Blob from content).
  - Toggle Use in Context (affects AI prompts).

## 3) Backend Architecture

### 3.1 Express app and security

- Uses express-session with secure cookie in production.
- Auth gating through requireAuth middleware for all /api routes.
- Uses PBKDF2 for password hashing with random salt.

### 3.2 Database schema (SQLite)

Tables:
- users: session-based auth users.
- projects: user-owned projects and SRS content.
- srs_versions: version history of SRS edits.
- srs_sections: section-by-section SRS fragments.
- project_documents: generated and uploaded docs, with use_as_context flag.
- requirements: extracted requirement sentences for traceability and quality.
- design_components: placeholder for design artifact metadata.
- traceability_links: links between requirements and code artifacts.
- ml_results: ML outputs and scores.
- artifact_counters: per-project sequential IDs (REQ-1, etc).
- logs: LLM prompt and response audit trail.

### 3.3 LLM integration

- Providers: Gemini (primary) and Groq (fallback), configured via environment variables.
- Rate limit: 30 requests per minute.
- Prompts are loaded from backend/prompts/*.txt.
- LLM outputs are validated and parsed via llmUtils (JSON extraction + repair).

### 3.4 ML service integration

Backend forwards ML tasks to the Python service:
- /nlp/requirements/analyze
- /nlp/conflict/detect
- /code/defect/predict
- /code/traceability/analyze
- /rag/query

## 4) Page-by-Page Flow

This section walks the SDLC flow as the user experiences it.

### 4.1 Auth Page (/auth)

UI elements:
- Login and Register tabs.
- Login fields: user_id, password.
- Register fields: name, email, user_id, password, confirmPassword, phone_number, age.
- Animated gradient background and glassmorphism card.

Frontend actions:
- Login -> AuthContext.login -> POST /api/auth/login
- Register -> AuthContext.register -> POST /api/auth/register
- On success -> navigate to / (ProjectsDashboard)

Backend endpoints:
- POST /api/auth/register
  - Validates required fields and password length.
  - Creates user and starts session.
- POST /api/auth/login
  - Verifies user_id and password hash.
  - Starts session.
- POST /api/auth/logout
  - Destroys session.
- GET /api/auth/me
  - Returns session user details.

### 4.2 Projects Dashboard (/)

UI elements:
- Header badge and user identity, logout button.
- Project create card with text input and Create Project button.
- Projects grid with project cards, Open Workspace button, Delete button.
- Delete confirmation modal.

Frontend actions:
- Load projects -> GET /api/projects
- Create project -> POST /api/project
- Delete project -> DELETE /api/project/:id
- Open project -> navigate to /projects/:projectId

Backend endpoints:
- GET /api/projects
  - Returns projects for current session user.
- POST /api/project
  - Creates new project (title, project_text).
- DELETE /api/project/:id
  - Deletes project with cascade.

### 4.3 Project Layout and Sidebars (/projects/:projectId)

UI elements:
- Workspace gradient background.
- Grid layout: main content + right sidebar column.
- PhaseSidebar (SDLC Spine) and ProjectSidebar (documents).

Frontend actions:
- ProjectLayout loads project details -> GET /api/project/:id
- ProjectProvider loads documents -> GET /api/projects/:id/documents
- ProjectProvider loads health -> GET /api/projects/:id/health

Backend endpoints:
- GET /api/project/:id
  - Returns project metadata and version count.
- GET /api/projects/:id/documents
  - Returns all documents for the project.
- GET /api/projects/:id/health
  - Returns document count, requirement score, traceability links.

### 4.4 Universal Home (Orchestrator) (/projects/:projectId)

This is the SDLC command center.

UI elements:
- Hero section with project name and intro.
- Phase cards:
  - 1. Requirements and Analysis -> /requirements
  - 2. System Design -> /design
  - 3. Coding and Implementation -> /implementation
  - 4. Testing and Quality -> /quality
- Multi-Agent Review panel.
- RAG Project Memory panel.

Backend connections:
- Multi-Agent Review -> POST /api/ai/reviews/multi-agent
- RAG Project Memory -> POST /api/ai/rag/answer

### 4.5 Requirements and Analysis (/projects/:projectId/requirements)

UI elements:
- Project Information card:
  - Title, Description, Team Size, Timeline, Budget.
- Action buttons:
  - Recommend SDLC
  - Generate Project Plan
  - Generate Implicit Requirements
  - SRS Editor
- ResultsPanel for SDLC, Plan, Implicit Requirements.
- Requirement Decomposer panel.
- Adversarial Stress Tester panel.

Frontend actions:
- Recommend SDLC -> POST /api/sdlc/recommend
- Generate Plan -> POST /api/plan/generate
- Generate Implicit Requirements -> POST /api/plan/generate (same endpoint, different output field)
- Save results to sidebar -> POST /api/projects/:id/documents
- Requirement Decomposer -> POST /api/ai/requirements/decompose
- Adversarial Tester -> POST /api/ai/requirements/adversarial

Backend details:
- /api/sdlc/recommend uses LLM prompt sdlc_prompt.txt and validates with AJV schema.
- /api/plan/generate uses plan_prompt.txt and validates with schema.

### 4.6 SRS Wizard (/projects/:projectId/srs-editor)

The wizard is a multi-step flow:

1) Description
- User enters project description.
- POST /api/project (creates a new project for the wizard session).
- POST /api/srs/generate-questions (LLM, srs_generate_prompt.txt).

2) Questions
- Each subsection has multiple Q/A fields.
- Generate content per subsection -> POST /api/srs/generate-content (srs_content_prompt.txt).
- Save content -> POST /api/srs/save-section

3) Progress
- GET /api/srs/status/:projectId
- POST /api/srs/generate-final/:projectId
- Export -> POST /api/project/:id/export
- Save final SRS to sidebar -> POST /api/projects/:projectId/documents

4) Review
- Final SRS view with Quality Analysis and Conflict Detection.
- Quality Analysis -> POST /api/ml/requirements/analyze
- Conflict Detection -> POST /api/ml/conflict/detect

Notes on data flow:
- The wizard creates a new project when Generate SRS is clicked, then stores section content in that project.
- If you entered via /projects/:projectId/srs-editor, saving the final SRS to the sidebar uses the project in the URL (ProjectContext).

### 4.7 Design Studio (/projects/:projectId/design)

UI elements:
- Three feature cards:
  - System Design Wizard
  - Database Schema Generator
  - Diagram Generator

No backend calls on this page. It only navigates to the detailed tools.

### 4.8 System Design Wizard (/projects/:projectId/design/system)

UI elements:
- Context injection form: cloud preference, legacy tech, team skills, priorities, greenfield toggle.
- Output tabs: high-level design, tech stack, implementation architecture, assumptions, next steps, plus diagram context tabs.

Frontend actions:
- Extract text from context docs via /api/documents/extract-text (PDF/DOCX/text).
- POST /api/design/system with combined SRS/context + form.
- Save to sidebar -> POST /api/projects/:projectId/documents

Backend details:
- /api/design/system uses system_design_prompt.txt and tries to parse JSON.
- If parsing fails, returns raw text as design_text.

### 4.9 Database Schema Generator (/projects/:projectId/design/schema)

UI elements:
- Large textarea for entities, user stories, data notes.
- Output format selector: auto, relational, nosql.
- Result panel with entities, DDL, NoSQL collections, assumptions, sample queries.

Frontend actions:
- Extract text from context docs via /api/documents/extract-text.
- POST /api/design/schema
- Copy SQL/text or save to sidebar.

Backend details:
- /api/design/schema uses database_schema_prompt.txt and returns JSON or raw schema_text.

### 4.10 Diagram Generator (/projects/:projectId/design/diagram)

UI elements:
- Diagram type selector: sequence, ER, dataflow, usecase, architecture.
- Optional project info textarea.
- Output panel showing PNG image (or Mermaid fallback).

Frontend actions:
- Extract text from context docs via /api/documents/extract-text.
- POST /api/design/diagram
- Download PNG or save to sidebar.

Backend details:
- /api/design/diagram uses diagram_generation_prompt.txt.
- Mermaid is rendered into PNG using puppeteer.
- If rendering fails, returns Mermaid code only.

### 4.11 Implementation Lab (/projects/:projectId/implementation)

UI elements:
- Tabs: Generate, Translate, Review.

Generate tab:
- Inputs: description, target language, optional style, include tests.
- POST /api/code/generate
- Actions: Copy, Download, Save, Test, Review.

Translate tab:
- Inputs: source language, target language, source code, optional instructions.
- POST /api/code/translate
- Actions: Copy, Download, Save, Test, Review.

Review tab:
- Inputs: language, optional focus, code.
- POST /api/code/review
- Renders findings, severity chips, recommended fixes.

### 4.12 Quality Center (/projects/:projectId/quality)

UI elements:
- Tabs: Tests and Quality, Intelligence.

Tests and Quality:
- Inputs: language, instructions, code.
- POST /api/code/test
- Displays:
  - Executive summary
  - Overall score
  - Test cases and pass/fail
  - Quality metrics by category
  - Critical issues
  - Recommendations
  - Improved code (optional)
- Save to sidebar as Quality Report.

Intelligence tab:
- Uses CodeIntelligencePanel.
- POST /api/ml/defect/predict
- POST /api/ml/traceability/analyze
- POST /api/ml/defect/refactor

### 4.13 Multi-Agent Review Panel (Universal Home)

- POST /api/ai/reviews/multi-agent
- Runs three LLM prompts in parallel: architect, security, performance.
- Renders summary, risks, and actions per agent.

### 4.14 RAG Project Memory (Universal Home)

- POST /api/ai/rag/answer
- Backend fetches project documents marked use_as_context.
- ML service embeds and retrieves top matches.
- LLM summarizes answer with sources.

## 5) Document Flow and Context Grounding

### 5.1 Document sources

- Generated by LLM tools (Plan, SDLC, Design, Code, Reviews).
- Uploaded by user (PDF, DOCX, images, txt).

### 5.2 Use in context

- Documents can be flagged as use_as_context.
- Most AI tools include these docs when building prompts.
- Non-text files are first converted to text via /api/documents/extract-text.

### 5.3 Traceability

- Requirements are extracted from SRS documents and stored in requirements table.
- Traceability links are produced by ML service based on requirements and code functions.

## 6) Backend Endpoints Summary (by feature)

Auth:
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me

Projects:
- GET /api/projects
- POST /api/project
- GET /api/project/:id
- DELETE /api/project/:id

Documents:
- GET /api/projects/:projectId/documents
- POST /api/projects/:projectId/documents
- PATCH /api/projects/:projectId/documents/:documentId
- DELETE /api/projects/:projectId/documents/:documentId
- POST /api/documents/extract-text

Requirements:
- POST /api/sdlc/recommend
- POST /api/plan/generate
- POST /api/ai/requirements/decompose
- POST /api/ai/requirements/adversarial

SRS:
- POST /api/srs/generate-questions
- POST /api/srs/generate-content
- POST /api/srs/save-section
- GET /api/srs/status/:project_id
- POST /api/srs/generate-final/:project_id
- POST /api/project/:id/export

Design:
- POST /api/design/system
- POST /api/design/schema
- POST /api/design/diagram
- POST /api/design/export

Code:
- POST /api/code/generate
- POST /api/code/translate
- POST /api/code/review
- POST /api/code/test

ML:
- POST /api/ml/requirements/analyze
- POST /api/ml/conflict/detect
- POST /api/ml/defect/predict
- POST /api/ml/traceability/analyze
- POST /api/ml/defect/refactor

GenAI:
- POST /api/ai/reviews/multi-agent
- POST /api/ai/rag/answer

## 7) Key Technologies Used

Frontend:
- React 18, React Router 6
- Axios for API
- React Quill for rich SRS editing
- React Force Graph for conflict visualization
- Vite for dev server and build

Backend:
- Express 5
- better-sqlite3 for persistent storage
- express-session for auth
- docx for exports
- mammoth + pdf-parse for file text extraction
- puppeteer + mermaid (runtime) for diagram rendering
- Ajv for schema validation

LLM providers:
- Gemini 2.5 Flash (primary)
- Groq (fallback)

ML service:
- FastAPI with NLP and defect prediction stack

## 8) Notes and Behavior Details

- All /api routes require session authentication (requireAuth) except for auth endpoints.
- CORS is permissive in development and allows credentials.
- LLM outputs are logged in logs table with prompt and response excerpts.
- Large SRS content is truncated in logs to avoid oversized records.
- Diagram generation normalizes Mermaid code before rendering and falls back to Mermaid output on render errors.
- SRS quality analysis adds LLM explanations for low-quality requirements (best effort).

## 9) Suggested User Flow (Happy Path)

1) Register or Login.
2) Create project on Projects Dashboard.
3) Open project workspace.
4) Use Requirements and Analysis to generate SDLC recommendation and plan.
5) Use SRS Wizard to create structured SRS content and save to sidebar.
6) Use Design Studio tools (system design, schema, diagram) and save outputs to sidebar.
7) Use Implementation Lab to generate or translate code and review.
8) Use Quality Center to test and analyze code quality.
9) Use Code Intelligence for defect risk and traceability.
10) Use Multi-Agent Review and RAG Memory for cross-phase insights.
