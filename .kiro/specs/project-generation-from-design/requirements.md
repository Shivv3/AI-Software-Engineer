# Requirements Document

## Introduction

This feature adds end-to-end project code generation to the AI Software Engineer platform. Starting from a saved system design document, the user can navigate to a dedicated generation page, confirm or override the inferred tech stack, and trigger a backend pipeline that produces a complete, runnable project. The backend orchestrates two LLM calls per file — first a manifest pass that enumerates every file to be created, then a per-file code generation pass — streaming progress to the frontend via Server-Sent Events (SSE). The frontend displays a live progress bar and, on completion, offers the user a ZIP download or a direct folder save via the File System Access API. To sustain throughput during large generations, the Gemini provider in `llm.js` is extended to support a pool of up to four API keys with round-robin rotation and per-key 429 cooldown.

## Glossary

- **ProjectGenerator**: The React component rendered at `/projects/:projectId/generate` that drives the generation workflow.
- **GenerationRoute**: The Express route `POST /api/code/generate-project` that orchestrates manifest generation, per-file code generation, and SSE streaming.
- **GeminiKeyPool**: The set of Gemini API keys (`GEMINI_API_KEY_1` through `GEMINI_API_KEY_4`) managed inside `llm.js` with round-robin selection and per-key cooldown.
- **ManifestPrompt**: The prompt template file `project_manifest_prompt.txt` that instructs the LLM to return a file manifest array.
- **FilePrompt**: The prompt template file `project_file_prompt.txt` that instructs the LLM to return the source code for a single file.
- **FileManifest**: A JSON array where each element contains `path`, `purpose`, `component`, and `language` fields describing one file to be generated.
- **SSEStream**: A Server-Sent Events response on `POST /api/code/generate-project` that emits progress events as each file is generated.
- **DesignDocument**: A project document of type `system_design` stored in the `project_documents` table and displayed in the context sidebar.
- **TechStackConfirmation**: A UI step shown before generation begins that displays the tech stack inferred from the design document's `tech_stack` field and allows the user to edit it.
- **ZipBundle**: A `.zip` archive containing all generated files at their manifest-specified paths, offered as a browser download on generation completion.
- **FileSystemSave**: A folder write operation using the browser's File System Access API (`showDirectoryPicker`) that saves all generated files directly to a user-chosen local directory.

---

## Requirements

### Requirement 1: Gemini Key Pool with Round-Robin Rotation

**User Story:** As a backend developer, I want the Gemini provider to distribute requests across multiple API keys so that rate limits on a single key do not stall large generation jobs.

#### Acceptance Criteria

