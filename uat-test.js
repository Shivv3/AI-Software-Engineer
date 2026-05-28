// ============================================================
// EXHAUSTIVE UAT TEST SUITE — AI Software Engineer Backend
// ============================================================
const http = require('http');

const BASE = 'http://localhost:4000';
let cookieJar = '';
let projectId = '';
let documentId = '';

// ── helpers ──────────────────────────────────────────────────
function request(method, path, body, useCookie = true) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 4000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(useCookie && cookieJar ? { Cookie: cookieJar } : {})
      }
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.headers['set-cookie']) {
          cookieJar = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        }
        let json;
        try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ status: res.statusCode, body: json, raw });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let passed = 0, failed = 0, skipped = 0;
const results = [];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Retry a request if it returns "Server is busy" (rate limit)
async function requestWithRetry(method, path, body, useCookie = true, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await request(method, path, body, useCookie);
    const isBusy = (res.status === 500 || res.status === 503) && 
                   typeof res.body?.error === 'string' && 
                   (res.body.error.includes('busy') || res.body.error.includes('unavailable'));
    if (isBusy) {
      const waitMs = 20000 * (i + 1);
      console.log(`  ⏳ Rate limited (${res.status}), waiting ${waitMs/1000}s before retry ${i+1}/${maxRetries}...`);
      await sleep(waitMs);
      continue;
    }
    return res;
  }
  return await request(method, path, body, useCookie);
}

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
    results.push({ status: 'PASS', name });
  } else {
    console.log(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
    results.push({ status: 'FAIL', name, detail });
  }
}

