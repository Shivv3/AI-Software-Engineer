/**
 * EXHAUSTIVE UAT — AI Software Engineer Backend
 * Tests every API endpoint end-to-end with real dummy data.
 * Handles Gemini free-tier rate limits via smart retry + delays.
 */
'use strict';
const http = require('http');

// ─── state ────────────────────────────────────────────────────────────────────
let cookie = '';
let projectId = '';
let documentId = '';
let passed = 0, failed = 0, skipped = 0;
const failures = [];

// ─── helpers ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function req(method, path, body, useCookie = true) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 4000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(useCookie && cookie ? { Cookie: cookie } : {})
      }
    };
    const r = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.headers['set-cookie'])
          cookie = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        let json; try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// Retry on rate-limit (500 "busy" or 503 "unavailable")
async function llmReq(method, path, body, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await req(method, path, body);
    const err = res.body?.error || '';
    if ((res.status === 500 || res.status === 503) &&
        (err.includes('busy') || err.includes('unavailable') || err.includes('failed'))) {
      const wait = 25000 * (i + 1);
      console.log(`    ⏳ Rate-limited (${res.status}), waiting ${wait/1000}s… (retry ${i+1}/${retries})`);
      await sleep(wait);
      continue;
    }
    return res;
  }
  return req(method, path, body);
}

function ok(name, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; failures.push(name); }
}
function skip(name, why) { console.log(`  ⏭  ${name} (${why})`); skipped++; }
function section(t) { console.log(`\n${'═'.repeat(62)}\n  ${t}\n${'═'.repeat(62)}`); }

// ─── 1. AUTH ──────────────────────────────────────────────────────────────────
async function testAuth() {
  section('1. AUTH — Register / Login / Me / Logout');
  const ts = Date.now();
  const uid = `alice${ts}`, email = `alice${ts}@uat.test`;

  // register
  const r1 = await req('POST', '/api/auth/register',
    { name: 'Alice UAT', email, user_id: uid, password: 'Secure@123', phone_number: '9876543210', age: 25 }, false);
  console.log('  Register:', r1.status, JSON.stringify(r1.body).slice(0, 80));
  ok('Register 200', r1.status === 200);
  ok('Register returns user', r1.body?.user?.user_id === uid);
  ok('Session cookie set', !!cookie);

  // duplicate user_id
  const r2 = await req('POST', '/api/auth/register',
    { name: 'X', email: `x${ts}@uat.test`, user_id: uid, password: 'Secure@123' }, false);
  ok('Duplicate user_id → 400', r2.status === 400);

  // duplicate email
  const r3 = await req('POST', '/api/auth/register',
    { name: 'X', email, user_id: `x${ts}`, password: 'Secure@123' }, false);
  ok('Duplicate email → 400', r3.status === 400);

  // missing fields
  ok('Missing fields → 400', (await req('POST', '/api/auth/register', { name: 'X' }, false)).status === 400);

  // short password
  ok('Short password → 400',
    (await req('POST', '/api/auth/register',
      { name: 'X', email: `y${ts}@uat.test`, user_id: `y${ts}`, password: '123' }, false)).status === 400);

  // GET /me while logged in
  const me = await req('GET', '/api/auth/me');
  ok('GET /me → 200', me.status === 200);
  ok('GET /me returns name', me.body?.user?.name === 'Alice UAT');

  // logout
  ok('Logout → 200', (await req('POST', '/api/auth/logout')).status === 200);

  // /me after logout → 401
  ok('GET /me after logout → 401', (await req('GET', '/api/auth/me')).status === 401);

  // wrong password
  ok('Wrong password → 401',
    (await req('POST', '/api/auth/login', { user_id: uid, password: 'wrong' }, false)).status === 401);

  // correct login
  const login = await req('POST', '/api/auth/login', { user_id: uid, password: 'Secure@123' }, false);
  ok('Login → 200', login.status === 200);
  ok('Login returns user', login.body?.user?.user_id === uid);

  // unauthenticated access to protected route
  const savedCookie = cookie; cookie = '';
  ok('No-auth → 401', (await req('GET', '/api/projects')).status === 401);
  cookie = savedCookie;
}

