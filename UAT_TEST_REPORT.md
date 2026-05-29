# AI Software Engineer UAT Report

Date: 2026-05-29

## End-to-End Happy Path

1. Start backend on `http://localhost:4000` and frontend on `http://127.0.0.1:5173`.
2. Register a new user from `/auth`.
3. Land on `/` and create a project.
4. Open `/projects/:projectId`.
5. Enter Requirements workspace at `/projects/:projectId/requirements`.
6. Generate a project plan from project title, description, team size, timeline, and budget.
7. Save the generated plan to the project sidebar/context.
8. Navigate through design, implementation, generated-folder, SRS editor, and quality routes.
9. Run backend UAT API suite, including auth, project CRUD, document CRUD, SDLC, SRS, design, code, insights, AI review, RAG-adjacent context flows, export, delete, and user isolation.

## Frontend Routes Covered

- `/auth` - login/register forms, registration success, session redirect.
- `/` - protected projects dashboard, project creation, project listing, logout surface.
- `/projects/:projectId` - universal workspace home, phase cards, AI review and memory panels.
- `/projects/:projectId/requirements` - requirements form, plan generation, result rendering, save-to-sidebar.
- `/projects/:projectId/design` - design studio entry cards.
- `/projects/:projectId/design/system` - system design wizard shell and controls.
- `/projects/:projectId/design/schema` - schema generator shell and controls.
- `/projects/:projectId/design/diagram` - diagram type selector and diagram generator shell.
- `/projects/:projectId/srs-editor` - SRS wizard entry state.
- `/projects/:projectId/implementation` - code generation, translation, and review lab shell.
- `/projects/:projectId/generate` - runnable code folder generator empty-design-doc state.
- `/projects/:projectId/quality` - test generation and intelligence tabs.

## Backend API Scenarios Covered

- Auth: register, duplicate user ID, duplicate email, short password, login, logout, current user, unauthenticated rejection.
- Projects: create, list, get, get missing, versions, unauthenticated rejection, delete, user isolation.
- Project documents: create, list, patch, delete, missing fields, missing document.
- SDLC and planning: recommend SDLC, generate milestones, generate implicit requirements, missing input validation.
- SRS: generate questions, generate content, save section, list sections, status, final document, edit, apply, versions.
- Design: system design, database schema, diagram generation, design export, invalid diagram type, missing input.
- Code: generate, translate, test, review, missing-field validation.
- Document extraction: plain text, text data URI, missing content, unsupported file type.
- Insights: health, traceability, requirements sync, missing project.
- AI features: multi-agent review, requirement decomposition, adversarial stress test, no-context validation.
- ML proxy routes: requirements analysis, conflict detection, defect prediction, traceability validation; positive ML calls skipped because the Python ML service was not running.
- Export and cleanup: project export, missing project export, document cleanup, project deletion.

## Bugs Found and Fixed

1. Backend startup failed because `backend/server.js` contained unresolved merge conflict markers around a duplicate disabled diagram handler.
   - Fix: removed the dead conflict block and kept the active `/api/design/diagram` route.
   - Retest: `node --check backend/server.js` passed; backend UAT reached diagram generation successfully.

2. Frontend production build failed because the installed dependencies did not include `fflate` even though it was declared in `frontend/package.json`.
   - Fix: refreshed frontend dependencies with `npm --prefix frontend install`.
   - Retest: `npm --prefix frontend run build` passed.

3. `/api/code/generate` returned 500 when an LLM response had malformed JSON escaping.
   - Fix: removed a stray patch sentinel from `backend/prompts/code_generate_prompt.txt` and added a safe fallback in the route to return extracted generated code when JSON parsing fails.
   - Retest: focused `/api/code/generate` call returned 200 with code; full backend UAT passed.

4. Requirements workspace inputs relied on placeholder-only accessible names.
   - Fix: added explicit `aria-label` attributes for project title, description, team size, timeline, and budget.
   - Retest: browser automation found `Project Title` by label and no console errors.

## Retest Results

- `node --check backend/server.js`: passed.
- `npm --prefix frontend run build`: passed.
- `node uat-test.js`: 130 passed, 0 failed, 4 skipped.
- Browser route sweep: all frontend routes listed above rendered without local console errors.
- Browser happy path: registration, project creation, workspace navigation, requirements plan generation, and save-to-sidebar passed.

## Skips and Residual Risks

- ML positive-path calls were skipped because `ml-service` was not running on `127.0.0.1:8000`; request validation and graceful 503 behavior passed.
- Frontend build still reports a large bundle warning for the main JS chunk. This is not a functional failure, but code splitting would improve load performance.

## Screenshot Evidence

- `test-artifacts/workspace-home.png`
- `test-artifacts/requirements-page.png`
- `test-artifacts/quality-page.png`
