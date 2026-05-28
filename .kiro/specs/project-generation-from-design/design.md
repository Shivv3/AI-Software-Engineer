# Design Document: project-generation-from-design

## Overview

This feature adds end-to-end project code generation to the AI Software Engineer platform. A user navigates to `/projects/:projectId/generate`, confirms the inferred tech stack, and triggers a backend pipeline that produces a complete, runnable project. The backend orchestrates two LLM passes — a manifest pass that enumerates every file to create, then a sequential per-file code generation pass — streaming progress to the frontend via Server-Sent Events (SSE). On completion the frontend offers a ZIP download (client-side, using `fflate`) or a direct folder save via the File System Access API.

The Gemini provider in `llm.js` is extended with a `GeminiKeyPool` class that distributes requests across up to four API keys using round-robin rotation and per-key 429 cooldown, preventing a single rate-limited key from stalling large generation jobs.

---

## Architecture

The feature follows the existing layered architecture of the application:

```
Browser (React/Vite)
  └─ ProjectGenerator.jsx          ← new component at /projects/:projectId/generate
       ├─ fetch() SSE client        ← reads ReadableStream from POST /api/code/generate-project
       ├─ fflate (client-side zip)  ← new frontend dependency
       └─ File System Access API    ← optional folder save

Express Backend (Node.js)
  └─ POST /api/code/generate-project   ← new route in server.js
       ├─ loadPrompt('project_manifest_prompt.txt')
       ├─ loadPrompt('project_file_prompt.txt')
       └─ llm.generate(prompt, { task: 'code' })
            └─ GeminiKeyPool          ← new class inside llm.js
                 ├─ round-robin key selection
                 └─ per-key 429 cooldown (60 s)
```

No new backend npm packages are introduced. The frontend adds `fflate` for client-side ZIP assembly.

---

## Components and Interfaces

### 1. `GeminiKeyPool` (backend/services/llm.js)

Manages a pool of Gemini API keys read from environment variables at module load time.

**Key selection algorithm:**

```
keys = [GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3, GEMINI_API_KEY_4]
       filtered to non-empty values
       fallback: [GEMINI_API_KEY] if pool would otherwise be empty

roundRobinIndex = 0   // module-level, shared across all calls

getNextKey():
  start = roundRobinIndex
  loop up to keys.length times:
    candidate = keys[roundRobinIndex % keys.length]
    roundRobinIndex++
    if candidate.cooldownUntil <= now:
      return candidate
  return null   // all keys in cooldown → caller falls through to next provider
```

**Cooldown tracking:**

Each key entry is an object `{ value: string, cooldownUntil: number }`. When a 429 is received, `cooldownUntil = Date.now() + 60_000`. The `getNextKey()` method skips any key whose `cooldownUntil > Date.now()`.

**Status exposure:**

`GeminiKeyPool.getStatus()` returns an array of `{ index, cooldownUntil: ISOString | null }` objects. The existing `LLMService.getStatus()` method is updated to include this array under a `geminiKeyPool` field in the response from `GET /api/llm/status`.

**Backward compatibility:**

If `GEMINI_API_KEY_1` through `GEMINI_API_KEY_4` are all absent but `GEMINI_API_KEY` is set, the pool is initialized with `[GEMINI_API_KEY]`. The Gemini provider's `available()` check is updated to return `true` when either the pool has at least one key or `GEMINI_API_KEY` is set.

---

### 2. Updated Gemini Provider (backend/services/llm.js)

The existing Gemini provider object is updated to use `GeminiKeyPool.getNextKey()` instead of reading `process.env.GEMINI_API_KEY` directly.

```javascript
// Pseudocode — updated Gemini provider.call()
call: async (prompt) => {
  const keyEntry = geminiKeyPool.getNextKey();
  if (!keyEntry) throw new Error('All Gemini keys in cooldown');

  try {
    const response = await axios.post(url, body, {
      params: { key: keyEntry.value },
      timeout: 60000
    });
    return extractText(response);
  } catch (err) {
    if (err.response?.status === 429) {
      geminiKeyPool.markCooldown(keyEntry);
      throw err;   // LLMService retry loop will call again → next key selected
    }
    throw err;
  }
}
```

The `isTransient` handler already covers 429, so the existing retry loop in `LLMService.generate()` will re-invoke `provider.call()` on the next attempt, which will pick the next available key.

---

### 3. Prompt Templates