// ─── 2. PROJECTS ──────────────────────────────────────────────────────────────
async function testProjects() {
  section('2. PROJECTS — CRUD + Isolation');

  // create
  const r1 = await req('POST', '/api/project',
    { title: 'UAT Task Manager', project_text: 'An AI-powered task management system for small teams with auth, CRUD tasks, and email notifications.' });
  console.log('  Create project:', r1.status, JSON.stringify(r1.body).slice(0, 80));
  ok('Create project → 200', r1.status === 200);
  ok('Create returns id', !!r1.body?.id);
  projectId = r1.body?.id;

  // list
  const r2 = await req('GET', '/api/projects');
  ok('List projects → 200', r2.status === 200 && Array.isArray(r2.body));
  ok('List contains new project', r2.body?.some(p => p.id === projectId));

  // get by id
  const r3 = await req('GET', `/api/project/${projectId}`);
  ok('Get project → 200', r3.status === 200);
  ok('Get project title correct', r3.body?.title === 'UAT Task Manager');

  // get non-existent
  ok('Get non-existent → 404', (await req('GET', '/api/project/does-not-exist')).status === 404);

  // versions (empty initially)
  const r5 = await req('GET', `/api/project/${projectId}/versions`);
  ok('Get versions → 200', r5.status === 200 && Array.isArray(r5.body));

  // versions auth check (now protected)
  const savedCookie = cookie; cookie = '';
  ok('Versions without auth → 401', (await req('GET', `/api/project/${projectId}/versions`)).status === 401);
  cookie = savedCookie;
}

// ─── 3. DOCUMENTS ─────────────────────────────────────────────────────────────
async function testDocuments() {
  section('3. PROJECT DOCUMENTS — CRUD');

  const srsContent = `The system shall allow users to register with email and password.
Users must be able to create tasks with title, description, and due date.
The system should send email notifications when tasks are assigned to team members.
The API must respond within 200ms for 95% of requests.
Users shall be able to delete their own tasks.
The system must support at least 100 concurrent users.`;

  // create
  const r1 = await req('POST', `/api/projects/${projectId}/documents`, {
    name: 'SRS-v1.txt', type: 'SRS', mime: 'text/plain',
    content: srsContent, useAsContext: true
  });
  console.log('  Create doc:', r1.status, JSON.stringify(r1.body).slice(0, 80));
  ok('Create doc → 201', r1.status === 201);
  ok('Create doc returns id', !!r1.body?.id);
  ok('useAsContext = true', r1.body?.useAsContext === true);
  documentId = r1.body?.id;

  // list
  const r2 = await req('GET', `/api/projects/${projectId}/documents`);
  ok('List docs → 200', r2.status === 200 && Array.isArray(r2.body));
  ok('List contains new doc', r2.body?.some(d => d.id === documentId));

  // update
  const r3 = await req('PATCH', `/api/projects/${projectId}/documents/${documentId}`,
    { name: 'SRS-v2.txt' });
  ok('Update doc → 200', r3.status === 200);
  ok('Name updated', r3.body?.name === 'SRS-v2.txt');

  // missing name
  ok('Create doc no name → 400',
    (await req('POST', `/api/projects/${projectId}/documents`, { content: 'x' })).status === 400);

  // missing content
  ok('Create doc no content → 400',
    (await req('POST', `/api/projects/${projectId}/documents`, { name: 'x' })).status === 400);

  // update non-existent
  ok('Update non-existent doc → 404',
    (await req('PATCH', `/api/projects/${projectId}/documents/fake-id`, { name: 'x' })).status === 404);

  // re-enable context for RAG tests
  await req('PATCH', `/api/projects/${projectId}/documents/${documentId}`, { useAsContext: true });
}

// ─── 4. SDLC + PLAN ───────────────────────────────────────────────────────────
async function testSdlcAndPlan() {
  section('4. SDLC RECOMMEND + PLAN GENERATE (LLM)');
  const desc = 'Build a task management web app for small teams with user auth, task CRUD, and email notifications.';

  console.log('  → /api/sdlc/recommend');
  const r1 = await llmReq('POST', '/api/sdlc/recommend',
    { project_text: desc, constraints: { team_size: 3, deadline: '6 months', budget: 'low' } });
  console.log('  SDLC:', r1.status, JSON.stringify(r1.body).slice(0, 120));
  ok('SDLC → 200', r1.status === 200);
  ok('SDLC has model', typeof r1.body?.model === 'string');
  ok('SDLC has why', typeof r1.body?.why === 'string');
  ok('SDLC confidence 0-1', typeof r1.body?.confidence === 'number' && r1.body.confidence >= 0 && r1.body.confidence <= 1);
  ok('SDLC missing text → 400', (await req('POST', '/api/sdlc/recommend', {})).status === 400);

  await sleep(3000);
  console.log('  → /api/plan/generate');
  const r2 = await llmReq('POST', '/api/plan/generate', { project_text: desc });
  console.log('  Plan:', r2.status, JSON.stringify(r2.body).slice(0, 120));
  ok('Plan → 200', r2.status === 200);
  ok('Plan has milestones', Array.isArray(r2.body?.milestones));
  ok('Plan missing text → 400', (await req('POST', '/api/plan/generate', {})).status === 400);
}

