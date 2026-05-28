# End-to-End Platform UAT Report

Date: 2026-05-29

## Happy Path

1. Register or log in at `/auth`.
2. Create a project at `/`.
3. Open the project workspace at `/projects/:projectId`.
4. Generate or save requirements in `/projects/:projectId/requirements` or `/projects/:projectId/srs-editor`.
5. SRS is auto-saved to the project sidebar as context after final SRS generation.
6. Generate system design at `/projects/:projectId/design/system`.
7. System design is auto-saved to the project sidebar as `system_design` context.
8. Optionally generate database schema at `/projects/:projectId/design/schema`.
9. Optionally generate ER/architecture diagrams at `/projects/:projectId/design/diagram`.
10. Open `/projects/:projectId/generate`.
11. Confirm the inferred tech stack.
12. Create the project file manifest.
13. Preview the file list and deselect optional files such as tests when needed.
14. Generate the selected files.
15. Download the ZIP, save the generated folder locally, or save a generated-project record to the sidebar.
16. Use `/projects/:projectId/quality` for code test generation and review.

## Implemented Path Inventory

### Frontend Routes

| Path | Purpose | UAT Status |
|---|---|---|
| `/auth` | Login and registration | Passed |
| `/` | Project dashboard | Passed |
| `/projects/:projectId` | Universal SDLC home | Passed |
| `/projects/:projectId/requirements` | Requirements and planning workspace | Passed |
| `/projects/:projectId/srs-editor` | Guided SRS generator/editor | Passed by API; UI route present |
| `/projects/:projectId/design` | Design studio launcher | Passed |
| `/projects/:projectId/design/system` | System design wizard | Passed |
| `/projects/:projectId/design/schema` | Database schema generator | Passed |
| `/projects/:projectId/design/diagram` | Mermaid diagram generator | Passed |
| `/projects/:projectId/implementation` | Single-file code generation tools | Passed |
| `/projects/:projectId/generate` | Full project folder generator | Passed |
| `/projects/:projectId/quality` | Test and quality center | Passed |

### Backend API Groups

| API Group | Representative Paths | UAT Status |
|---|---|---|
| Auth | `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` | Passed |
| Projects | `/api/project`, `/api/projects`, `/api/project/:id` | Passed |
| Documents | `/api/projects/:projectId/documents` | Passed |
| Health/traceability | `/api/projects/:projectId/health`, `/api/projects/:projectId/traceability` | Passed |
| SRS | `/api/srs/generate-questions`, `/api/srs/generate-content`, `/api/srs/generate-final/:projectId` | Passed |
| Design | `/api/design/system`, `/api/design/schema`, `/api/design/diagram` | Passed |
| Code tools | `/api/code/generate`, `/api/code/translate`, `/api/code/test`, `/api/code/review` | Passed |
| Project generator | `/api/code/generate-project` | Passed |
| Export | `/api/project/:id/export`, `/api/design/export` | Passed |
| LLM status | `/api/llm/status` | Passed |
| ML/NLP | `/api/ml/*` | Optional service not running during local UAT |

## UAT Scenarios

| Scenario | Expected Result | Result |
|---|---|---|
| Register a new user | User session starts and dashboard loads | Passed |
| Duplicate registration | Backend returns validation error | Passed |
| Create project | Project appears in dashboard | Passed |
| Open workspace | Universal SDLC home renders with phase navigation | Passed |
| Navigate every primary route | Page loads without frontend console errors | Passed |
| Generate SRS final document | SRS content is persisted and auto-saved to sidebar context | Fixed and build-verified |
| Generate system design | Design JSON is auto-saved as `system_design` context | Fixed and build-verified |
| Open project generator without design | UI directs user to design page and disables generation | Passed |
| Open project generator with design | Tech stack is inferred and editable | Passed |
| Create project manifest | Manifest preview appears with source/test/config/documentation files | Passed |
| Deselect tests | Selected file count updates before generation | Passed |
| Generate project files | SSE emits file progress and completion | Passed by backend smoke |
| Preserve schema DDL | `schema.sql` and initial migration copy existing DDL when available | Fixed and passed |
| Download ZIP | ZIP button enables after generation | Passed by UI state; manual download not persisted in test |
| Save to folder unsupported browser | UI hides or explains browser requirement | Passed by implementation check |
| LLM key pool status | 5 Gemini and 2 Groq keys appear with cooldown health | Passed |
| Rate-limit fallback | 429 marks one key cooling down and remaining keys continue | Observed one Gemini key cooldown, service stayed healthy |

## Fixes Made During UAT

1. Downgraded Vite to a Node 20.11-compatible version so the dev server starts locally.
2. Added the Project Generator card to the universal SDLC home.
3. Added automatic SRS sidebar save after final SRS generation.
4. Added automatic System Design sidebar save after design generation.
5. Hardened schema grounding so any generated `schema.sql` or `migrations/001_initial.sql` path preserves the existing DDL.
6. Added explicit UAT coverage for `/api/code/generate-project`.
7. Added a resilient fallback for adversarial requirement testing when LLM output is malformed or providers are temporarily unavailable.

## Latest Regression Results

| Test Run | Result |
|---|---|
| Frontend production build | Passed |
| Backend syntax check | Passed |
| Fast backend API suite, no LLM | 31 passed, 0 failed, 14 skipped |
| Full backend API suite with live LLM calls | 45 passed, 0 failed, 0 skipped |
| Project generator smoke test | Passed |
| Adversarial tester smoke test | Passed |
| Browser route sweep before sandbox change | Primary workspace routes loaded with 0 console errors |

Note: the in-app browser was usable before the sandbox context changed and captured the generator page. After the sandbox switch, the browser runtime could not access the user-profile runtime path, so final visual retest was completed through build/API regression rather than another browser screenshot.

## Why The PR May Still Show Missing Features

The code exists locally, but a PR only shows committed and pushed changes on the PR branch. If the PR was created before these files were committed or if it points at another branch, GitHub will still show the old state.

Key files that must be present in the PR diff:

- `backend/prompts/project_manifest_prompt.txt`
- `backend/prompts/project_file_prompt.txt`
- `frontend/src/components/ProjectGenerator.jsx`
- `frontend/src/components/ProjectGenerator.css`
- `frontend/src/App.jsx`
- `frontend/src/components/PhaseSidebar.jsx`
- `frontend/src/components/UniversalHomePage.jsx`
- `frontend/src/components/SRSEditor.jsx`
- `frontend/src/components/SystemDesignWizard.jsx`
- `backend/server.js`
- `backend/services/llm.js`
- `frontend/package.json`
- `frontend/package-lock.json`