#### `backend/prompts/project_manifest_prompt.txt`

Instructs the LLM to analyze a design document and return a JSON array of files to generate.

**Placeholders:** `<<<DESIGN_JSON>>>`, `<<<TECH_STACK>>>`

**Expected LLM output format:**
```json
[
  {
    "path": "src/index.js",
    "purpose": "Application entry point",
    "component": "Backend",
    "language": "JavaScript"
  }
]
```

The route validates that the response is a JSON array and that each element contains all four required string fields.

#### `backend/prompts/project_file_prompt.txt`

Instructs the LLM to generate the source code for a single file.

**Placeholders:** `<<<FILE_PATH>>>`, `<<<FILE_PURPOSE>>>`, `<<<FILE_LANGUAGE>>>`, `<<<DESIGN_JSON>>>`, `<<<TECH_STACK>>>`

**Expected LLM output:** Raw source code, optionally wrapped in a single code fence. The route strips the fence if present.

---

### 4. `POST /api/code/generate-project` Route (backend/server.js)

Protected by `requireAuth`. Accepts JSON body, validates inputs, then opens an SSE stream.

**Request body:**
```json
{
  "project_id": "string",
  "design_document_id": "string",
  "tech_stack": "string"
}
```

**SSE event protocol:**

| Event type      | Payload fields                                      | When emitted                                      |
|-----------------|-----------------------------------------------------|---------------------------------------------------|
| `manifest_start`| `{}`                                                | Immediately after SSE headers are set             |
| `manifest_done` | `{ total: number }`                                 | After manifest is parsed successfully             |
| `file_start`    | `{ index: number, total: number, path: string }`    | Before each per-file LLM call                     |
| `file_done`     | `{ index: number, path: string, language: string }` | After each file is generated successfully         |
| `file_error`    | `{ index: number, path: string, error: string }`    | When a file's LLM response is empty/whitespace    |
| `complete`      | `{ files: Array<{path, language, code}> }`          | After all files processed; stream closes          |
| `error`         | `{ message: string }`                               | On manifest parse failure or unrecoverable error  |

**SSE helper:**
```javascript
function sendSSE(res, type, data) {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}
```

**Route pseudocode:**
```
POST /api/code/generate-project
  1. Validate body → 400 if missing fields
  2. Fetch design document from DB by design_document_id + project_id
  3. Set SSE headers (Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive)
  4. sendSSE(res, 'manifest_start', {})
  5. Build manifest prompt (replace placeholders)
  6. Call llm.generate(manifestPrompt, { task: 'code' })
  7. Parse response as FileManifest array
     → on failure: sendSSE(res, 'error', { message }); res.end(); return
  8. sendSSE(res, 'manifest_done', { total: manifest.length })
  9. files = []
  10. FOR EACH entry IN manifest (sequential):
       a. sendSSE(res, 'file_start', { index, total, path })
       b. Build file prompt (replace placeholders)
       c. Call llm.generate(filePrompt, { task: 'code' })
       d. Extract code from response
       e. IF code is empty/whitespace:
            sendSSE(res, 'file_error', { index, path, error: 'Empty response' })
            continue
       f. files.push({ path, language, code })
       g. sendSSE(res, 'file_done', { index, path, language })
  11. sendSSE(res, 'complete', { files })
  12. res.end()
```

**Manifest parsing:**
```javascript
function parseManifest(rawText) {
  // Strip code fences, extract JSON array
  const text = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket === -1 || lastBracket === -1) throw new Error('No JSON array found');
  const arr = JSON.parse(text.slice(firstBracket, lastBracket + 1));
  if (!Array.isArray(arr)) throw new Error('Manifest is not an array');
  for (const entry of arr) {
    if (!entry.path || !entry.purpose || !entry.component || !entry.language) {
      throw new Error(`Invalid manifest entry: ${JSON.stringify(entry)}`);
    }
  }
  return arr;
}
```

**Code extraction:**
```javascript
function extractCode(rawText) {
  if (!rawText || !rawText.trim()) return null;
  // Strip a single wrapping code fence if present
  const fenced = rawText.match(/^```[\w]*\n?([\s\S]*?)```\s*$/);
  if (fenced) return fenced[1].trim();
  return rawText.trim();
}
```

---

### 5. `ProjectGenerator.jsx` (frontend/src/components/)

Rendered at `/projects/:projectId/generate` as a child of `ProjectLayout`.