// ─── 5. SRS ───────────────────────────────────────────────────────────────────
async function testSrs() {
  section('5. SRS — Questions / Content / Save / Final / Status / Edit / Apply');

  console.log('  → /api/srs/generate-questions');
  const r1 = await llmReq('POST', '/api/srs/generate-questions',
    { project_description: 'A task management app for small teams with auth, CRUD tasks, and notifications.' });
  console.log('  Questions:', r1.status, JSON.stringify(r1.body).slice(0, 100));
  ok('SRS questions → 200', r1.status === 200);
  ok('SRS questions has sections', Array.isArray(r1.body?.sections));
  ok('SRS questions missing desc → 400', (await req('POST', '/api/srs/generate-questions', {})).status === 400);

  await sleep(3000);
  console.log('  → /api/srs/generate-content');
  const r2 = await llmReq('POST', '/api/srs/generate-content', {
    section_title: '1. Introduction', subsection_title: '1.1 Purpose',
    qa_pairs: [
      { question: 'What is the purpose?', answer: 'To help small teams manage tasks efficiently.' },
      { question: 'Who are the users?', answer: 'Team leads and members in small organizations.' }
    ]
  });
  console.log('  Content:', r2.status, JSON.stringify(r2.body).slice(0, 100));
  ok('SRS content → 200', r2.status === 200);
  ok('SRS content has content', typeof r2.body?.content === 'string' && r2.body.content.length > 10);

  // save section
  const r3 = await req('POST', '/api/srs/save-section', {
    project_id: projectId, section_id: '1_introduction', subsection_id: '1_1_purpose',
    content: r2.body?.content || 'This system helps teams manage tasks.', status: 'approved'
  });
  ok('Save section → 200', r3.status === 200);
  ok('Save section success', r3.body?.success === true);

  // get sections
  const r4 = await req('GET', `/api/srs/sections/${projectId}`);
  ok('Get sections → 200', r4.status === 200 && Array.isArray(r4.body));
  ok('Sections contains saved', r4.body?.some(s => s.section_id === '1_introduction'));

  // status
  const r5 = await req('GET', `/api/srs/status/${projectId}`);
  ok('SRS status → 200', r5.status === 200);
  ok('Status has completedSections', typeof r5.body?.completedSections === 'number');

  // generate final
  const r6 = await req('POST', `/api/srs/generate-final/${projectId}`);
  ok('Generate final → 200', r6.status === 200);
  ok('Final has content', typeof r6.body?.content === 'string' && r6.body.content.length > 50);

  await sleep(3000);
  console.log('  → /api/srs/edit');
  const r7 = await llmReq('POST', '/api/srs/edit', {
    project_id: projectId,
    selected_text: 'This system helps teams manage tasks.',
    instruction: 'Make this more formal and professional.',
    selection_start: 0, selection_end: 36,
    full_content: 'This system helps teams manage tasks. It supports CRUD operations.'
  });
  console.log('  Edit:', r7.status, JSON.stringify(r7.body).slice(0, 120));
  ok('SRS edit → 200', r7.status === 200);
  ok('SRS edit has suggestion', typeof r7.body?.suggestion_text === 'string');

  // apply
  if (r7.status === 200 && r7.body?.suggestion_text) {
    const r8 = await req('POST', '/api/srs/apply', {
      project_id: projectId, srs_content: r7.body.suggestion_text,
      prompt_text: 'Make formal', suggestion_text: r7.body.suggestion_text,
      selection_start: 0, selection_end: 36
    });
    ok('SRS apply → 200', r8.status === 200);
    ok('SRS apply returns version', typeof r8.body?.version === 'number');

    // verify version created
    const r9 = await req('GET', `/api/project/${projectId}/versions`);
    ok('Version history has entry', Array.isArray(r9.body) && r9.body.length > 0);

    // get specific version
    const r10 = await req('GET', `/api/project/${projectId}/version/${r8.body.version}`);
    ok('Get specific version → 200', r10.status === 200);
    ok('Version has srs_content', typeof r10.body?.srs_content === 'string');
  } else {
    skip('SRS apply', 'edit did not return suggestion_text');
  }

  // missing fields
  ok('SRS edit missing fields → 400',
    (await req('POST', '/api/srs/edit', { project_id: projectId })).status === 400);
  ok('SRS apply missing fields → 400',
    (await req('POST', '/api/srs/apply', { project_id: projectId })).status === 400);
}