function skip(name, reason) {
  console.log(`  ⏭  SKIP: ${name} (${reason})`);
  skipped++;
  results.push({ status: 'SKIP', name, reason });
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

// ── test suites ──────────────────────────────────────────────
async function testAuth() {
  section('1. AUTH — Register / Login / Me / Logout');

  // 1a. Register new user
  const ts = Date.now();
  const r1 = await request('POST', '/api/auth/register', {
    name: 'Alice Tester', email: `alice${ts}@test.com`,
    user_id: `alice${ts}`, password: 'Test@1234',
    phone_number: '9876543210', age: 25
  }, false);
  console.log('  Register response:', r1.status, JSON.stringify(r1.body).slice(0, 120));
  assert('Register returns 200', r1.status === 200);
  assert('Register returns user object', r1.body?.user?.user_id === `alice${ts}`);
  assert('Register sets session cookie', !!cookieJar);

  // 1b. Duplicate user_id
  const r2 = await request('POST', '/api/auth/register', {
    name: 'Alice2', email: `alice2${ts}@test.com`,
    user_id: `alice${ts}`, password: 'Test@1234'
  }, false);
  assert('Duplicate user_id returns 400', r2.status === 400);

  // 1c. Duplicate email
  const r3 = await request('POST', '/api/auth/register', {
    name: 'Alice3', email: `alice${ts}@test.com`,
    user_id: `alice3${ts}`, password: 'Test@1234'
  }, false);
  assert('Duplicate email returns 400', r3.status === 400);

  // 1d. Missing fields
  const r4 = await request('POST', '/api/auth/register', { name: 'X' }, false);
  assert('Register missing fields returns 400', r4.status === 400);

  // 1e. Short password
  const r5 = await request('POST', '/api/auth/register', {
    name: 'Bob', email: `bob${ts}@test.com`, user_id: `bob${ts}`, password: '123'
  }, false);
  assert('Short password returns 400', r5.status === 400);

  // 1f. GET /api/auth/me (already logged in from register)
  const r6 = await request('GET', '/api/auth/me');
  assert('GET /api/auth/me returns user', r6.status === 200 && r6.body?.user?.name === 'Alice Tester');

  // 1g. Logout
  const r7 = await request('POST', '/api/auth/logout');
  assert('Logout returns success', r7.status === 200 && r7.body?.success === true);

  // 1h. /me after logout → 401
  const r8 = await request('GET', '/api/auth/me');
  assert('GET /me after logout returns 401', r8.status === 401);

  // 1i. Login with wrong password
  const r9 = await request('POST', '/api/auth/login', {
    user_id: `alice${ts}`, password: 'wrongpass'
  }, false);
  assert('Login wrong password returns 401', r9.status === 401);

  // 1j. Login correct
  const r10 = await request('POST', '/api/auth/login', {
    user_id: `alice${ts}`, password: 'Test@1234'
  }, false);
  assert('Login correct returns 200', r10.status === 200);
  assert('Login returns user', r10.body?.user?.user_id === `alice${ts}`);
}

async function testProjects() {
  section('2. PROJECTS — CRUD');

  // 2a. Create project
  const r1 = await request('POST', '/api/project', {
    title: 'UAT Test Project', project_text: 'An AI-powered task management system for teams.'
  });
  console.log('  Create project response:', r1.status, JSON.stringify(r1.body).slice(0, 120));
  assert('Create project returns 200', r1.status === 200);
  assert('Create project returns id', !!r1.body?.id);
  projectId = r1.body?.id;

  // 2b. List projects
  const r2 = await request('GET', '/api/projects');
  assert('List projects returns array', r2.status === 200 && Array.isArray(r2.body));
  assert('List projects contains new project', r2.body?.some(p => p.id === projectId));

  // 2c. Get project by id
  const r3 = await request('GET', `/api/project/${projectId}`);
  assert('Get project returns 200', r3.status === 200);
  assert('Get project has correct title', r3.body?.title === 'UAT Test Project');

  // 2d. Get non-existent project
  const r4 = await request('GET', '/api/project/nonexistent-id');
  assert('Get non-existent project returns 404', r4.status === 404);

  // 2e. Get versions (empty initially)
  const r5 = await request('GET', `/api/project/${projectId}/versions`);
  assert('Get versions returns array', r5.status === 200 && Array.isArray(r5.body));

  // 2f. Unauthenticated access
  const savedCookie = cookieJar;
  cookieJar = '';
  const r6 = await request('GET', '/api/projects');
  assert('Unauthenticated projects returns 401', r6.status === 401);
  cookieJar = savedCookie;
}

async function testDocuments() {
  section('3. PROJECT DOCUMENTS — CRUD');

  // 3a. Create document
  const r1 = await request('POST', `/api/projects/${projectId}/documents`, {
    name: 'Requirements.txt', type: 'SRS', mime: 'text/plain',
    content: 'The system shall allow users to create tasks. The system must support team collaboration. Users should be able to assign tasks to team members.',
    useAsContext: true
  });
  console.log('  Create doc response:', r1.status, JSON.stringify(r1.body).slice(0, 120));
  assert('Create document returns 201', r1.status === 201);
  assert('Create document returns id', !!r1.body?.id);
  documentId = r1.body?.id;
  assert('Document useAsContext is true', r1.body?.useAsContext === true);

  // 3b. List documents
  const r2 = await request('GET', `/api/projects/${projectId}/documents`);
  assert('List documents returns array', r2.status === 200 && Array.isArray(r2.body));
  assert('List documents contains new doc', r2.body?.some(d => d.id === documentId));

  // 3c. Update document
  const r3 = await request('PATCH', `/api/projects/${projectId}/documents/${documentId}`, {
    name: 'Requirements-v2.txt', useAsContext: false
  });
  assert('Update document returns 200', r3.status === 200);
  assert('Update document name changed', r3.body?.name === 'Requirements-v2.txt');
  assert('Update document useAsContext changed', r3.body?.useAsContext === false);

  // 3d. Create doc with missing name
  const r4 = await request('POST', `/api/projects/${projectId}/documents`, {
    content: 'some content'
  });
  assert('Create doc missing name returns 400', r4.status === 400);

  // 3e. Create doc with missing content
  const r5 = await request('POST', `/api/projects/${projectId}/documents`, {
    name: 'test.txt'
  });
  assert('Create doc missing content returns 400', r5.status === 400);

  // 3f. Update non-existent doc
  const r6 = await request('PATCH', `/api/projects/${projectId}/documents/fake-id`, {
    name: 'x'
  });
  assert('Update non-existent doc returns 404', r6.status === 404);

  // 3g. Re-enable context for RAG tests later
  await request('PATCH', `/api/projects/${projectId}/documents/${documentId}`, {
    useAsContext: true
  });
}

async function testSdlcAndPlan() {
  section('4. SDLC RECOMMEND + PLAN GENERATE (LLM)');

  // 4a. SDLC recommend
  console.log('  Calling /api/sdlc/recommend (LLM call, may take ~10s)...');
  const r1 = await requestWithRetry('POST', '/api/sdlc/recommend', {
    project_text: 'Build a task management web app for small teams with user auth, task CRUD, and notifications.',
    constraints: { team_size: 3, deadline: '6 months', budget: 'low' }
  });
  console.log('  SDLC response:', r1.status, JSON.stringify(r1.body).slice(0, 200));
  assert('SDLC recommend returns 200', r1.status === 200);
  assert('SDLC has model field', typeof r1.body?.model === 'string');
  assert('SDLC has why field', typeof r1.body?.why === 'string');
  assert('SDLC confidence is 0-1', typeof r1.body?.confidence === 'number' && r1.body.confidence >= 0 && r1.body.confidence <= 1);

  // 4b. SDLC missing project_text
  const r2 = await request('POST', '/api/sdlc/recommend', {});
  assert('SDLC missing project_text returns 400', r2.status === 400);

  // 4c. Plan generate
  console.log('  Calling /api/plan/generate (LLM call, may take ~10s)...');
  const r3 = await requestWithRetry('POST', '/api/plan/generate', {
    project_text: 'Build a task management web app for small teams with user auth, task CRUD, and notifications.'
  });
  console.log('  Plan response:', r3.status, JSON.stringify(r3.body).slice(0, 200));
  assert('Plan generate returns 200', r3.status === 200);
  assert('Plan has some content', r3.body && typeof r3.body === 'object');

  // 4d. Plan missing project_text
  const r4 = await request('POST', '/api/plan/generate', {});
  assert('Plan missing project_text returns 400', r4.status === 400);
}

async function testSrs() {
  section('5. SRS — Generate Questions / Content / Save / Final / Status / Edit / Apply');

  // 5a. Generate questions
  console.log('  Calling /api/srs/generate-questions (LLM)...');
  const r1 = await requestWithRetry('POST', '/api/srs/generate-questions', {
    project_description: 'A task management app for small teams with auth, CRUD tasks, and notifications.'
  });
  console.log('  SRS questions response:', r1.status, JSON.stringify(r1.body).slice(0, 200));
  assert('SRS generate-questions returns 200', r1.status === 200);
  assert('SRS questions has sections array', Array.isArray(r1.body?.sections));

  // 5b. Missing project_description
  const r2 = await request('POST', '/api/srs/generate-questions', {});
  assert('SRS questions missing desc returns 400', r2.status === 400);

  // 5c. Generate content for a section
  console.log('  Calling /api/srs/generate-content (LLM)...');
  const r3 = await requestWithRetry('POST', '/api/srs/generate-content', {
    section_title: '1. Introduction',
    subsection_title: '1.1 Purpose',
    qa_pairs: [
      { question: 'What is the purpose of this system?', answer: 'To help small teams manage tasks efficiently.' },
      { question: 'Who are the primary users?', answer: 'Team leads and team members in small organizations.' }
    ]
  });
  console.log('  SRS content response:', r3.status, JSON.stringify(r3.body).slice(0, 200));
  assert('SRS generate-content returns 200', r3.status === 200);
  assert('SRS content has content field', typeof r3.body?.content === 'string' && r3.body.content.length > 0);

  // 5d. Save section
  const r4 = await request('POST', '/api/srs/save-section', {
    project_id: projectId,
    section_id: '1_introduction',
    subsection_id: '1_1_purpose',
    content: r3.body?.content || 'This system helps teams manage tasks.',
    status: 'approved'
  });
  assert('SRS save-section returns 200', r4.status === 200);
  assert('SRS save-section returns success', r4.body?.success === true);

  // 5e. Get sections
  const r5 = await request('GET', `/api/srs/sections/${projectId}`);
  assert('SRS get sections returns array', r5.status === 200 && Array.isArray(r5.body));
  assert('SRS sections contains saved section', r5.body?.some(s => s.section_id === '1_introduction'));

  // 5f. SRS status
  const r6 = await request('GET', `/api/srs/status/${projectId}`);
  assert('SRS status returns 200', r6.status === 200);
  assert('SRS status has completedSections', typeof r6.body?.completedSections === 'number');
  assert('SRS status has completionPercentage', typeof r6.body?.completionPercentage === 'number');

  // 5g. Generate final SRS
  const r7 = await request('POST', `/api/srs/generate-final/${projectId}`);
  assert('SRS generate-final returns 200', r7.status === 200);
  assert('SRS generate-final has content', typeof r7.body?.content === 'string' && r7.body.content.length > 0);

  // 5h. SRS edit (LLM)
  console.log('  Calling /api/srs/edit (LLM)...');
  const r8 = await requestWithRetry('POST', '/api/srs/edit', {
    project_id: projectId,
    selected_text: 'This system helps teams manage tasks.',
    instruction: 'Make this more formal and detailed.',
    selection_start: 0,
    selection_end: 36,
    full_content: 'This system helps teams manage tasks. It supports CRUD operations.'
  });
  console.log('  SRS edit response:', r8.status, JSON.stringify(r8.body).slice(0, 200));
  assert('SRS edit returns 200', r8.status === 200);

  // 5i. SRS apply
  if (r8.status === 200 && r8.body?.suggestion_text) {
    const r9 = await request('POST', '/api/srs/apply', {
      project_id: projectId,
      srs_content: r8.body.suggestion_text,
      prompt_text: 'Make this more formal',
      suggestion_text: r8.body.suggestion_text,
      selection_start: 0,
      selection_end: 36
    });
    assert('SRS apply returns 200', r9.status === 200);
    assert('SRS apply returns version number', typeof r9.body?.version === 'number');

    // 5j. Check version was created
    const r10 = await request('GET', `/api/project/${projectId}/versions`);
    assert('Versions list has entry after apply', r10.body?.length > 0);
  } else {
    skip('SRS apply', 'SRS edit did not return suggestion_text');
  }
}

async function testDesign() {
  section('6. DESIGN — System / Schema / Diagram / Export');

  const srsText = 'The system shall allow users to register and login. Users must be able to create, read, update, and delete tasks. The system should send email notifications for task assignments.';

  // 6a. System design
  console.log('  Calling /api/design/system (LLM)...');
  const r1 = await requestWithRetry('POST', '/api/design/system', { srs_text: srsText });
  console.log('  System design response:', r1.status, JSON.stringify(r1.body).slice(0, 200));
  assert('Design system returns 200', r1.status === 200);
  assert('Design system has content', r1.body && typeof r1.body === 'object');

  // 6b. System design missing srs_text
  const r2 = await request('POST', '/api/design/system', {});
  assert('Design system missing srs_text returns 400', r2.status === 400);

  // 6c. System design with data URI (should reject)
  const r3 = await request('POST', '/api/design/system', { srs_text: 'data:application/pdf;base64,abc' });
  assert('Design system data URI returns 400', r3.status === 400);

  // 6d. DB schema
  console.log('  Calling /api/design/schema (LLM)...');
  const r4 = await requestWithRetry('POST', '/api/design/schema', {
    requirements_text: srsText,
    output_format: 'sql'
  });
  console.log('  DB schema response:', r4.status, JSON.stringify(r4.body).slice(0, 200));
  assert('Design schema returns 200', r4.status === 200);
  assert('Design schema has content', r4.body && typeof r4.body === 'object');

  // 6e. DB schema missing requirements_text
  const r5 = await request('POST', '/api/design/schema', {});
  assert('Design schema missing requirements_text returns 400', r5.status === 400);

  // 6f. Diagram generation
  console.log('  Calling /api/design/diagram (LLM + Puppeteer)...');
  const r6 = await requestWithRetry('POST', '/api/design/diagram', {
    diagram_type: 'sequence',
    project_info: 'User logs in, creates a task, assigns it to a team member, who receives a notification.'
  });
  console.log('  Diagram response:', r6.status, JSON.stringify(r6.body).slice(0, 200));
  assert('Design diagram returns 200', r6.status === 200);
  assert('Design diagram has mermaid_code', typeof r6.body?.mermaid_code === 'string');

  // 6g. Diagram invalid type
  const r7 = await request('POST', '/api/design/diagram', {
    diagram_type: 'invalid_type', project_info: 'some info'
  });
  assert('Design diagram invalid type returns 400', r7.status === 400);

  // 6h. Diagram missing project_info
  const r8 = await request('POST', '/api/design/diagram', { diagram_type: 'er' });
  assert('Design diagram missing info returns 400', r8.status === 400);

  // 6i. Design export (docx)
  const r9 = await request('POST', '/api/design/export', {
    design_markdown: '# System Design\n\n## Architecture\nMicroservices with REST APIs.\n\n## Tech Stack\n- Node.js\n- React\n- SQLite'
  });
  assert('Design export returns 200', r9.status === 200);
}

async function testCode() {
  section('7. CODE — Generate / Translate / Test / Review');

  const sampleCode = `function add(a, b) {\n  return a + b;\n}\nfunction divide(a, b) {\n  return a / b;\n}`;

  // 7a. Code generate
  console.log('  Calling /api/code/generate (LLM)...');
  const r1 = await requestWithRetry('POST', '/api/code/generate', {
    description: 'A function that validates an email address using regex',
    target_language: 'JavaScript',
    style: 'clean and well-commented',
    include_tests: false
  });
  console.log('  Code generate response:', r1.status, JSON.stringify(r1.body).slice(0, 200));
  assert('Code generate returns 200', r1.status === 200);
  assert('Code generate has code field', typeof r1.body?.code === 'string' && r1.body.code.length > 0);
  assert('Code generate has language', typeof r1.body?.language === 'string');

  // 7b. Code generate missing fields
  const r2 = await request('POST', '/api/code/generate', { description: 'test' });
  assert('Code generate missing target_language returns 400', r2.status === 400);

  // 7c. Code translate
  console.log('  Calling /api/code/translate (LLM)...');
  const r3 = await requestWithRetry('POST', '/api/code/translate', {
    source_language: 'JavaScript',
    target_language: 'Python',
    source_code: sampleCode,
    instructions: 'Keep the same function names'
  });
  console.log('  Code translate response:', r3.status, JSON.stringify(r3.body).slice(0, 200));
  assert('Code translate returns 200', r3.status === 200);
  assert('Code translate has code field', typeof r3.body?.code === 'string');

  // 7d. Code translate missing fields
  const r4 = await request('POST', '/api/code/translate', { source_language: 'JS' });
  assert('Code translate missing fields returns 400', r4.status === 400);

  // 7e. Code test
  console.log('  Calling /api/code/test (LLM)...');
  const r5 = await requestWithRetry('POST', '/api/code/test', {
    language: 'JavaScript',
    code: sampleCode,
    instructions: 'Test edge cases including division by zero',
    want_fix: true
  });
  console.log('  Code test response:', r5.status, JSON.stringify(r5.body).slice(0, 200));
  assert('Code test returns 200', r5.status === 200);
  assert('Code test has tests array', Array.isArray(r5.body?.tests));
  assert('Code test has summary', typeof r5.body?.summary === 'string');

  // 7f. Code test missing code
  const r6 = await request('POST', '/api/code/test', { language: 'JS' });
  assert('Code test missing code returns 400', r6.status === 400);

  // 7g. Code review
  console.log('  Calling /api/code/review (LLM)...');
  const r7 = await requestWithRetry('POST', '/api/code/review', {
    language: 'JavaScript',
    code: sampleCode,
    focus: 'security and error handling'
  });
  console.log('  Code review response:', r7.status, JSON.stringify(r7.body).slice(0, 200));
  assert('Code review returns 200', r7.status === 200);
  assert('Code review has summary', typeof r7.body?.summary === 'string');
  assert('Code review has findings array', Array.isArray(r7.body?.findings));

  // 7h. Code review missing code
  const r8 = await request('POST', '/api/code/review', { language: 'JS' });
  assert('Code review missing code returns 400', r8.status === 400);
}

async function testDocumentExtract() {
  section('8. DOCUMENT EXTRACT TEXT');

  // 8a. Plain text (not data URI)
  const r1 = await request('POST', '/api/documents/extract-text', {
    content: 'Hello world, this is plain text.'
  });
  assert('Extract plain text returns 200', r1.status === 200);
  assert('Extract plain text returns text', r1.body?.text === 'Hello world, this is plain text.');

  // 8b. Text data URI
  const textB64 = Buffer.from('Hello from data URI').toString('base64');
  const r2 = await request('POST', '/api/documents/extract-text', {
    content: `data:text/plain;base64,${textB64}`
  });
  assert('Extract text data URI returns 200', r2.status === 200);
  assert('Extract text data URI returns correct text', r2.body?.text === 'Hello from data URI');

  // 8c. Missing content
  const r3 = await request('POST', '/api/documents/extract-text', {});
  assert('Extract missing content returns 400', r3.status === 400);

  // 8d. Unsupported data URI type
  const r4 = await request('POST', '/api/documents/extract-text', {
    content: 'data:image/png;base64,abc123'
  });
  assert('Extract unsupported type returns 400', r4.status === 400);
}

async function testProjectInsights() {
  section('9. PROJECT INSIGHTS — Health / Traceability / Requirements Sync');

  // 9a. Health
  const r1 = await request('GET', `/api/projects/${projectId}/health`);
  console.log('  Health response:', r1.status, JSON.stringify(r1.body).slice(0, 200));
  assert('Project health returns 200', r1.status === 200);
  assert('Project health has phases', r1.body?.phases && typeof r1.body.phases === 'object');
  assert('Project health has documents count', typeof r1.body?.documents === 'number');

  // 9b. Traceability
  const r2 = await request('GET', `/api/projects/${projectId}/traceability`);
  console.log('  Traceability response:', r2.status, JSON.stringify(r2.body).slice(0, 200));
  assert('Traceability returns 200', r2.status === 200);
  assert('Traceability has requirements array', Array.isArray(r2.body?.requirements));
  assert('Traceability has coverage_summary', r2.body?.coverage_summary && typeof r2.body.coverage_summary === 'object');

  // 9c. Requirements sync
  const r3 = await request('POST', `/api/projects/${projectId}/requirements/sync`, {
    text: 'The system shall allow users to login. Users must be able to create tasks. The system should send notifications.'
  });
  console.log('  Sync response:', r3.status, JSON.stringify(r3.body).slice(0, 200));
  assert('Requirements sync returns 200', r3.status === 200);
  assert('Requirements sync has total', typeof r3.body?.total === 'number');

  // 9d. Non-existent project
  const r4 = await request('GET', '/api/projects/nonexistent/health');
  assert('Health non-existent project returns 404', r4.status === 404);
}

async function testAiFeatures() {
  section('10. AI FEATURES — Multi-Agent Review / RAG / Decompose / Adversarial');

  // 10a. Multi-agent review with context_text
  console.log('  Calling /api/ai/reviews/multi-agent (3 parallel LLM calls)...');
  const r1 = await requestWithRetry('POST', '/api/ai/reviews/multi-agent', {
    context_text: 'The system shall allow users to register and login. Users must be able to create, read, update, and delete tasks. The system should send email notifications for task assignments. The API must respond within 200ms for 95% of requests.'
  });
  console.log('  Multi-agent response:', r1.status, JSON.stringify(r1.body).slice(0, 200));
  assert('Multi-agent review returns 200', r1.status === 200);
  assert('Multi-agent has architect review', r1.body?.architect && typeof r1.body.architect === 'object');
  assert('Multi-agent has security review', r1.body?.security && typeof r1.body.security === 'object');
  assert('Multi-agent has performance review', r1.body?.performance && typeof r1.body.performance === 'object');

  // 10b. Multi-agent no context
  const r2 = await request('POST', '/api/ai/reviews/multi-agent', { project_id: 'nonexistent' });
  assert('Multi-agent no context returns 422', r2.status === 422);

  // 10c. Requirement decompose
  console.log('  Calling /api/ai/requirements/decompose (LLM)...');
  const r3 = await requestWithRetry('POST', '/api/ai/requirements/decompose', {
    requirement: 'The system shall provide a comprehensive user authentication and authorization module.'
  });
  console.log('  Decompose response:', r3.status, JSON.stringify(r3.body).slice(0, 200));
  assert('Requirement decompose returns 200', r3.status === 200);
  assert('Requirement decompose has content', r3.body && typeof r3.body === 'object');

  // 10d. Decompose missing requirement
  const r4 = await request('POST', '/api/ai/requirements/decompose', {});
  assert('Decompose missing requirement returns 422', r4.status === 422);

  // 10e. Adversarial tester
  console.log('  Calling /api/ai/requirements/adversarial (LLM)...');
  const r5 = await requestWithRetry('POST', '/api/ai/requirements/adversarial', {
    requirement: 'The system must respond to all API requests within 100ms.'
  });
  console.log('  Adversarial response:', r5.status, JSON.stringify(r5.body).slice(0, 200));
  assert('Adversarial tester returns 200', r5.status === 200);
  assert('Adversarial tester has content', r5.body && typeof r5.body === 'object');

  // 10f. Adversarial missing requirement
  const r6 = await request('POST', '/api/ai/requirements/adversarial', {});
  assert('Adversarial missing requirement returns 422', r6.status === 422);
}

async function testMlFeatures() {
  section('11. ML FEATURES (proxied to Python service at :8000)');

  const reqs = [
    'The system shall allow users to register with email and password.',
    'Users must be able to create tasks with title and description.',
    'The system should send email notifications when tasks are assigned.',
    'The API must respond within 200ms for 95% of requests.',
    'Users can delete their own tasks.'
  ];

  // 11a. Requirements analyze
  console.log('  Calling /api/ml/requirements/analyze...');
  const r1 = await request('POST', '/api/ml/requirements/analyze', {
    requirements: reqs, project_id: projectId
  });
  console.log('  ML analyze response:', r1.status, JSON.stringify(r1.body).slice(0, 200));
  if (r1.status === 503) {
    skip('ML requirements analyze', 'ML service not running (expected in dev)');
  } else {
    assert('ML requirements analyze returns 200', r1.status === 200);
    assert('ML analyze has scores array', Array.isArray(r1.body?.scores));
  }
  // 11b. Requirements analyze missing
  const r2 = await request('POST', '/api/ml/requirements/analyze', {});
  assert('ML analyze missing requirements returns 422', r2.status === 422);

  // 11c. Conflict detect
  console.log('  Calling /api/ml/conflict/detect...');
  const r3 = await request('POST', '/api/ml/conflict/detect', {
    requirements: reqs, project_id: projectId
  });
  console.log('  ML conflict response:', r3.status, JSON.stringify(r3.body).slice(0, 200));
  if (r3.status === 503) {
    skip('ML conflict detect', 'ML service not running (expected in dev)');
  } else {
    assert('ML conflict detect returns 200', r3.status === 200);
    assert('ML conflict has conflict_pairs', Array.isArray(r3.body?.conflict_pairs));
  }

  // 11d. Conflict detect missing
  const r4 = await request('POST', '/api/ml/conflict/detect', {});
  assert('ML conflict missing requirements returns 422', r4.status === 422);

  // 11e. Defect predict
  console.log('  Calling /api/ml/defect/predict...');
  const r5 = await request('POST', '/api/ml/defect/predict', {
    code: 'function divide(a, b) { return a / b; }',
    language: 'javascript'
  });
  console.log('  ML defect response:', r5.status, JSON.stringify(r5.body).slice(0, 200));
  if (r5.status === 503) {
    skip('ML defect predict', 'ML service not running (expected in dev)');
  } else {
    assert('ML defect predict returns 200', r5.status === 200);
  }

  // 11f. Defect predict missing
  const r6 = await request('POST', '/api/ml/defect/predict', {});
  assert('ML defect missing fields returns 422', r6.status === 422);

  // 11g. Traceability analyze
  console.log('  Calling /api/ml/traceability/analyze...');
  const r7 = await request('POST', '/api/ml/traceability/analyze', {
    requirements: reqs,
    code_functions: ['registerUser', 'createTask', 'sendNotification', 'deleteTask']
  });
  console.log('  ML traceability response:', r7.status, JSON.stringify(r7.body).slice(0, 200));
  if (r7.status === 503) {
    skip('ML traceability analyze', 'ML service not running (expected in dev)');
  } else {
    assert('ML traceability analyze returns 200', r7.status === 200);
  }

  // 11h. Traceability missing
  const r8 = await request('POST', '/api/ml/traceability/analyze', {});
  assert('ML traceability missing fields returns 422', r8.status === 422);
}

async function testProjectExportAndDelete() {
  section('12. PROJECT EXPORT + DELETE');

  // Verify we're still logged in as the right user
  const meCheck = await request('GET', '/api/auth/me');
  console.log('  Current user before delete:', meCheck.status, meCheck.body?.user?.user_id);

  // 12a. Export project as docx
  const r1 = await request('POST', `/api/project/${projectId}/export`);
  assert('Project export returns 200', r1.status === 200);

  // 12b. Export non-existent project
  const r2 = await request('POST', '/api/project/nonexistent/export');
  assert('Export non-existent project returns 404', r2.status === 404);

  // 12c. Delete document first
  const r3 = await request('DELETE', `/api/projects/${projectId}/documents/${documentId}`);
  assert('Delete document returns 200', r3.status === 200);
  assert('Delete document returns success', r3.body?.success === true);

  // 12d. Delete already-deleted document
  const r4 = await request('DELETE', `/api/projects/${projectId}/documents/${documentId}`);
  assert('Delete non-existent document returns 404', r4.status === 404);

  // 12e. Delete project
  const r5 = await request('DELETE', `/api/project/${projectId}`);
  console.log('  Delete project response:', r5.status, JSON.stringify(r5.body));
  assert('Delete project returns 200', r5.status === 200);
  assert('Delete project returns success', r5.body?.success === true);

  // 12f. Get deleted project
  const r6 = await request('GET', `/api/project/${projectId}`);
  assert('Get deleted project returns 404', r6.status === 404);

  // 12g. Delete non-existent project
  const r7 = await request('DELETE', '/api/project/nonexistent-id');
  assert('Delete non-existent project returns 404', r7.status === 404);
}

async function testSecondUserIsolation() {
  section('13. USER ISOLATION — Second user cannot access first user\'s projects');

  // Create second user
  const ts = Date.now();
  const r1 = await request('POST', '/api/auth/register', {
    name: 'Bob Tester', email: `bob${ts}@test.com`,
    user_id: `bob${ts}`, password: 'Test@5678'
  }, false);
  assert('Second user register returns 200', r1.status === 200);

  // Create a project as second user
  const r2 = await request('POST', '/api/project', {
    title: 'Bob Project', project_text: 'Bob\'s private project'
  });
  const bobProjectId = r2.body?.id;
  assert('Second user create project returns 200', r2.status === 200);

  // Save second user cookie, switch to first user
  const bobCookie = cookieJar;

  // Login as first user
  const firstUserTs = Object.keys(require('crypto')); // just need to re-login
  // We need to re-login as alice — but we don't have the ts. Use a fresh register.
  const ts2 = Date.now() + 1;
  await request('POST', '/api/auth/register', {
    name: 'Alice2', email: `alice2_${ts2}@test.com`,
    user_id: `alice2_${ts2}`, password: 'Test@1234'
  }, false);
  const aliceCookie = cookieJar;

  // Alice creates a project
  const r3 = await request('POST', '/api/project', { title: 'Alice Private', project_text: 'secret' });
  const aliceProjectId = r3.body?.id;

  // Switch to Bob — try to access Alice's project
  cookieJar = bobCookie;
  const r4 = await request('GET', `/api/project/${aliceProjectId}`);
  assert('Bob cannot access Alice\'s project (404)', r4.status === 404);

  // Bob cannot delete Alice's project
  const r5 = await request('DELETE', `/api/project/${aliceProjectId}`);
  assert('Bob cannot delete Alice\'s project (404)', r5.status === 404);

  // Bob cannot access Alice's documents
  const r6 = await request('GET', `/api/projects/${aliceProjectId}/documents`);
  assert('Bob cannot list Alice\'s documents (404)', r6.status === 404);

  // Cleanup: switch back to alice and delete her project
  cookieJar = aliceCookie;
  await request('DELETE', `/api/project/${aliceProjectId}`);

  // Switch to bob and delete his project
  cookieJar = bobCookie;
  await request('DELETE', `/api/project/${bobProjectId}`);
}

// ── main runner ──────────────────────────────────────────────
async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  AI SOFTWARE ENGINEER — EXHAUSTIVE UAT TEST SUITE');
  console.log('  Target: http://localhost:4000');
  console.log('█'.repeat(60));

  try {
    await testAuth();
    await testProjects();
    await testDocuments();
    console.log('\n  ⏳ Waiting 10s before LLM tests to avoid rate limits...');
    await sleep(10000);
    await testSdlcAndPlan();
    console.log('\n  ⏳ Waiting 15s between LLM sections...');
    await sleep(15000);
    await testSrs();
    console.log('\n  ⏳ Waiting 15s between LLM sections...');
    await sleep(15000);
    await testDesign();
    console.log('\n  ⏳ Waiting 15s between LLM sections...');
    await sleep(15000);
    await testCode();
    await testDocumentExtract();
    await testProjectInsights();
    console.log('\n  ⏳ Waiting 15s between LLM sections...');
    await sleep(15000);
    await testAiFeatures();
    await testMlFeatures();
    await testProjectExportAndDelete();
    await testSecondUserIsolation();
  } catch (err) {
    console.error('\n💥 FATAL TEST ERROR:', err.message);
    console.error(err.stack);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  FINAL RESULTS');
  console.log('═'.repeat(60));
  console.log(`  ✅ Passed : ${passed}`);
  console.log(`  ❌ Failed : ${failed}`);
  console.log(`  ⏭  Skipped: ${skipped}`);
  console.log(`  📊 Total  : ${passed + failed + skipped}`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\n  FAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    ❌ ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