**State:**
```javascript
const [designDoc, setDesignDoc] = useState(null);       // loaded system_design document
const [techStack, setTechStack] = useState('');          // editable tech stack string
const [phase, setPhase] = useState('idle');              // idle | generating | done | error
const [manifest, setManifest] = useState([]);            // array of { path, status, language }
const [files, setFiles] = useState([]);                  // array of { path, language, code }
const [progress, setProgress] = useState(0);             // 0–100
const [total, setTotal] = useState(0);
const [errorMsg, setErrorMsg] = useState('');
const abortRef = useRef(null);                           // AbortController for SSE fetch
```

**Document loading (on mount):**
```javascript
useEffect(() => {
  fetch(`/api/projects/${projectId}/documents`)
    .then(r => r.json())
    .then(docs => {
      const designDocs = docs.filter(d => d.type === 'system_design');
      if (!designDocs.length) { setDesignDoc(null); return; }
      const latest = designDocs.sort((a, b) =>
        new Date(b.updated_at) - new Date(a.updated_at))[0];
      setDesignDoc(latest);
      // Extract tech_stack from document JSON content
      try {
        const parsed = JSON.parse(latest.content);
        const ts = parsed?.tech_stack;
        if (ts) setTechStack(
          Array.isArray(ts) ? ts.join(', ') :
          typeof ts === 'object' ? JSON.stringify(ts) : String(ts)
        );
      } catch { /* content is plain text — leave techStack empty */ }
    });
}, [projectId]);
```

**SSE consumption:**
```javascript
async function startGeneration() {
  const controller = new AbortController();
  abortRef.current = controller;
  setPhase('generating');
  setFiles([]);
  setManifest([]);
  setProgress(0);
  setErrorMsg('');

  const response = await fetch(`${API_BASE}/code/generate-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      design_document_id: designDoc.id,
      tech_stack: techStack
    }),
    signal: controller.signal,
    credentials: 'include'
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop();
    for (const chunk of lines) {
      const dataLine = chunk.split('\n').find(l => l.startsWith('data:'));
      if (!dataLine) continue;
      const event = JSON.parse(dataLine.slice(5));
      handleSSEEvent(event);
    }
  }
}
```

**SSE event handler:**
```javascript
function handleSSEEvent(event) {
  switch (event.type) {
    case 'manifest_done':
      setTotal(event.total);
      setProgress(0);
      break;
    case 'file_start':
      setManifest(prev => [...prev, { path: event.path, status: 'generating' }]);
      break;
    case 'file_done':
      setManifest(prev => prev.map(f =>
        f.path === event.path ? { ...f, status: 'done' } : f));
      setProgress(Math.round(((event.index + 1) / total) * 100));
      break;
    case 'file_error':
      setManifest(prev => prev.map(f =>
        f.path === event.path ? { ...f, status: 'error' } : f));
      break;
    case 'complete':
      setFiles(event.files);
      setProgress(100);
      setPhase('done');
      break;
    case 'error':
      setErrorMsg(event.message);
      setPhase('error');
      break;
  }
}
```

**ZIP download (fflate):**
```javascript
import { zipSync, strToU8 } from 'fflate';