1. THE GeminiKeyPool SHALL read API keys from environment variables `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, and `GEMINI_API_KEY_4` at startup, including only keys whose environment variable is set and non-empty.
2. WHEN the GeminiKeyPool contains more than one key, THE GeminiKeyPool SHALL select the next available key using round-robin ordering for each outgoing Gemini API request.
3. WHEN a Gemini API request returns HTTP 429, THE GeminiKeyPool SHALL mark the key that received the 429 response as cooling down for 60 seconds and SHALL NOT use that key for any request until the cooldown period expires.
4. WHEN all keys in the GeminiKeyPool are simultaneously in cooldown, THE GenerationRoute SHALL fall back to the next configured LLM provider (Groq) as defined by the existing `TASK_ROUTING` table in `llm.js`.
5. IF `GEMINI_API_KEY_1` through `GEMINI_API_KEY_4` are all absent and `GEMINI_API_KEY` is set, THEN THE GeminiKeyPool SHALL treat `GEMINI_API_KEY` as a single-key pool to preserve backward compatibility with existing configuration.
6. THE GeminiKeyPool SHALL expose the current key health status (key index, cooldown expiry timestamp or null) through the existing `/api/llm/status` endpoint response.

---

### Requirement 2: Manifest Prompt Template

**User Story:** As a backend developer, I want a dedicated prompt template that converts a design document into a structured file manifest so that the generation pipeline knows exactly which files to create before writing any code.

#### Acceptance Criteria

1. THE ManifestPrompt SHALL be stored as a plain-text file at `backend/prompts/project_manifest_prompt.txt`.
2. THE ManifestPrompt SHALL contain a placeholder `<<<DESIGN_JSON>>>` that the GenerationRoute replaces with the serialized design document JSON before sending the prompt to the LLM.
3. THE ManifestPrompt SHALL contain a placeholder `<<<TECH_STACK>>>` that the GenerationRoute replaces with the confirmed or user-overridden tech stack string before sending the prompt to the LLM.
4. WHEN the LLM responds to the ManifestPrompt, THE GenerationRoute SHALL parse the response as a JSON array where each element contains the string fields `path`, `purpose`, `component`, and `language`.
5. IF the LLM response to the ManifestPrompt cannot be parsed as a valid FileManifest array, THEN THE GenerationRoute SHALL return an SSE event of type `error` with a human-readable message and SHALL terminate the SSE stream.

---

### Requirement 3: File Code Prompt Template

**User Story:** As a backend developer, I want a dedicated prompt template that generates the source code for a single file given its manifest entry and the full design context so that each file is coherent with the overall architecture.

#### Acceptance Criteria

1. THE FilePrompt SHALL be stored as a plain-text file at `backend/prompts/project_file_prompt.txt`.
2. THE FilePrompt SHALL contain a placeholder `<<<FILE_PATH>>>` replaced with the `path` field of the current manifest entry.
3. THE FilePrompt SHALL contain a placeholder `<<<FILE_PURPOSE>>>` replaced with the `purpose` field of the current manifest entry.
4. THE FilePrompt SHALL contain a placeholder `<<<FILE_LANGUAGE>>>` replaced with the `language` field of the current manifest entry.
5. THE FilePrompt SHALL contain a placeholder `<<<DESIGN_JSON>>>` replaced with the serialized design document JSON.
6. THE FilePrompt SHALL contain a placeholder `<<<TECH_STACK>>>` replaced with the confirmed tech stack string.
7. WHEN the LLM responds to the FilePrompt, THE GenerationRoute SHALL extract the raw source code string from the response and associate it with the corresponding manifest entry.
8. IF the LLM response to the FilePrompt is empty or contains only whitespace, THEN THE GenerationRoute SHALL emit an SSE event of type `file_error` for that file, record the failure, and continue processing the remaining files in the manifest.

---

### Requirement 4: Generation Backend Route

**User Story:** As a frontend developer, I want a single backend endpoint that orchestrates the full generation pipeline and streams progress so that the UI can display real-time feedback without polling.

#### Acceptance Criteria

1. THE GenerationRoute SHALL be registered as `POST /api/code/generate-project` and SHALL be protected by the `requireAuth` middleware.
2. WHEN a request is received, THE GenerationRoute SHALL accept a JSON body containing `project_id` (string), `design_document_id` (string), and `tech_stack` (string).
3. IF `project_id`, `design_document_id`, or `tech_stack` is absent from the request body, THEN THE GenerationRoute SHALL respond with HTTP 400 and a JSON error message before opening the SSE stream.
4. WHEN the request body is valid, THE GenerationRoute SHALL set response headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `Connection: keep-alive`, then begin streaming SSE events.
5. THE GenerationRoute SHALL emit an SSE event of type `manifest_start` immediately after opening the stream and before calling the LLM for the manifest.
6. WHEN the FileManifest is successfully parsed, THE GenerationRoute SHALL emit an SSE event of type `manifest_done` containing the total file count.
7. THE GenerationRoute SHALL generate files sequentially in manifest order, emitting an SSE event of type `file_start` containing `index` (0-based), `total`, and `path` before each LLM call.
8. WHEN a file's source code is successfully generated, THE GenerationRoute SHALL emit an SSE event of type `file_done` containing `index`, `path`, and `language`.
9. WHEN all files have been processed, THE GenerationRoute SHALL emit an SSE event of type `complete` containing a `files` array where each element has `path`, `language`, and `code` fields, then close the SSE stream.
10. THE GenerationRoute SHALL use the `code` task routing category when calling the LLM for both manifest and file generation steps.

---

### Requirement 5: Tech Stack Confirmation Step

**User Story:** As a user, I want to review and correct the tech stack inferred from my design document before generation starts so that the generated code uses the languages and frameworks I actually intend.

#### Acceptance Criteria

1. WHEN the ProjectGenerator page loads, THE ProjectGenerator SHALL read the active project's design document from the context sidebar and extract the `tech_stack` field from the design document JSON.
2. THE ProjectGenerator SHALL display the extracted tech stack in an editable text field before the Generate button is enabled.
3. WHILE the tech stack field is empty, THE ProjectGenerator SHALL disable the Generate button and display an inline validation message indicating that a tech stack is required.
4. WHEN the user edits the tech stack field, THE ProjectGenerator SHALL update the value used in the generation request without requiring a page reload.
5. THE ProjectGenerator SHALL display the tech stack confirmation step before any LLM call is initiated.

---

### Requirement 6: ProjectGenerator Frontend Component

**User Story:** As a user, I want a dedicated page where I can launch project generation, watch files appear in real time, and then download or save the result so that I can go from design to runnable code in one workflow.

#### Acceptance Criteria

1. THE ProjectGenerator SHALL be rendered at the route `/projects/:projectId/generate` within the existing `ProjectLayout` component.
2. WHEN the user clicks the Generate button, THE ProjectGenerator SHALL open an SSE connection to `POST /api/code/generate-project` using the `fetch` API with `ReadableStream` body reading.
3. WHEN an SSE event of type `manifest_done` is received, THE ProjectGenerator SHALL display a progress bar initialized to 0 percent with the total file count visible.
4. WHEN an SSE event of type `file_done` is received, THE ProjectGenerator SHALL advance the progress bar by one file increment and display the completed file's path in a scrollable file list.
5. WHEN an SSE event of type `complete` is received, THE ProjectGenerator SHALL set the progress bar to 100 percent and enable the Download ZIP button and the Save to Folder button.
6. WHEN the user clicks the Download ZIP button, THE ProjectGenerator SHALL assemble all generated files into a `.zip` archive using a client-side zip library and trigger a browser file download named `project-<projectId>.zip`.
7. WHEN the user clicks the Save to Folder button and the browser supports the File System Access API (`window.showDirectoryPicker`), THE ProjectGenerator SHALL invoke `showDirectoryPicker`, then write each generated file to the chosen directory at its manifest-specified relative path, creating subdirectories as needed.
8. IF the browser does not support `window.showDirectoryPicker`, THEN THE ProjectGenerator SHALL hide the Save to Folder button and display a tooltip indicating that the feature requires Chrome or Edge.
9. WHEN an SSE event of type `error` is received, THE ProjectGenerator SHALL stop the progress bar, display the error message in a visible error banner, and re-enable the Generate button.
10. WHEN an SSE event of type `file_error` is received for a specific file, THE ProjectGenerator SHALL mark that file's entry in the file list with a visible error indicator and continue displaying progress for remaining files.
11. WHILE generation is in progress, THE ProjectGenerator SHALL disable the Generate button and display a cancel affordance that, when activated, closes the SSE connection and resets the UI to the pre-generation state.

---

### Requirement 7: Design Document Access

**User Story:** As a user, I want the generation page to automatically load my project's system design document so that I do not have to manually copy-paste design content before generating code.

#### Acceptance Criteria

1. WHEN the ProjectGenerator page loads, THE ProjectGenerator SHALL query `GET /api/projects/:projectId/documents` and filter for documents of type `system_design`.
2. IF no system design document exists for the project, THEN THE ProjectGenerator SHALL display a message directing the user to the design page and SHALL disable the Generate button.
3. WHEN multiple system design documents exist, THE ProjectGenerator SHALL use the most recently updated document as determined by the `updated_at` field.
4. THE ProjectGenerator SHALL display the name of the loaded design document so the user can confirm the correct document is being used.
