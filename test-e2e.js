/**
 * End-to-End Test Suite for AI Software Engineer
 * ────────────────────────────────────────────────
 * Tests all API endpoints systematically.
 * 
 * Usage:
 *   node test-e2e.js              # run all tests (backend must be running on :4000)
 *   node test-e2e.js --skip-llm   # skip LLM-dependent tests (faster, no API key needed)
 *
 * Prerequisites:
 *   - Backend running on http://localhost:4000
 *   - ML service running on http://127.0.0.1:8000 (optional — ML tests will skip gracefully)
 */

const http = require('http');
const https = require('https');

const BASE = 'http://localhost:4000';
const SKIP_LLM = process.argv.includes('--skip-llm');

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

let sessionCookie = '';

function request(method, path, body = null, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      timeout: timeoutMs,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        // Capture session cookie
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          const sid = setCookie.find((c) => c.startsWith('connect.sid'));
          if (sid) sessionCookie = sid.split(';')[0];
        }
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Test helpers ──────────────────────────────────────────────────────────────

const results = [];
let passed = 0;
let failed = 0;
let skipped = 0;

async function test(name, fn, { requiresLLM = false, requiresML = false } = {}) {
  if (requiresLLM && SKIP_LLM) {
    results.push({ name, status: 'SKIP', reason: '--skip-llm' });
    skipped++;
    process.stdout.write(`  ⏭  ${name} (skipped)\n`);
    return;
  }
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    passed++;
    process.stdout.write(`  ✅ ${name}\n`);
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message });
    failed++;
    process.stdout.write(`  ❌ ${name} — ${err.message}\n`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertStatus(res, expected, context = '') {
  if (res.status !== expected) {
    const body = typeof res.body === 'string' ? res.body.slice(0, 300) : JSON.stringify(res.body).slice(0, 300);
    throw new Error(`Expected status ${expected}, got ${res.status}${context ? ' (' + context + ')' : ''}. Body: ${body}`);
  }
}

// ─── Shared state ──────────────────────────────────────────────────────────────

const TS = Date.now();
const TEST_USER = {
  name: `E2E Tester ${TS}`,
  email: `e2e-${TS}@test.local`,
  user_id: `e2e_user_${TS}`,
  password: 'testpass123',
};
let projectId = null;

// ─── Test suites ───────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  AI Software Engineer — End-to-End Test Suite');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── 0. Server Health ─────────────────────────────────────────────────────
  console.log('▶ Server Health');
  await test('Server is reachable', async () => {
    const res = await request('GET', '/api/llm/status');
    assertStatus(res, 200);
    assert(res.body.providers, 'Should have providers array');
  });

  await test('LLM provider status shows configured providers', async () => {
    const res = await request('GET', '/api/llm/status');
    assertStatus(res, 200);
    const providers = res.body.providers;
    assert(Array.isArray(providers), 'providers should be array');
    assert(providers.length >= 2, 'Should have at least 2 providers');
    const names = providers.map(p => p.name);
    assert(names.includes('gemini'), 'Should include gemini');
    assert(names.includes('deepseek'), 'Should include deepseek');
    assert(names.includes('groq'), 'Should include groq');
    console.log(`    Providers: ${providers.map(p => `${p.name}(${p.healthy ? 'healthy' : 'unhealthy'})`).join(', ')}`);
  });

  // ── 1. Auth ──────────────────────────────────────────────────────────────
  console.log('\n▶ Authentication');

  await test('Register new user', async () => {
    const res = await request('POST', '/api/auth/register', TEST_USER);
    assertStatus(res, 200, 'register');
    assert(res.body.success, 'Registration should succeed');
    assert(res.body.user.user_id === TEST_USER.user_id, 'user_id should match');
  });

  await test('Duplicate registration fails', async () => {
    const res = await request('POST', '/api/auth/register', TEST_USER);
    assertStatus(res, 400);
  });

  await test('Logout', async () => {
    const res = await request('POST', '/api/auth/logout');
    assertStatus(res, 200);
    sessionCookie = '';
  });

  await test('Login with valid credentials', async () => {
    const res = await request('POST', '/api/auth/login', {
      user_id: TEST_USER.user_id,
      password: TEST_USER.password,
    });
    assertStatus(res, 200, 'login');
    assert(res.body.success, 'Login should succeed');
  });

  await test('Get current user', async () => {
    const res = await request('GET', '/api/auth/me');
    assertStatus(res, 200);
    assert(res.body.user.email === TEST_USER.email, 'Email should match');
  });

  await test('Login with wrong password fails', async () => {
    const oldCookie = sessionCookie;
    const res = await request('POST', '/api/auth/login', {
      user_id: TEST_USER.user_id,
      password: 'wrongpassword',
    });
    assertStatus(res, 401);
    sessionCookie = oldCookie; // restore valid session
  });

  // ── 2. Projects ──────────────────────────────────────────────────────────
  console.log('\n▶ Projects');

  await test('Create project', async () => {
    const res = await request('POST', '/api/project', {
      title: `E2E Test Project ${TS}`,
      project_text: 'An AI-powered software engineering workbench for requirements analysis, design generation, code generation, and quality validation.',
    });
    assertStatus(res, 200, 'create project');
    assert(res.body.id, 'Project should have an ID');
    projectId = res.body.id;
    console.log(`    Project ID: ${projectId}`);
  });

  await test('List projects', async () => {
    const res = await request('GET', '/api/projects');
    assertStatus(res, 200);
    assert(Array.isArray(res.body), 'Should return array');
    assert(res.body.length >= 1, 'Should have at least 1 project');
  });

  await test('Get project details', async () => {
    const res = await request('GET', `/api/project/${projectId}`);
    assertStatus(res, 200);
    assert(res.body.id === projectId, 'ID should match');
  });

  // ── 3. Project Documents ─────────────────────────────────────────────────
  console.log('\n▶ Project Documents');

  let docId;
  await test('Create project document', async () => {
    const res = await request('POST', `/api/projects/${projectId}/documents`, {
      name: 'Test SRS Document',
      type: 'SRS',
      content: 'The system shall provide user authentication with email and password. The system shall support project management with CRUD operations. The system shall generate SRS documents from user input.',
      useAsContext: true,
    });
    assertStatus(res, 201, 'create document');
    assert(res.body.id, 'Document should have ID');
    docId = res.body.id;
  });

  await test('List project documents', async () => {
    const res = await request('GET', `/api/projects/${projectId}/documents`);
    assertStatus(res, 200);
    assert(Array.isArray(res.body), 'Should return array');
    assert(res.body.length >= 1, 'Should have at least 1 document');
  });

  await test('Update document context flag', async () => {
    const res = await request('PATCH', `/api/projects/${projectId}/documents/${docId}`, {
      useAsContext: true,
    });
    assertStatus(res, 200);
    assert(res.body.useAsContext === true, 'useAsContext should be true');
  });

  // ── 4. Project Insights ──────────────────────────────────────────────────
  console.log('\n▶ Project Insights');

  await test('Get project health', async () => {
    const res = await request('GET', `/api/projects/${projectId}/health`);
    assertStatus(res, 200);
    assert(res.body.projectId === projectId, 'projectId should match');
    assert(res.body.phases, 'Should have phases');
  });

  await test('Sync requirements from text', async () => {
    const res = await request('POST', `/api/projects/${projectId}/requirements/sync`, {
      text: 'The system shall authenticate users. The system shall manage projects.',
    });
    assertStatus(res, 200);
  });

  await test('Get traceability data', async () => {
    const res = await request('GET', `/api/projects/${projectId}/traceability`);
    assertStatus(res, 200);
    assert(res.body.requirements, 'Should have requirements');
    assert(res.body.coverage_summary, 'Should have coverage_summary');
  });

  // ── 5. SDLC Recommendation (LLM) ────────────────────────────────────────
  console.log('\n▶ SDLC & Planning (LLM)');

  await test('SDLC recommendation', async () => {
    const res = await request('POST', '/api/sdlc/recommend', {
      project_text: 'Build a web-based project management tool with real-time collaboration, kanban boards, and automated deployment pipelines.',
    });
    assertStatus(res, 200, 'sdlc recommend');
    assert(res.body.model, 'Should have model recommendation');
    assert(res.body.why, 'Should have reasoning');
    console.log(`    Recommended model: ${res.body.model}`);
  }, { requiresLLM: true });

  await test('Plan generation', async () => {
    const res = await request('POST', '/api/plan/generate', {
      project_text: 'Build a web-based project management tool with task tracking and team collaboration features.',
    });
    assertStatus(res, 200, 'plan generate');
    assert(res.body.phases || res.body.milestones || res.body.plan, 'Should have plan structure');
  }, { requiresLLM: true });

  // ── 6. SRS Generation (LLM) ─────────────────────────────────────────────
  console.log('\n▶ SRS Generation (LLM)');

  await test('Generate SRS questions', async () => {
    const res = await request('POST', '/api/srs/generate-questions', {
      project_description: 'A cloud-based inventory management system for small businesses with barcode scanning and real-time stock updates.',
    });
    assertStatus(res, 200, 'srs questions');
    assert(res.body.sections, 'Should have sections');
    assert(Array.isArray(res.body.sections), 'sections should be array');
    console.log(`    Generated ${res.body.sections.length} sections`);
  }, { requiresLLM: true });

  await test('Generate SRS content for section', async () => {
    const res = await request('POST', '/api/srs/generate-content', {
      section_title: '1. Introduction',
      subsection_title: '1.1 Purpose',
      qa_pairs: [
        { question: 'What is the purpose of this system?', answer: 'To manage inventory for small businesses' },
        { question: 'Who will use this system?', answer: 'Small business owners and warehouse staff' },
      ],
    });
    assertStatus(res, 200, 'srs content');
    assert(res.body.content, 'Should have content');
  }, { requiresLLM: true });

  await test('Save SRS section', async () => {
    const res = await request('POST', '/api/srs/save-section', {
      project_id: projectId,
      section_id: '1_introduction',
      subsection_id: '1_1_purpose',
      content: 'This SRS describes the inventory management system.',
      status: 'approved',
    });
    assertStatus(res, 200);
    assert(res.body.success, 'Should succeed');
  });

  await test('Get SRS sections', async () => {
    const res = await request('GET', `/api/srs/sections/${projectId}`);
    assertStatus(res, 200);
    assert(Array.isArray(res.body), 'Should be array');
  });

  await test('Get SRS status', async () => {
    const res = await request('GET', `/api/srs/status/${projectId}`);
    assertStatus(res, 200);
    assert(typeof res.body.completionPercentage === 'number', 'Should have completion percentage');
  });

  await test('Generate final SRS', async () => {
    const res = await request('POST', `/api/srs/generate-final/${projectId}`);
    assertStatus(res, 200);
    assert(res.body.content, 'Should have content');
    assert(typeof res.body.totalSections === 'number', 'Should have totalSections');
  });

  await test('SRS edit', async () => {
    const res = await request('POST', '/api/srs/edit', {
      project_id: projectId,
      selected_text: 'This SRS describes the inventory management system.',
      instruction: 'Make this more formal and IEEE-compliant',
      selection_start: 0,
      selection_end: 50,
      full_content: 'This SRS describes the inventory management system. It covers all functional and non-functional requirements.',
    });
    assertStatus(res, 200, 'srs edit');
    assert(res.body.suggestion_text, 'Should have suggestion');
  }, { requiresLLM: true });

  // ── 7. Design (LLM) ─────────────────────────────────────────────────────
  console.log('\n▶ Design (LLM)');

  await test('System design generation', async () => {
    const res = await request('POST', '/api/design/system', {
      srs_text: 'The system shall be a web application using React frontend and Node.js backend. It shall support user authentication, project CRUD, and AI-powered code generation. The system shall use SQLite for data storage.',
      context: { framework: 'React + Node.js', database: 'SQLite' },
    });
    assertStatus(res, 200, 'system design');
    assert(res.body, 'Should have design response');
  }, { requiresLLM: true });

  await test('Database schema generation', async () => {
    const res = await request('POST', '/api/design/schema', {
      requirements_text: 'The system needs users with email/password, projects belonging to users, and documents belonging to projects.',
      output_format: 'auto',
    });
    assertStatus(res, 200, 'schema generation');
    assert(res.body, 'Should have schema response');
  }, { requiresLLM: true });

  await test('Diagram generation', async () => {
    const res = await request('POST', '/api/design/diagram', {
      diagram_type: 'sequence',
      project_info: 'User logs in, creates a project, generates SRS, and exports as document.',
    });
    assertStatus(res, 200, 'diagram');
    assert(res.body.mermaid_code, 'Should have mermaid_code');
    console.log(`    Mermaid code length: ${res.body.mermaid_code.length} chars`);
  }, { requiresLLM: true });

  // ── 8. Code (LLM) ───────────────────────────────────────────────────────
  console.log('\n▶ Code Generation / Translation / Testing / Review (LLM)');

  await test('Code generation', async () => {
    const res = await request('POST', '/api/code/generate', {
      description: 'A function that validates an email address using regex',
      target_language: 'javascript',
      include_tests: false,
    });
    assertStatus(res, 200, 'code generate');
    assert(res.body.code, 'Should have generated code');
    console.log(`    Code length: ${res.body.code.length} chars`);
  }, { requiresLLM: true });

  await test('Code translation', async () => {
    const res = await request('POST', '/api/code/translate', {
      source_language: 'javascript',
      target_language: 'python',
      source_code: 'function add(a, b) { return a + b; }',
    });
    assertStatus(res, 200, 'code translate');
    assert(res.body.code, 'Should have translated code');
  }, { requiresLLM: true });

  await test('Code testing', async () => {
    const res = await request('POST', '/api/code/test', {
      language: 'javascript',
      code: 'function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}',
      want_fix: false,
    });
    assertStatus(res, 200, 'code test');
    assert(Array.isArray(res.body.tests), 'Should have tests array');
  }, { requiresLLM: true });

  await test('Code review', async () => {
    const res = await request('POST', '/api/code/review', {
      language: 'javascript',
      code: 'function processData(data) {\n  var result = [];\n  for (var i = 0; i < data.length; i++) {\n    eval(data[i]);\n    result.push(data[i] * 2);\n  }\n  return result;\n}',
    });
    assertStatus(res, 200, 'code review');
    assert(res.body.summary, 'Should have summary');
    assert(Array.isArray(res.body.findings), 'Should have findings');
  }, { requiresLLM: true });

  // ── 9. Document Extraction ───────────────────────────────────────────────
  console.log('\n▶ Document Extraction');

  await test('Extract text from plain text data URI', async () => {
    const encoded = Buffer.from('This is a test document.').toString('base64');
    const res = await request('POST', '/api/documents/extract-text', {
      content: `data:text/plain;base64,${encoded}`,
    });
    assertStatus(res, 200);
    assert(res.body.text === 'This is a test document.', 'Should extract text');
  });

  await test('Extract text from plain string', async () => {
    const res = await request('POST', '/api/documents/extract-text', {
      content: 'This is plain text, not a data URI.',
    });
    assertStatus(res, 200);
    assert(res.body.text === 'This is plain text, not a data URI.', 'Should return text as-is');
  });

  // ── 10. Export ────────────────────────────────────────────────────────────
  console.log('\n▶ Export');

  await test('Export project as DOCX', async () => {
    const res = await request('POST', `/api/project/${projectId}/export`);
    assertStatus(res, 200);
    // Response is binary DOCX, just check it returned successfully
  });

  await test('Export design as DOCX', async () => {
    const res = await request('POST', '/api/design/export', {
      design_markdown: '# System Design\n\n## Architecture\n\nThe system uses a three-tier architecture.\n\n## Components\n\n- Frontend (React)\n- Backend (Express)\n- Database (SQLite)',
    });
    assertStatus(res, 200);
  });

  // ── 11. Version History ──────────────────────────────────────────────────
  console.log('\n▶ Version History');

  await test('Get project versions', async () => {
    const res = await request('GET', `/api/project/${projectId}/versions`);
    assertStatus(res, 200);
    assert(Array.isArray(res.body), 'Should be array');
  });

  // ── 12. SRS Apply ────────────────────────────────────────────────────────
  console.log('\n▶ SRS Apply');

  await test('Apply SRS edit', async () => {
    const res = await request('POST', '/api/srs/apply', {
      project_id: projectId,
      srs_content: 'This is the updated SRS content after AI edit.',
      prompt_text: 'Make it formal',
      suggestion_text: 'This document formally specifies...',
      selection_start: 0,
      selection_end: 20,
    });
    assertStatus(res, 200);
    assert(typeof res.body.version === 'number', 'Should have version number');
  });

  // ── 13. ML/NLP (requires ML service) ─────────────────────────────────────
  console.log('\n▶ ML/NLP Service');

  await test('ML service health (optional)', async () => {
    try {
      const url = new URL('/health', 'http://127.0.0.1:8000');
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      console.log('    ML service is running');
    } catch {
      console.log('    ML service not running (optional — ML tests will be skipped)');
    }
  });

  // ── 14. AI features ──────────────────────────────────────────────────────
  console.log('\n▶ AI Features (LLM)');

  await test('Requirement decomposition', async () => {
    const res = await request('POST', '/api/ai/requirements/decompose', {
      requirement: 'The system shall support user authentication with email/password and OAuth2 providers including Google and GitHub.',
    });
    assertStatus(res, 200, 'decompose');
    assert(res.body, 'Should have decomposition response');
  }, { requiresLLM: true });

  await test('Adversarial stress tester', async () => {
    const res = await request('POST', '/api/ai/requirements/adversarial', {
      requirement: 'The system shall handle up to 1000 concurrent users without performance degradation.',
    });
    assertStatus(res, 200, 'adversarial');
    assert(res.body, 'Should have adversarial response');
  }, { requiresLLM: true });

  // ── 15. Cleanup ──────────────────────────────────────────────────────────
  console.log('\n▶ Cleanup');

  await test('Delete project', async () => {
    const res = await request('DELETE', `/api/project/${projectId}`);
    assertStatus(res, 200);
    assert(res.body.success, 'Should succeed');
  });

  await test('Verify project deleted', async () => {
    const res = await request('GET', `/api/project/${projectId}`);
    assertStatus(res, 404);
  });

  await test('Logout', async () => {
    const res = await request('POST', '/api/auth/logout');
    assertStatus(res, 200);
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('═══════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter((r) => r.status === 'FAIL').forEach((r) => {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    });
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// ─── Entry ─────────────────────────────────────────────────────────────────────

runAllTests().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(2);
});