function downloadZip() {
  const zipEntries = {};
  for (const f of files) {
    zipEntries[f.path] = strToU8(f.code);
  }
  const zipped = zipSync(zipEntries);
  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `project-${projectId}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
```

**File System Access API save:**
```javascript
async function saveToFolder() {
  const dirHandle = await window.showDirectoryPicker();
  for (const f of files) {
    const parts = f.path.split('/');
    let current = dirHandle;
    for (const part of parts.slice(0, -1)) {
      current = await current.getDirectoryHandle(part, { create: true });
    }
    const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(f.code);
    await writable.close();
  }
}
```

---

### 6. Route Registration (frontend/src/App.jsx)

```jsx
import ProjectGenerator from './components/ProjectGenerator';

// Inside the /projects/:projectId nested route:
<Route path="generate" element={<ProjectGenerator />} />
```

---

## Data Models

### FileManifest Entry
```typescript
interface ManifestEntry {
  path: string;       // relative file path, e.g. "src/index.js"
  purpose: string;    // one-sentence description of the file's role
  component: string;  // logical component name, e.g. "Backend", "Frontend"
  language: string;   // programming language, e.g. "JavaScript"
}
```

### GeneratedFile
```typescript
interface GeneratedFile {
  path: string;
  language: string;
  code: string;
}
```

### GeminiKeyEntry (internal to GeminiKeyPool)
```typescript
interface GeminiKeyEntry {
  value: string;        // the API key string
  cooldownUntil: number; // epoch ms; 0 means not in cooldown
}
```

### SSE Event Shape
```typescript
interface SSEEvent {
  type: 'manifest_start' | 'manifest_done' | 'file_start' | 'file_done'
      | 'file_error' | 'complete' | 'error';
  // manifest_done
  total?: number;
  // file_start, file_done, file_error
  index?: number;
  path?: string;
  language?: string;
  // file_error, error
  error?: string;
  message?: string;
  // complete
  files?: GeneratedFile[];
}
```

---

### GeminiKeyPool (class)

```javascript
class GeminiKeyPool {
  constructor()                          // reads env vars, builds key entries
  getNextKey(): GeminiKeyEntry | null    // round-robin, skips cooled-down keys
  markCooldown(entry: GeminiKeyEntry)    // sets entry.cooldownUntil = now + 60_000
  getStatus(): Array<{ index, cooldownUntil: string | null }>
}
```

### LLMService (updated)

```javascript
class LLMService {
  getStatus(): { providers: ProviderStatus[], geminiKeyPool: KeyStatus[] }
  generate(prompt, options): Promise<string>
  // ... existing methods unchanged
}
```

### GenerationRoute handler signature

```javascript
async function handleGenerateProject(req, res)
// req.body: { project_id, design_document_id, tech_stack }
// Writes SSE to res; no return value
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Missing required body fields | HTTP 400 JSON response before SSE opens |
| Design document not found in DB | SSE `error` event, stream closes |
| Manifest LLM call fails (all providers exhausted) | SSE `error` event, stream closes |
| Manifest response is not valid JSON array | SSE `error` event, stream closes |
| Per-file LLM call fails | SSE `file_error` event, generation continues with next file |
| Per-file response is empty/whitespace | SSE `file_error` event, generation continues |
| All Gemini keys in cooldown | `GeminiKeyPool.getNextKey()` returns `null`; Gemini provider throws; `LLMService` falls through to DeepSeek/Groq per existing `TASK_ROUTING` |
| Client disconnects mid-stream | `req.on('close')` handler calls `res.end()` and sets a flag to abort the generation loop |
| `showDirectoryPicker` not supported | Save to Folder button hidden; tooltip shown |
| `showDirectoryPicker` throws (user cancels) | Error caught silently; no UI change |

---

## Dependency Notes

### Backend
No new npm packages. The route uses:
- `llm` (existing service)
- `loadPrompt` from `services/prompts.js`
- `db` (existing better-sqlite3 instance)
- `requireAuth` middleware
- Node.js built-ins (`fs`, `path`)

### Frontend
One new package: `fflate` (client-side ZIP). No other additions.

```bash
# Install in frontend/
npm install fflate@0.8.2
```

`fflate` is chosen over `jszip` because it is smaller, faster, and has no dependencies. It is not currently in `frontend/package.json`.

---

## Testing Strategy

**Dual testing approach:** unit/property tests for pure logic, integration tests for the SSE route and database interactions.

### Unit / Property Tests

- **GeminiKeyPool** — round-robin rotation, cooldown exclusion, status accuracy, backward-compat fallback. Use a property-based test library (e.g., `fast-check`) to generate arbitrary key counts and request sequences.
- **`parseManifest()`** — valid round-trip and invalid-input rejection. Generate random arrays of ManifestEntry objects and malformed strings.
- **`extractCode()`** — code fence stripping and whitespace detection. Generate random code strings wrapped in various fence formats.
- **Progress calculation** — for any N and K ≤ N, verify `Math.round((K/N)*100)`.
- **ZIP assembly** — for any array of `{path, code}` objects, verify the archive contains each file at the correct path with correct content.

### Integration Tests

- `POST /api/code/generate-project` with missing fields → HTTP 400.
- Full SSE stream with a mocked LLM: verify event sequence and `complete` payload.
- `GET /api/llm/status` reflects GeminiKeyPool state after a simulated 429.

### Frontend Component Tests

- ProjectGenerator renders disabled Generate button when no design doc is present.
- ProjectGenerator renders disabled Generate button when tech stack is empty.
- Save to Folder button is hidden when `window.showDirectoryPicker` is undefined.
- Progress bar advances correctly as `file_done` events arrive.

### Manual / Smoke Tests

- Prompt files exist at the expected paths.
- Route is accessible only when authenticated (returns 401 without session).
- End-to-end: generate a small project from a real design document and verify the ZIP downloads correctly.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Round-Robin Key Selection

*For any* GeminiKeyPool with K available (non-cooled-down) keys and any sequence of N consecutive `getNextKey()` calls, the key returned at call i must equal `keys[i % K]`, and the selection must wrap around correctly regardless of N or K.

**Validates: Requirements 1.2**

---

### Property 2: 429 Cooldown Exclusion

*For any* key in the GeminiKeyPool, after `markCooldown()` is called on that key, `getNextKey()` must never return that key for any call made within the 60-second cooldown window, regardless of how many other keys are available.

**Validates: Requirements 1.3**

---

### Property 3: Key Pool Status Accuracy

*For any* GeminiKeyPool state (any combination of keys in or out of cooldown), `getStatus()` must return an array where each entry's `cooldownUntil` field accurately reflects whether that key is currently cooling down — non-null and in the future if cooling, null if available.

**Validates: Requirements 1.6**

---

### Property 4: Manifest Parse Round-Trip

*For any* valid array of FileManifest objects (each with non-empty `path`, `purpose`, `component`, and `language` string fields), serializing the array to JSON and passing it through `parseManifest()` must return an equivalent array with all fields preserved.

**Validates: Requirements 2.4**

---

### Property 5: Invalid Manifest Triggers Error

*For any* string that is not a valid JSON array of FileManifest objects (malformed JSON, missing required fields, wrong root type), `parseManifest()` must throw an error, which causes the route to emit an SSE `error` event and close the stream.

**Validates: Requirements 2.5**

---

### Property 6: Code Fence Stripping

*For any* non-empty source code string, wrapping it in a Markdown code fence (`` ```lang\n{code}\n``` ``) and passing it through `extractCode()` must return the original code string with no fence markers.

**Validates: Requirements 3.7**

---

### Property 7: Whitespace Response Treated as Empty

*For any* string composed entirely of whitespace characters (spaces, tabs, newlines), `extractCode()` must return `null`, triggering a `file_error` SSE event for that file.

**Validates: Requirements 3.8**

---

### Property 8: Missing Fields Return HTTP 400

*For any* request to `POST /api/code/generate-project` that omits at least one of `project_id`, `design_document_id`, or `tech_stack`, the route must respond with HTTP 400 and must not open an SSE stream.

**Validates: Requirements 4.2, 4.3**

---

### Property 9: SSE Event Ordering Invariant

*For any* valid generation run with N files, the sequence of SSE event types emitted must satisfy: `manifest_start` appears exactly once before any other event; `manifest_done` appears exactly once after `manifest_start`; for each file i (0-indexed), `file_start` for index i appears before `file_done` or `file_error` for index i; `complete` or `error` appears exactly once as the final event.

**Validates: Requirements 4.5, 4.6, 4.7, 4.8, 4.9**

---

### Property 10: Progress Bar Advances Proportionally

*For any* total file count N and any K ≤ N `file_done` events received, the displayed progress percentage must equal `Math.round((K / N) * 100)`.

**Validates: Requirements 6.4**

---

### Property 11: ZIP Archive Contains All Generated Files

*For any* array of GeneratedFile objects, the ZIP archive produced by the download function must contain exactly one entry per file at the manifest-specified path, and each entry's content must equal the corresponding `code` string.

**Validates: Requirements 6.6**

---

### Property 12: Save to Folder Button Hidden Without API Support

*For any* browser environment where `window.showDirectoryPicker` is `undefined`, the Save to Folder button must not be rendered in the DOM.

**Validates: Requirements 6.8**

---

### Property 13: Generate Button Disabled Without Tech Stack

*For any* state where the tech stack text field contains only whitespace or is empty, the Generate button must be in a disabled state.

**Validates: Requirements 5.3**

---

### Property 14: Generate Button Disabled Without Design Document

*For any* project whose document list contains no entries with `type === 'system_design'`, the Generate button must be disabled and a redirect message must be visible.

**Validates: Requirements 7.2**

---

### Property 15: Most Recent Design Document Selected

*For any* non-empty list of system_design documents for a project, the document selected for generation must be the one with the maximum `updated_at` timestamp value.

**Validates: Requirements 7.3**
