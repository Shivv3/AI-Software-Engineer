const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
require('dotenv').config({ path: envPath });
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const Ajv = require('ajv');
const axios = require('axios');
const { Document, Packer, Paragraph } = require('docx');
const db = require('./db');
const llm = require('./services/llm');
const session = require('express-session');
const crypto = require('crypto');
const requireAuth = require('./middleware/requireAuth');
const createProjectDocumentsRouter = require('./routes/projectDocuments');
const createProjectInsightsRouter = require('./routes/projectInsights');
const { extractJson, parseLLMJson, formatContextBlock } = require('./services/llmUtils');
const { loadPrompt } = require('./services/prompts');
const { syncRequirementsFromText, extractRequirementSentences } = require('./services/artifacts');

// Document parsing libraries - using dynamic imports for ESM modules
let pdfParseModule;
let mammoth;

try {
  mammoth = require('mammoth');
  console.log('mammoth loaded successfully');
} catch (err) {
  console.warn('mammoth not available:', err.message);
}

// pdf-parse is ESM, will be loaded dynamically
async function loadPdfParse() {
  if (!pdfParseModule) {
    try {
      pdfParseModule = await import('pdf-parse');
      console.log('pdf-parse loaded successfully');
    } catch (err) {
      console.warn('pdf-parse not available:', err.message);
    }
  }
  return pdfParseModule;
}

const app = express();
const port = process.env.PORT || 4000;
const ajv = new Ajv();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

// Enable CORS
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

console.log('Database schema initialized safely.');

// Password hashing helper functions
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, hash) {
  const [salt, hashValue] = hash.split(':');
  const hashVerify = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hashValue === hashVerify;
}

// Session configuration
const sessionSecret = process.env.SESSION_SECRET
  || (process.env.NODE_ENV === 'production'
    ? null
    : 'dev-session-secret-ai-software-engineer-change-me');

if (!sessionSecret) {
  throw new Error('SESSION_SECRET is required when NODE_ENV=production');
}

if (!process.env.SESSION_SECRET && process.env.NODE_ENV !== 'production') {
  console.warn('SESSION_SECRET not set. Using stable development fallback; add SESSION_SECRET to .env for shared/dev-demo use.');
}

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Load schemas
const sdlcSchema = require('./schemas/sdlc_recommendation.schema.json');
const planSchema = require('./schemas/plan_requirements.schema.json');

// LLM wrapper — accepts optional { task } for model routing
async function callLLM(promptText, options = {}) {
  try {
    return await llm.generate(promptText, options);
  } catch (error) {
    if (error.message.includes('Rate limit exceeded')) {
      throw new Error('Server is busy, please try again in a few moments');
    }
    throw error;
  }
}

// LLM provider health check
app.get('/api/llm/status', (req, res) => {
  try {
    const status = llm.getStatus();
    res.json({ providers: status, keyPools: llm.getKeyPoolStatus?.() || {} });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Validation helper
async function validateLLMResponse(responseText, schema, retryPrompt) {
  try {
    const parsed = JSON.parse(extractJson(responseText));
    if (ajv.validate(schema, parsed)) {
      return parsed;
    }

    // Retry once with explicit schema instruction
    const retryResponse = await callLLM(retryPrompt, { task: 'fast' });
    const parsed2 = JSON.parse(extractJson(retryResponse));
    
    if (ajv.validate(schema, parsed2)) {
      return parsed2;
    }
    
    throw new Error('Failed to get valid JSON after retry');
  } catch (error) {
    console.error('Validation Error:', error.message);
    throw error;
  }
}

async function callMlService(path, payload) {
  const url = `${ML_SERVICE_URL}${path}`;
  const response = await axios.post(url, payload, { timeout: 60000 });
  return response.data;
}

function getContextDocuments(projectId) {
  if (!projectId) return [];
  return db.prepare(`
    SELECT name, type, content
    FROM project_documents
    WHERE project_id = ? AND use_as_context = 1
    ORDER BY updated_at DESC
  `).all(projectId);
}

function buildContextText(docs, maxChars = 12000) {
  const blocks = [];
  let total = 0;
  for (const doc of docs) {
    if (!doc.content || String(doc.content).startsWith('data:')) continue;
    const block = `---\n[${doc.type || 'Doc'}] ${doc.name}\n${doc.content}`;
    if (total + block.length > maxChars) break;
    blocks.push(block);
    total += block.length;
  }
  return blocks.join('\n\n');
}

function sendSSE(res, type, data = {}) {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}

function stripCodeFence(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/^```[\w-]*\s*\n?([\s\S]*?)\n?```\s*$/);
  return fenced ? fenced[1].trim() : raw;
}

function parseManifest(rawText) {
  const text = stripCodeFence(rawText);
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    throw new Error('The model did not return a JSON file manifest array.');
  }

  const parsed = JSON.parse(text.slice(firstBracket, lastBracket + 1));
  if (!Array.isArray(parsed)) {
    throw new Error('The generated file manifest is not an array.');
  }

  return parsed.map((entry, index) => {
    const normalized = {
      path: String(entry.path || '').replace(/\\/g, '/').replace(/^\/+/, '').trim(),
      purpose: String(entry.purpose || '').trim(),
      component: String(entry.component || '').trim(),
      language: String(entry.language || '').trim(),
      type: String(entry.type || 'source').trim().toLowerCase(),
    };

    if (!normalized.path || !normalized.purpose || !normalized.component || !normalized.language) {
      throw new Error(`Invalid manifest entry at index ${index}. Each entry needs path, purpose, component, and language.`);
    }
    if (normalized.path.includes('..')) {
      throw new Error(`Unsafe manifest path rejected: ${normalized.path}`);
    }
    if (!['source', 'test', 'config', 'documentation'].includes(normalized.type)) {
      normalized.type = normalized.component.toLowerCase().includes('test') ? 'test' : 'source';
    }
    return normalized;
  });
}

function extractCode(rawText) {
  const text = stripCodeFence(rawText);
  return text.trim() ? text.trim() : null;
}

function tryParseJson(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    try {
      return parseLLMJson(value);
    } catch {
      return null;
    }
  }
}

function extractSchemaFromDocuments(docs) {
  const schemaDocs = docs.filter((doc) => {
    const type = String(doc.type || '').toLowerCase();
    const name = String(doc.name || '').toLowerCase();
    const content = String(doc.content || '');
    return type.includes('schema') || name.includes('schema') || /\bCREATE\s+TABLE\b/i.test(content);
  });

  for (const doc of schemaDocs) {
    const parsed = tryParseJson(doc.content);
    if (parsed?.ddl_sql) return parsed.ddl_sql;
    const content = String(doc.content || '');
    const fencedSql = content.match(/```sql\s*([\s\S]*?)```/i);
    if (fencedSql) return fencedSql[1].trim();
    if (/\bCREATE\s+TABLE\b/i.test(content)) return content.trim();
  }
  return '';
}

function extractEntitiesFromDocuments(docs, schemaText) {
  const entities = new Set();

  String(schemaText || '').replace(/\bCREATE\s+TABLE\s+["`[]?([A-Za-z_][A-Za-z0-9_]*)/gi, (_m, name) => {
    entities.add(name);
    return _m;
  });

  docs.forEach((doc) => {
    const parsed = tryParseJson(doc.content);
    if (Array.isArray(parsed?.entities)) {
      parsed.entities.forEach((entity) => {
        if (entity?.name) entities.add(entity.name);
      });
    }

    const content = String(doc.content || '');
    if (/erDiagram/i.test(content)) {
      content.replace(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm, (_m, name) => {
        entities.add(name);
        return _m;
      });
    }
  });

  return Array.from(entities);
}

function getProjectContextArtifacts(projectId) {
  const docs = db.prepare(`
    SELECT id, name, type, content, updated_at
    FROM project_documents
    WHERE project_id = ?
    ORDER BY updated_at DESC
  `).all(projectId);
  const existingSchema = extractSchemaFromDocuments(docs);
  const entities = extractEntitiesFromDocuments(docs, existingSchema);
  return { docs, existingSchema, entities };
}

async function runWithConcurrency(items, concurrency, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

// Logging helper
async function logInteraction(projectId, endpoint, prompt, rawResponse, parsedResponse) {
  db.prepare(`
    INSERT INTO logs (project_id, endpoint, prompt, raw_response, parsed_response)
    VALUES (?, ?, ?, ?, ?)
  `).run(projectId, endpoint, prompt, rawResponse, JSON.stringify(parsedResponse));
}

// Endpoints
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api/code', requireAuth);
app.use('/api/design', requireAuth);
app.use('/api/documents', requireAuth);
app.use('/api/ml', requireAuth);
app.use('/api/ai', requireAuth);
app.use('/api/srs', requireAuth);
app.use('/api/project', requireAuth);
app.use('/api/projects', requireAuth);
app.use('/api/sdlc', requireAuth);
app.use('/api/plan', requireAuth);
app.use('/api/projects/:projectId/documents', createProjectDocumentsRouter(db));
app.use(createProjectInsightsRouter(db));

// Authentication endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, user_id, password, phone_number, age } = req.body;

    // Validation
    if (!name || !email || !user_id || !password) {
      return res.status(400).json({ error: 'Name, email, user ID, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user_id or email already exists
    const existingUser = db.prepare(`
      SELECT user_id, email FROM users WHERE user_id = ? OR email = ?
    `).get(user_id, email);

    if (existingUser) {
      if (existingUser.user_id === user_id) {
        return res.status(400).json({ error: 'User ID already exists' });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    // Create user
    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, user_id, name, email, password_hash, phone_number, age)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, user_id, name, email, passwordHash, phone_number || null, age || null);

    // Set session
    req.session.userId = userId;
    req.session.userIdDisplay = user_id;

    res.json({
      success: true,
      user: {
        id: userId,
        user_id: user_id,
        name: name,
        email: email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { user_id, password } = req.body;

    if (!user_id || !password) {
      return res.status(400).json({ error: 'User ID and password are required' });
    }

    // Find user
    const user = db.prepare(`
      SELECT id, user_id, name, email, password_hash FROM users WHERE user_id = ?
    `).get(user_id);

    if (!user) {
      return res.status(401).json({ error: 'Invalid user ID or password' });
    }

    // Verify password
    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid user ID or password' });
    }

    // Set session
    req.session.userId = user.id;
    req.session.userIdDisplay = user.user_id;

    res.json({
      success: true,
      user: {
        id: user.id,
        user_id: user.user_id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, user_id, name, email, phone_number, age FROM users WHERE id = ?
  `).get(req.session.userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user });
});

app.post('/api/sdlc/recommend', async (req, res) => {
  try {
    const { project_text, constraints } = req.body;
    
    if (!project_text) {
      return res.status(400).json({ error: 'Project description is required' });
    }

    const promptTemplate = await loadPrompt('sdlc_prompt.txt');
    const prompt = promptTemplate.replace('<<<USER_PROJECT>>>', 
      `${project_text}\n${constraints ? 'Constraints:\n' + JSON.stringify(constraints, null, 2) : ''}`);

    console.log('Calling LLM with prompt:', prompt);
    const rawResponse = await callLLM(prompt, { task: 'fast' });
    console.log('Raw LLM response:', rawResponse);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(extractJson(rawResponse));
    } catch (parseError) {
      console.error('Failed to parse LLM response:', parseError);
      throw new Error('Invalid JSON response from LLM');
    }

    // Basic validation before schema validation
    if (!parsedResponse || typeof parsedResponse !== 'object') {
      throw new Error('Invalid response format from LLM');
    }

    if (!parsedResponse.model || !parsedResponse.why) {
      throw new Error('Missing required fields in LLM response');
    }

    // Validate model value
    const validModels = ['Waterfall', 'Agile', 'Scrum', 'Kanban', 'Spiral', 'V-Model'];
    if (!validModels.some(model => parsedResponse.model.includes(model))) {
      throw new Error('Invalid SDLC model in response');
    }

    const validated = await validateLLMResponse(
      rawResponse,
      sdlcSchema,
      `Previous output invalid. Please return ONLY JSON matching schema: ${JSON.stringify(sdlcSchema)}. Project: ${project_text}`
    );

    await logInteraction(req.params.id || 'anonymous', '/api/sdlc/recommend', prompt, rawResponse, validated);

    // Format confidence as a number between 0 and 1
    if (validated.confidence) {
      validated.confidence = Math.max(0, Math.min(1, Number(validated.confidence)));
    } else {
      validated.confidence = 0.5; // Default confidence if not provided
    }

    res.json(validated);
  } catch (error) {
    console.error('SDLC recommendation error:', error);
    const errorMessage = error.message || 'Internal server error';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.post('/api/plan/generate', async (req, res) => {
  try {
    const { project_text } = req.body || {};
    if (!project_text || typeof project_text !== 'string') {
      return res.status(400).json({ error: 'project_text is required and must be a string' });
    }

    const promptTemplate = await loadPrompt('plan_prompt.txt');
    const prompt = promptTemplate.replace('<<<USER_PROJECT>>>', project_text);

    const rawResponse = await callLLM(prompt, { task: 'fast' });
    const validated = await validateLLMResponse(
      rawResponse,
      planSchema,
      `Previous output invalid. Please return ONLY JSON matching schema: ${JSON.stringify(planSchema)}. Project: ${project_text}`
    );

    await logInteraction(req.body?.project_id || 'plan_anonymous', '/api/plan/generate', prompt, rawResponse, validated);
    res.json(validated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate system design & tech stack suggestions based on SRS + context
app.post('/api/design/system', async (req, res) => {
  try {
    const { srs_text, context } = req.body;

    if (!srs_text || typeof srs_text !== 'string') {
      return res.status(400).json({ error: 'srs_text is required and must be a string' });
    }

    // Check if srs_text is still a data URI (should have been extracted on frontend)
    if (srs_text.startsWith('data:')) {
      console.warn('Received data URI in srs_text - this should have been extracted on frontend');
      return res.status(400).json({ 
        error: 'Document content must be extracted as text before sending. Please ensure PDFs are processed correctly.' 
      });
    }

    // Warn if content is very large (rough estimate: 100k chars ≈ 25k tokens)
    if (srs_text.length > 100000) {
      console.warn(`Large SRS content detected: ${srs_text.length} characters`);
    }

    const promptTemplate = await loadPrompt('system_design_prompt.txt');
    const contextJson = JSON.stringify(context || {}, null, 2);

    const prompt = promptTemplate
      .replace('<<<SRS_CONTENT>>>', srs_text)
      .replace('<<<CONTEXT_JSON>>>', contextJson);

    console.log(`Calling LLM for system design with SRS length: ${srs_text.length} chars`);
    const rawResponse = await callLLM(prompt, { task: 'reasoning' });

    let parsed;
    try {
      parsed = parseLLMJson(rawResponse);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('LLM did not return JSON');
      }
    } catch (parseErr) {
      console.warn('Design response was not valid JSON, returning raw text. Error:', parseErr.message);
      parsed = { design_text: rawResponse };
    }

    await logInteraction(
      req.params.id || 'design_anonymous',
      '/api/design/system',
      prompt.substring(0, 1000) + '...', // Truncate for logging
      rawResponse.substring(0, 1000) + '...', // Truncate for logging
      parsed
    );

    res.json(parsed);
  } catch (error) {
    console.error('System design generation error:', error);
    // Preserve the original error message from LLM service
    const errorMessage = error.message || 'Failed to generate system design';
    res.status(500).json({ error: errorMessage });
  }
});

// Generate database schema (SQL or NoSQL) from requirements/user stories
app.post('/api/design/schema', async (req, res) => {
  try {
    const { requirements_text, output_format = 'auto', context_text } = req.body || {};

    if (!requirements_text || typeof requirements_text !== 'string') {
      return res.status(400).json({ error: 'requirements_text is required and must be a string' });
    }

    if (requirements_text.startsWith('data:')) {
      return res.status(400).json({ error: 'Send extracted text, not raw file data. Please extract text first.' });
    }

    const promptTemplate = await loadPrompt('database_schema_prompt.txt');
    const prompt = promptTemplate
      .replace('<<<OUTPUT_FORMAT>>>', output_format || 'auto')
      .replace('<<<REQUIREMENTS_TEXT>>>', requirements_text)
      .replace('<<<CONTEXT_TEXT>>>', formatContextBlock(context_text || '(none provided)'));

    console.log(`Calling LLM for schema design. Input length: ${requirements_text.length} chars`);
    const rawResponse = await callLLM(prompt, { task: 'reasoning' });

    let parsed;
    try {
      parsed = parseLLMJson(rawResponse);
    } catch (parseError) {
      console.warn('Schema response was not valid JSON, returning raw text. Error:', parseError.message);
      parsed = { schema_text: rawResponse };
    }

    await logInteraction(
      req.params.id || 'design_schema',
      '/api/design/schema',
      prompt.substring(0, 1000) + '...',
      rawResponse.substring(0, 2000),
      parsed
    );

    res.json(parsed);
  } catch (error) {
    console.error('Database schema generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate database schema' });
  }
});

// Generate code from natural language description
app.post('/api/code/generate', async (req, res) => {
  try {
    const { description, target_language, style, context, include_tests } = req.body || {};

    if (!description || !target_language) {
      return res.status(400).json({ error: 'description and target_language are required' });
    }

    const promptTemplate = await loadPrompt('code_generate_prompt.txt');
    const prompt = promptTemplate
      .replace('<<<TARGET_LANGUAGE>>>', target_language)
      .replace('<<<DESCRIPTION>>>', description)
      .replace('<<<CONTEXT_BLOCK>>>', formatContextBlock(context))
      .replace('<<<STYLE>>>', style || 'none provided')
      .replace('<<<INCLUDE_TESTS>>>', include_tests ? 'yes' : 'no');

    const rawResponse = await callLLM(prompt, { task: 'code' });
    const parsed = parseLLMJson(rawResponse);

    if (!parsed || typeof parsed !== 'object' || !parsed.code) {
      throw new Error('LLM did not return code');
    }

    await logInteraction(
      req.params.id || 'code_generate',
      '/api/code/generate',
      prompt.substring(0, 1000) + '...',
      rawResponse.substring(0, 2000),
      parsed
    );

    res.json({
      language: parsed.language || target_language,
      filename_suggestion: parsed.filename_suggestion || null,
      code: parsed.code,
      summary: parsed.summary || '',
      run_steps: parsed.run_steps || '',
      tests_or_usage: parsed.tests_or_usage || null,
      assumptions: parsed.assumptions || null,
      warnings: parsed.warnings || null
    });
  } catch (error) {
    console.error('Code generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate code' });
  }
});

app.post('/api/code/generate-project', async (req, res) => {
  const { project_id, design_document_id, tech_stack, manifest, preview_only } = req.body || {};

  if (!project_id || !design_document_id || !tech_stack) {
    return res.status(400).json({ error: 'project_id, design_document_id, and tech_stack are required' });
  }

  let closed = false;
  req.on('aborted', () => {
    closed = true;
  });

  try {
    const project = db.prepare(`
      SELECT id FROM projects WHERE id = ? AND user_id = ?
    `).get(project_id, req.session.userId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const designDoc = db.prepare(`
      SELECT id, name, type, content, updated_at
      FROM project_documents
      WHERE id = ? AND project_id = ?
    `).get(design_document_id, project_id);

    if (!designDoc) {
      return res.status(404).json({ error: 'Design document not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.on('close', () => {
      if (!res.writableEnded) closed = true;
    });

    const { existingSchema, entities } = getProjectContextArtifacts(project_id);
    const designJson = tryParseJson(designDoc.content) || {
      name: designDoc.name,
      type: designDoc.type,
      content: designDoc.content,
    };
    let fileManifest = Array.isArray(manifest) ? parseManifest(JSON.stringify(manifest)) : null;

    if (!fileManifest) {
      sendSSE(res, 'manifest_start');
      const manifestTemplate = await loadPrompt('project_manifest_prompt.txt');
      const manifestPrompt = manifestTemplate
        .replace('<<<DESIGN_JSON>>>', JSON.stringify(designJson, null, 2))
        .replace('<<<TECH_STACK>>>', tech_stack)
        .replace('<<<EXISTING_SCHEMA>>>', existingSchema || '(none provided)')
        .replace('<<<ENTITIES>>>', entities.length ? JSON.stringify(entities, null, 2) : '(none provided)');

      const rawManifest = await callLLM(manifestPrompt, { task: 'code' });
      fileManifest = parseManifest(rawManifest);
    }

    sendSSE(res, 'manifest_done', { total: fileManifest.length, manifest: fileManifest });
    if (preview_only) {
      sendSSE(res, 'complete', { files: [], failed: [], manifest: fileManifest });
      res.end();
      return;
    }

    const fileTemplate = await loadPrompt('project_file_prompt.txt');
    const files = [];
    const failed = [];
    const concurrency = Math.max(1, Math.min(Number(process.env.PROJECT_GENERATION_CONCURRENCY || 3), 6));

    await runWithConcurrency(fileManifest, concurrency, async (entry, index) => {
      if (closed) return;
      sendSSE(res, 'file_start', {
        index,
        total: fileManifest.length,
        path: entry.path,
        language: entry.language,
        component: entry.component,
        fileType: entry.type,
      });

      try {
        let code;
        const normalizedPath = entry.path.toLowerCase().replace(/\\/g, '/');
        if (normalizedPath.endsWith('/schema.sql') && existingSchema) {
          code = existingSchema;
        } else if (normalizedPath.endsWith('/migrations/001_initial.sql') && existingSchema) {
          code = existingSchema;
        } else {
          const filePrompt = fileTemplate
            .replace('<<<FILE_PATH>>>', entry.path)
            .replace('<<<FILE_PURPOSE>>>', entry.purpose)
            .replace('<<<FILE_LANGUAGE>>>', entry.language)
            .replace('<<<FILE_TYPE>>>', entry.type)
            .replace('<<<DESIGN_JSON>>>', JSON.stringify(designJson, null, 2))
            .replace('<<<TECH_STACK>>>', tech_stack)
            .replace('<<<EXISTING_SCHEMA>>>', existingSchema || '(none provided)')
            .replace('<<<ENTITIES>>>', entities.length ? JSON.stringify(entities, null, 2) : '(none provided)');

          const rawCode = await callLLM(filePrompt, { task: 'code' });
          code = extractCode(rawCode);
        }

        if (!code) {
          failed.push({ path: entry.path, error: 'Empty response' });
          sendSSE(res, 'file_error', { index, path: entry.path, error: 'Empty response' });
          return;
        }

        files[index] = { ...entry, code };
        sendSSE(res, 'file_done', {
          index,
          path: entry.path,
          language: entry.language,
          component: entry.component,
          fileType: entry.type,
        });
      } catch (error) {
        failed.push({ path: entry.path, error: error.message });
        sendSSE(res, 'file_error', { index, path: entry.path, error: error.message || 'Failed to generate file' });
      }
    });

    if (!closed) {
      const generatedFiles = files.filter(Boolean);
      sendSSE(res, 'complete', { files: generatedFiles, failed });
      res.end();
    }
  } catch (error) {
    console.error('Project generation error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'Failed to generate project' });
    }
    sendSSE(res, 'error', { message: error.message || 'Failed to generate project' });
    res.end();
  }
});

// Translate source code between languages
app.post('/api/code/translate', async (req, res) => {
  try {
    const { source_language, target_language, source_code, instructions, context } = req.body || {};

    if (!source_language || !target_language || !source_code) {
      return res.status(400).json({ error: 'source_language, target_language, and source_code are required' });
    }

    const promptTemplate = await loadPrompt('code_translate_prompt.txt');
    const prompt = promptTemplate
      .replace('<<<SOURCE_LANGUAGE>>>', source_language)
      .replace('<<<TARGET_LANGUAGE>>>', target_language)
      .replace('<<<SOURCE_CODE>>>', source_code)
      .replace('<<<INSTRUCTIONS>>>', instructions || 'none')
      .replace('<<<CONTEXT_BLOCK>>>', formatContextBlock(context));

    const rawResponse = await callLLM(prompt, { task: 'code' });
    const parsed = parseLLMJson(rawResponse);

    if (!parsed || typeof parsed !== 'object' || !parsed.code) {
      throw new Error('LLM did not return translated code');
    }

    await logInteraction(
      req.params.id || 'code_translate',
      '/api/code/translate',
      prompt.substring(0, 1000) + '...',
      rawResponse.substring(0, 2000),
      parsed
    );

    res.json({
      target_language: parsed.target_language || target_language,
      code: parsed.code,
      summary: parsed.summary || '',
      notes: parsed.notes || null,
      assumptions: parsed.assumptions || null,
      warnings: parsed.warnings || null
    });
  } catch (error) {
    console.error('Code translation error:', error);
    res.status(500).json({ error: error.message || 'Failed to translate code' });
  }
});

// Automated test generation and virtual execution summary
app.post('/api/code/test', async (req, res) => {
  try {
    const { language, code, instructions, context, want_fix } = req.body || {};

    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }

    const promptTemplate = await loadPrompt('code_test_prompt.txt');
    const prompt = promptTemplate
      .replace('<<<LANGUAGE>>>', language || 'unspecified')
      .replace('<<<CODE>>>', code)
      .replace('<<<CONTEXT_BLOCK>>>', formatContextBlock(context))
      .replace('<<<INSTRUCTIONS>>>', instructions || 'comprehensive testing with all quality metrics and scalability tests')
      .replace('<<<WANT_FIX>>>', want_fix ? 'yes' : 'no');

    const rawResponse = await callLLM(prompt, { task: 'code' });
    const parsed = parseLLMJson(rawResponse);

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tests)) {
      throw new Error('LLM did not return a valid test report');
    }

    await logInteraction(
      req.params.id || 'code_test',
      '/api/code/test',
      prompt.substring(0, 1000) + '...',
      rawResponse.substring(0, 2000),
      parsed
    );

    res.json({
      summary: parsed.summary || '',
      overall_verdict: parsed.overall_verdict || 'mixed',
      overall_score: parsed.overall_score || 0,
      tests: parsed.tests || [],
      metrics: parsed.metrics || {},
      failures_summary: parsed.failures_summary || '',
      critical_issues: parsed.critical_issues || [],
      recommendations: parsed.recommendations || [],
      improved_code: want_fix ? parsed.improved_code || null : null,
    });
  } catch (error) {
    console.error('Code test error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate and run tests' });
  }
});

// Automated static code review
app.post('/api/code/review', async (req, res) => {
  try {
    const { language, code, context, focus } = req.body || {};

    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }

    const promptTemplate = await loadPrompt('code_review_prompt.txt');
    const prompt = promptTemplate
      .replace('<<<LANGUAGE>>>', language || 'unspecified')
      .replace('<<<CODE>>>', code)
      .replace('<<<CONTEXT_BLOCK>>>', formatContextBlock(context))
      .replace('<<<FOCUS>>>', focus || 'general best practices');

    const rawResponse = await callLLM(prompt, { task: 'review' });
    const parsed = parseLLMJson(rawResponse);

    if (!parsed || typeof parsed !== 'object' || !parsed.summary || !Array.isArray(parsed.findings)) {
      throw new Error('LLM did not return a valid review document');
    }

    await logInteraction(
      req.params.id || 'code_review',
      '/api/code/review',
      prompt.substring(0, 1000) + '...',
      rawResponse.substring(0, 2000),
      parsed
    );

    res.json({
      summary: parsed.summary,
      overall_score: parsed.overall_score,
      positives: parsed.positives || [],
      findings: parsed.findings || [],
      recommendations_summary: parsed.recommendations_summary || '',
    });
  } catch (error) {
    console.error('Code review error:', error);
    res.status(500).json({ error: error.message || 'Failed to review code' });
  }
});

// Helper to determine if text is code block
function isCodeBlock(text) {
  // Check for common code indicators
  const codeIndicators = [
    /^```[\s\S]*```$/m,  // Markdown code blocks
    /^    [\s\S]*$/m,    // 4-space indented code
    /^\t[\s\S]*$/m,      // Tab indented code
    /{[\s\S]*}|function\s*\(|class\s+\w+|import\s+|export\s+|const\s+|let\s+|var\s+/m // Code-like content
  ];
  return codeIndicators.some(pattern => pattern.test(text));
}

// Helper to extract paragraph containing cursor
function extractRelevantParagraph(text, cursorPosition) {
  const paragraphs = text.split(/\n\s*\n/);
  let currentPos = 0;
  
  for (const paragraph of paragraphs) {
    const paragraphLength = paragraph.length + 2; // +2 for the newlines
    if (currentPos <= cursorPosition && currentPos + paragraphLength >= cursorPosition) {
      return paragraph.trim();
    }
    currentPos += paragraphLength;
  }
  
  return text; // Fallback to full text if paragraph not found
}

app.post('/api/srs/edit', async (req, res) => {
  try {
    const { 
      project_id, 
      selected_text, 
      instruction, 
      selection_start, 
      selection_end,
      full_content 
    } = req.body;

    if (!project_id || !selected_text || !instruction || !full_content) {
      return res.status(400).json({
        error: 'project_id, selected_text, instruction, and full_content are required',
      });
    }

    // Handle text size and code blocks
    let textToProcess = selected_text;
    let isCode = false;
    let contextNote = '';

    // Check if selection is too large (more than ~500 words)
    if (selected_text.split(/\s+/).length > 500) {
      textToProcess = extractRelevantParagraph(selected_text, 
        Math.floor((selection_end - selection_start) / 2) + selection_start);
      contextNote = 'Note: Due to length, only processing the relevant paragraph. ';
    }

    // Check for code blocks
    if (isCodeBlock(textToProcess)) {
      isCode = true;
      contextNote += 'Contains code blocks - preserving code structure unless explicitly requested. ';
    }

    const promptTemplate = await loadPrompt('edit_prompt.txt');
    let prompt = promptTemplate
      .replace('<<<USER_INSTRUCTION>>>', instruction)
      .replace('<<<SELECTED_TEXT>>>', textToProcess);

    // Add context about code if present
    if (isCode) {
      prompt += '\nNote: The text contains code blocks. Unless specifically requested, preserve code structure and only modify comments or documentation.';
    }

    const rawResponse = await callLLM(prompt, { task: 'fast' });
    const parsed = parseLLMJson(rawResponse);
    
    if (!parsed.suggestion_text || parsed.suggestion_text.trim().length === 0) {
      throw new Error('Invalid or empty suggestion received');
    }

    // For code blocks, validate that structure is preserved unless explicitly requested
    if (isCode && !instruction.toLowerCase().includes('code') && 
        !instruction.toLowerCase().includes('implement')) {
      const originalStructure = textToProcess.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').trim();
      const newStructure = parsed.suggestion_text.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').trim();
      
      if (originalStructure !== newStructure) {
        throw new Error('Code structure was modified when it should have been preserved');
      }
    }

    // Add context note to explanation if present
    if (contextNote) {
      parsed.explanation = `${contextNote}${parsed.explanation || ''}`;
    }

    // Validate confidence score
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
      parsed.confidence = 0.5; // Default confidence if invalid
    }

    await logInteraction(project_id, '/api/srs/edit', prompt, rawResponse, parsed);
    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apply SRS edit and create new version
app.post('/api/srs/apply', async (req, res) => {
  try {
    const { 
      project_id, 
      srs_content, 
      prompt_text, 
      suggestion_text,
      selection_start,
      selection_end
    } = req.body;

    if (!project_id || !srs_content || !suggestion_text) {
      return res.status(400).json({
        error: 'project_id, srs_content, and suggestion_text are required',
      });
    }

    // Get current version number
    const lastVersion = db.prepare(`
      SELECT version 
      FROM srs_versions 
      WHERE project_id = ? 
      ORDER BY version DESC 
      LIMIT 1
    `).get(project_id);

    const newVersion = (lastVersion?.version || 0) + 1;

    // Start transaction
    db.transaction(() => {
      // Update project's current SRS content
    db.prepare(`
      UPDATE projects 
      SET srs_content = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(srs_content, project_id);
    syncRequirementsFromText(db, project_id, srs_content, 'srs');

      // Create new version record
      db.prepare(`
        INSERT INTO srs_versions (
          project_id,
          version,
          editor,
          srs_content,
          prompt_text,
          suggestion_text,
          selection_start,
          selection_end
        ) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)
      `).run(
        project_id,
        newVersion,
        srs_content,
        prompt_text,
        suggestion_text,
        selection_start,
        selection_end
      );
    })();

    res.json({ version: newVersion });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new project
app.post('/api/project', requireAuth, (req, res) => {
  try {
    const { title, project_text } = req.body;
    const id = 'p' + Date.now();
    const userId = req.session.userId;

    db.prepare(`
      INSERT INTO projects (id, user_id, title, project_text, srs_content)
      VALUES (?, ?, ?, ?, '')
    `).run(id, userId, title, project_text);

    const project = db.prepare(`
      SELECT id, title as name, created_at as createdAt
      FROM projects
      WHERE id = ?
    `).get(id);

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete project
app.delete('/api/project/:id', requireAuth, (req, res) => {
  try {
    const userId = req.session.userId;
    const projectId = req.params.id;

    // Verify project belongs to user
    const project = db.prepare(`
      SELECT id FROM projects WHERE id = ? AND user_id = ?
    `).get(projectId, userId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete project (cascade will handle related records)
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all projects for the current user
app.get('/api/projects', requireAuth, (req, res) => {
  try {
    const userId = req.session.userId;
    const projects = db.prepare(`
      SELECT id, title as name, created_at as createdAt
      FROM projects
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId);

    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get project details with latest SRS content
app.get('/api/project/:id', requireAuth, (req, res) => {
  try {
    const userId = req.session.userId;
    const project = db.prepare(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM srs_versions WHERE project_id = p.id) as version_count
      FROM projects p
      WHERE p.id = ? AND p.user_id = ?
    `).get(req.params.id, userId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get project version history
app.get('/api/project/:id/versions', requireAuth, (req, res) => {
  try {
    const versions = db.prepare(`
      SELECT 
        version,
        timestamp,
        editor,
        prompt_text,
        suggestion_text,
        selection_start,
        selection_end
      FROM srs_versions
      WHERE project_id = ?
      ORDER BY version DESC
    `).all(req.params.id);

    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific version content
app.get('/api/project/:id/version/:version', requireAuth, (req, res) => {
  try {
    const versionData = db.prepare(`
      SELECT *
      FROM srs_versions
      WHERE project_id = ? AND version = ?
    `).get(req.params.id, req.params.version);

    if (!versionData) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json(versionData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate SRS questions based on project description
app.post('/api/srs/generate-questions', async (req, res) => {
  try {
    const { project_description } = req.body;
    
    if (!project_description) {
      return res.status(400).json({ error: 'Project description is required' });
    }

    const promptTemplate = await loadPrompt('srs_generate_prompt.txt');
    const prompt = promptTemplate.replace('<<<PROJECT_DESCRIPTION>>>', project_description);

    const rawResponse = await callLLM(prompt, { task: 'fast' });
    const parsed = parseLLMJson(rawResponse);

    // Validate the response structure
    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      throw new Error('Invalid response structure from LLM');
    }

    await logInteraction('srs_questions', '/api/srs/generate-questions', prompt, rawResponse, parsed);
    res.json(parsed);
  } catch (error) {
    console.error('SRS questions generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate content for a specific section based on Q&A
app.post('/api/srs/generate-content', async (req, res) => {
  try {
    const { section_title, subsection_title, qa_pairs } = req.body;
    
    if (!section_title || !subsection_title || !qa_pairs) {
      return res.status(400).json({ error: 'Section details and Q&A pairs are required' });
    }

    const promptTemplate = await loadPrompt('srs_content_prompt.txt');
    const qaText = qa_pairs.map((qa, index) => 
      `Q${index + 1}: ${qa.question}\nA${index + 1}: ${qa.answer}`
    ).join('\n\n');

    const prompt = promptTemplate
      .replace('<<<SECTION_TITLE>>>', section_title)
      .replace('<<<SUBSECTION_TITLE>>>', subsection_title)
      .replace('<<<QA_PAIRS>>>', qaText);

    const rawResponse = await callLLM(prompt, { task: 'fast' });
    const parsed = parseLLMJson(rawResponse);

    // Validate the response
    if (!parsed.content) {
      throw new Error('No content generated');
    }

    await logInteraction('srs_content', '/api/srs/generate-content', prompt, rawResponse, parsed);
    res.json(parsed);
  } catch (error) {
    console.error('SRS content generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save SRS section content
app.post('/api/srs/save-section', async (req, res) => {
  try {
    const { project_id, section_id, subsection_id, content, status } = req.body;
    


    if (!project_id || !section_id || !subsection_id || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Normalize IDs by converting dots to underscores
    const normalizedSectionId = section_id.replace(/\./g, '_');
    const normalizedSubsectionId = subsection_id.replace(/\./g, '_');
    
    // Insert or update section content
    const result = db.prepare(`
      INSERT OR REPLACE INTO srs_sections 
      (project_id, section_id, subsection_id, content, status, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(project_id, normalizedSectionId, normalizedSubsectionId, content, status || 'approved');



    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Save section error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all sections for a project
app.get('/api/srs/sections/:project_id', (req, res) => {
  try {
    const sections = db.prepare(`
      SELECT * FROM srs_sections 
      WHERE project_id = ? 
      ORDER BY section_id, subsection_id
    `).all(req.params.project_id);

    res.json(sections);
  } catch (error) {
    console.error('Get sections error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate final SRS document (supports partial completion)
app.post('/api/srs/generate-final/:project_id', async (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.project_id);
    const sections = db.prepare(`
      SELECT * FROM srs_sections 
      WHERE project_id = ? AND status = 'approved'
      ORDER BY section_id, subsection_id
    `).all(req.params.project_id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Define the complete SRS structure
    const srsStructure = {
      '1_introduction': {
        title: '1. Introduction',
        subsections: {
          '1_1_purpose': '1.1 Purpose',
          '1_2_scope': '1.2 Scope', 
          '1_3_definitions': '1.3 Definitions, Acronyms and Abbreviations',
          '1_4_references': '1.4 References',
          '1_5_overview': '1.5 Overview'
        }
      },
      '2_overall_description': {
        title: '2. Overall Description',
        subsections: {
          '2_1_product_perspective': '2.1 Product Perspective',
          '2_2_product_functions': '2.2 Product Functions',
          '2_3_user_characteristics': '2.3 User Characteristics',
          '2_4_constraints': '2.4 Constraints',
          '2_5_assumptions': '2.5 Assumptions and Dependencies'
        }
      },
      '3_specific_requirements': {
        title: '3. Specific Requirements',
        subsections: {
          '3_1_external_interfaces': '3.1 External Interfaces',
          '3_2_functions': '3.2 Functions',
          '3_3_performance': '3.3 Performance Requirements',
          '3_4_logical_database': '3.4 Logical Database Requirements',
          '3_5_design_constraints': '3.5 Design Constraints',
          '3_6_software_attributes': '3.6 Software System Attributes'
        }
      }
    };

    // Create sections map for quick lookup
    const sectionsMap = {};
    sections.forEach(section => {
      // Store both possible key formats to handle different ID structures
      const key1 = `${section.section_id}_${section.subsection_id}`;
      const key2 = `${section.section_id}_${section.subsection_id.replace(/\./g, '_')}`;
      sectionsMap[key1] = section.content;
      sectionsMap[key2] = section.content;

    });

    // Generate complete SRS with placeholders for missing sections
    let finalContent = `Software Requirements Specification\n`;
    finalContent += `Project: ${project.title || 'Untitled Project'}\n`;
    finalContent += `Generated on: ${new Date().toLocaleDateString()}\n\n`;

    // Add project description if available
    if (project.project_text) {
      finalContent += `Project Description:\n${project.project_text}\n\n`;
    }

    // Generate content for each section
    Object.entries(srsStructure).forEach(([sectionId, section]) => {
      finalContent += `${section.title}\n${'='.repeat(section.title.length)}\n\n`;
      
      Object.entries(section.subsections).forEach(([subsectionId, subsectionTitle]) => {
        finalContent += `${subsectionTitle}\n${'-'.repeat(subsectionTitle.length)}\n`;
        
        const contentKey = `${sectionId}_${subsectionId}`;
        const content = sectionsMap[contentKey];
        

        
        if (content) {
          finalContent += `${content}\n\n`;
        } else {
          finalContent += `[This section is pending completion]\n\n`;
        }
      });
    });

    // Update project with current SRS content
    db.prepare(`
      UPDATE projects 
      SET srs_content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(finalContent, req.params.project_id);
    syncRequirementsFromText(db, req.params.project_id, finalContent, 'srs');

    res.json({ 
      content: finalContent,
      completedSections: sections.length,
      totalSections: Object.values(srsStructure).reduce((total, section) => 
        total + Object.keys(section.subsections).length, 0)
    });
  } catch (error) {
    console.error('Generate final SRS error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current SRS document status
app.get('/api/srs/status/:project_id', async (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.project_id);
    const sections = db.prepare(`
      SELECT * FROM srs_sections 
      WHERE project_id = ? AND status = 'approved'
      ORDER BY section_id, subsection_id
    `).all(req.params.project_id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const totalSections = 16; // Total expected sections based on IEEE standard
    const completedSections = sections.length;
    const completionPercentage = Math.round((completedSections / totalSections) * 100);

    res.json({
      project: project,
      completedSections: completedSections,
      totalSections: totalSections,
      completionPercentage: completionPercentage,
      sections: sections,
      canExport: completedSections > 0
    });
  } catch (error) {
    console.error('Get SRS status error:', error);
    res.status(500).json({ error: error.message });
  }
});

const { createProjectDocument } = require('./services/docx-generator');
const { createDesignDocument } = require('./services/design-docx');

app.post('/api/project/:id/export', async (req, res) => {
  try {
    const project = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM srs_versions WHERE project_id = p.id) as version_count
      FROM projects p
      WHERE p.id = ?
    `).get(req.params.id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const doc = createProjectDocument(project);
    const buffer = await Packer.toBuffer(doc);
    const filename = `srs_project_${req.params.id}_v${project.version_count}.docx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

// Extract text from PDF, DOCX, or other documents (base64 data URI)
app.post('/api/documents/extract-text', async (req, res) => {
  try {
    const { content, mime } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required and must be a string' });
    }

    // Helper to extract base64 data from data URI
    const extractBase64 = (dataUri) => {
      const parts = dataUri.split(',');
      if (parts.length < 2) {
        throw new Error('Invalid data URI format');
      }
      return parts[1];
    };

    // Check if it's a PDF data URI
    if (content.startsWith('data:application/pdf;base64,')) {
      try {
        // Load pdf-parse dynamically (it's an ESM module)
        const pdfParseModule = await loadPdfParse();
        if (!pdfParseModule) {
          return res.status(500).json({ 
            error: 'PDF parsing is not available. Please ensure pdf-parse is installed.' 
          });
        }

        const base64Data = extractBase64(content);
        const buffer = Buffer.from(base64Data, 'base64');
        
        if (buffer.length === 0) {
          return res.status(400).json({ error: 'Empty PDF file' });
        }
        
        // pdf-parse exports as default or named export
        const pdfParse = pdfParseModule.default || pdfParseModule;
        const data = await pdfParse(buffer);
        
        const extractedText = data.text || '';
        
        if (!extractedText.trim()) {
          console.warn('PDF extracted but contains no text (might be image-based PDF)');
        }
        
        res.json({ 
          text: extractedText, 
          pageCount: data.numpages || 0,
          metadata: {
            info: data.info || {},
            metadata: data.metadata || {}
          }
        });
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        throw new Error(`Failed to parse PDF: ${pdfError.message}`);
      }
    } 
    // Check if it's a DOCX data URI
    else if (content.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,') ||
             content.startsWith('data:application/msword;base64,') ||
             (mime && (mime.includes('wordprocessingml') || mime.includes('msword'))) ||
             content.startsWith('data:application/octet-stream;base64,') && mime && mime.includes('word')) {
      
      if (!mammoth) {
        return res.status(500).json({ 
          error: 'DOCX parsing is not available. Please ensure mammoth is installed.' 
        });
      }

      try {
        const base64Data = extractBase64(content);
        const buffer = Buffer.from(base64Data, 'base64');
        
        if (buffer.length === 0) {
          return res.status(400).json({ error: 'Empty DOCX file' });
        }
        
        // mammoth.extractRawText() for plain text, or .convertToHtml() for formatted
        const result = await mammoth.extractRawText({ buffer });
        const extractedText = result.value || '';
        
        if (!extractedText.trim()) {
          console.warn('DOCX extracted but contains no text');
        }
        
        // Get messages/warnings if any
        const messages = result.messages || [];
        if (messages.length > 0) {
          console.warn('DOCX parsing messages:', messages);
        }
        
        res.json({ 
          text: extractedText, 
          pageCount: 1,
          messages: messages.map(m => m.message)
        });
      } catch (docxError) {
        console.error('DOCX parsing error:', docxError);
        throw new Error(`Failed to parse DOCX: ${docxError.message}`);
      }
    } 
    // Handle text data URIs
    else if (content.startsWith('data:text/')) {
      try {
        const base64Data = extractBase64(content);
        const text = Buffer.from(base64Data, 'base64').toString('utf-8');
        res.json({ text, pageCount: 1 });
      } catch (textError) {
        console.error('Text extraction error:', textError);
        throw new Error(`Failed to extract text from data URI: ${textError.message}`);
      }
    } 
    // Handle other data URIs - try to detect by mime type
    else if (content.startsWith('data:')) {
      // Check mime type if provided
      if (mime) {
        if (mime.includes('pdf')) {
          // Try PDF parsing
          try {
            const pdfParseModule = await loadPdfParse();
            if (pdfParseModule) {
              const base64Data = extractBase64(content);
              const buffer = Buffer.from(base64Data, 'base64');
              const pdfParse = pdfParseModule.default || pdfParseModule;
              const data = await pdfParse(buffer);
              return res.json({ 
                text: data.text || '', 
                pageCount: data.numpages || 0 
              });
            }
          } catch (err) {
            console.warn('Failed to parse as PDF:', err.message);
          }
        } else if (mime.includes('word') || mime.includes('document')) {
          // Try DOCX parsing
          if (mammoth) {
            try {
              const base64Data = extractBase64(content);
              const buffer = Buffer.from(base64Data, 'base64');
              const result = await mammoth.extractRawText({ buffer });
              return res.json({ 
                text: result.value || '', 
                pageCount: 1 
              });
            } catch (err) {
              console.warn('Failed to parse as DOCX:', err.message);
            }
          }
        }
      }
      
      return res.status(400).json({ 
        error: 'Unsupported file type. Supported formats: PDF, DOCX, and text files. ' +
               'Received: ' + (content.substring(0, 100) + '...') 
      });
    } 
    // Already plain text
    else {
      res.json({ text: content, pageCount: 1 });
    }
  } catch (error) {
    console.error('Text extraction error:', error);
    res.status(500).json({ error: error.message || 'Failed to extract text from document' });
  }
});

// Export system design markdown as a DOCX document
app.post('/api/design/export', async (req, res) => {
  try {
    const { design_markdown } = req.body;

    if (!design_markdown || typeof design_markdown !== 'string') {
      return res.status(400).json({ error: 'design_markdown is required and must be a string' });
    }

    const doc = createDesignDocument(design_markdown);
    const buffer = await Packer.toBuffer(doc);
    const filename = `system_design_${Date.now()}.docx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    console.error('Design export error:', error);
    res.status(500).json({ error: 'Failed to export system design document' });
  }
});

// Generate diagram from project information
app.post('/api/design/diagram', async (req, res) => {
  try {
    const { diagram_type, project_info, context_text, selected_file_content } = req.body;

    if (!diagram_type || typeof diagram_type !== 'string') {
      return res.status(400).json({ error: 'diagram_type is required and must be a string' });
    }

    const validTypes = ['sequence', 'er', 'dataflow', 'usecase', 'architecture'];
    if (!validTypes.includes(diagram_type)) {
      return res.status(400).json({ 
        error: `Invalid diagram_type. Must be one of: ${validTypes.join(', ')}` 
      });
    }

    // Combine project info and context
    let combinedInfo = project_info || '';
    if (selected_file_content && typeof selected_file_content === 'string') {
      combinedInfo = combinedInfo 
        ? `${combinedInfo}\n\n---\nAdditional context from selected file:\n${selected_file_content}`
        : selected_file_content;
    }
    if (context_text && typeof context_text === 'string') {
      combinedInfo = combinedInfo 
        ? `${combinedInfo}\n\n---\nAdditional context:\n${context_text}`
        : context_text;
    }

    if (!combinedInfo || !combinedInfo.trim()) {
      return res.status(400).json({ 
        error: 'Either project_info, context_text, or selected_file_content must be provided' 
      });
    }

    // Load prompt template
    const promptTemplate = await loadPrompt('diagram_generation_prompt.txt');
    const prompt = promptTemplate
      .replace('<<<DIAGRAM_TYPE>>>', diagram_type)
      .replace('<<<PROJECT_INFO>>>', combinedInfo)
      .replace('<<<CONTEXT_TEXT>>>', formatContextBlock(context_text || ''));

    console.log(`Calling LLM for ${diagram_type} diagram generation`);
    const rawResponse = await callLLM(prompt, { task: 'creative' });

    // Extract Mermaid code from response (remove markdown code fences if present)
    let mermaidCode = rawResponse.trim();
    mermaidCode = mermaidCode.replace(/^```mermaid\s*/i, '').replace(/```\s*$/i, '');
    mermaidCode = mermaidCode.replace(/^```\s*/i, '').replace(/```\s*$/i, '');
    mermaidCode = mermaidCode.trim();

    if (!mermaidCode) {
      throw new Error('LLM did not return valid Mermaid code');
    }

    // Normalize whitespace: replace non-breaking spaces with normal spaces
    mermaidCode = mermaidCode.replace(/\u00a0/g, ' ');

    // ── Normalize graph edges (expand & separators) ─────────────────────
    const normalizeGraphEdges = (code) => {
      const lines = code.split('\n');
      const normalized = [];

      const normalizeEdgeLine = (line) => {
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '';
        if (!line.includes('-->')) {
          return [line];
        }

        const parts = line.split('-->');
        if (parts.length < 2) return [line];

        const lhsRaw = parts[0].replace(/%%.*/, '').trim();
        const rhsFull = parts.slice(1).join('-->').trim();

        if (!lhsRaw || !rhsFull) return [line];

        let label = '';
        let targetRaw = rhsFull;
        const labelMatch = rhsFull.match(/^\|\s*([^|]+?)\s*\|\s*(.+)$/);
        if (labelMatch) {
          label = labelMatch[1].trim();
          targetRaw = labelMatch[2].trim();
        } else {
          const plainMatch = rhsFull.match(/^([^\s]+)(.*)$/);
          if (plainMatch) {
            targetRaw = plainMatch[1].trim();
          }
        }

        const sources = lhsRaw.split('&').map((s) => s.trim()).filter(Boolean);
        const targets = targetRaw.split('&').map((t) => t.trim()).filter(Boolean);
        if (!sources.length || !targets.length) return [line];

        const labelSegment = label ? `|${label}|` : '';
        const expanded = [];
        sources.forEach((s) => {
          targets.forEach((t) => {
            expanded.push(`${indent}${s} -->${labelSegment} ${t}`);
          });
        });
        return expanded;
      };

      lines.forEach((line) => {
        normalizeEdgeLine(line).forEach((l) => normalized.push(l));
      });
      return normalized.join('\n');
    };

    // For non-ER diagrams, normalize labels and expand & edges
    if (diagram_type !== 'er') {
      // Convert "A --> B: Label" to "A -->|Label| B"
      mermaidCode = mermaidCode.replace(
        /([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)\s*:\s*([^\n]+)/g,
        (_m, a, b, label) => `${a} -->|${label.trim()}| ${b}`
      );
      // Convert "A -- Label --> B" to pipe form
      mermaidCode = mermaidCode.replace(
        /([A-Za-z0-9_]+)\s*--\s*([^>\n]+?)\s*-->\s*([A-Za-z0-9_]+)/g,
        (_m, a, label, b) => `${a} -->|${label.trim()}| ${b}`
      );
      mermaidCode = normalizeGraphEdges(mermaidCode);
    }

    // Normalize ER diagrams: SQL types → Mermaid types + uppercase entities
    if (diagram_type === 'er') {
      mermaidCode = mermaidCode
        .replace(/\b(SERIAL|INT|INTEGER)\s+/gi, 'int ')
        .replace(/\b(VARCHAR\([^)]+\)|CHAR\([^)]+\)|TEXT|STRING)\s+/gi, 'string ')
        .replace(/\b(DATE|DATETIME|TIMESTAMP)\s+/gi, 'date ')
        .replace(/\b(NUMERIC\([^)]+\)|DECIMAL\([^)]+\)|FLOAT|DOUBLE|REAL)\s+/gi, 'number ')
        .replace(/\b(BOOLEAN|BOOL)\s+/gi, 'boolean ');
      
      mermaidCode = mermaidCode.replace(/erDiagram\s*\n\s*(\w+)/g, (match, entityName) => {
        return `erDiagram\n    ${entityName.toUpperCase()}`;
      });
      
      mermaidCode = mermaidCode.replace(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm, (match, indent, entityName) => {
        return `${indent}${entityName.toUpperCase()} {`;
      });
      
      mermaidCode = mermaidCode.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*(\|\|--[o|]?\{|\}o--o\{)\s*([A-Za-z_][A-Za-z0-9_]*)(\s*:\s*[^\n]*)?/g, (match, entity1, connector, entity2, relationshipName) => {
        return `${entity1.toUpperCase()} ${connector} ${entity2.toUpperCase()}${relationshipName || ''}`;
      });
    }

    // ── Return mermaid code — client renders it ─────────────────────────
    await logInteraction(
      req.params.id || 'diagram_generation',
      '/api/design/diagram',
      prompt.substring(0, 1000) + '...',
      `Mermaid code generated (${mermaidCode.length} chars)`,
      { diagram_type }
    );

    res.json({
      mermaid_code: mermaidCode,
      diagram_type: diagram_type
    });
  } catch (error) {
    console.error('Diagram generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate diagram' });
  }
});

async function disabledDuplicateDiagramHandler() {
  try {
    if (!diagram_type || typeof diagram_type !== 'string') {
      return res.status(400).json({ error: 'diagram_type is required and must be a string' });
    }

    const validTypes = ['sequence', 'er', 'dataflow', 'usecase', 'architecture'];
    if (!validTypes.includes(diagram_type)) {
      return res.status(400).json({ 
        error: `Invalid diagram_type. Must be one of: ${validTypes.join(', ')}` 
      });
    }

    // Combine project info and context
    let combinedInfo = project_info || '';
    if (selected_file_content && typeof selected_file_content === 'string') {
      combinedInfo = combinedInfo 
        ? `${combinedInfo}\n\n---\nAdditional context from selected file:\n${selected_file_content}`
        : selected_file_content;
    }
    if (context_text && typeof context_text === 'string') {
      combinedInfo = combinedInfo 
        ? `${combinedInfo}\n\n---\nAdditional context:\n${context_text}`
        : context_text;
    }

    if (!combinedInfo || !combinedInfo.trim()) {
      return res.status(400).json({ 
        error: 'Either project_info, context_text, or selected_file_content must be provided' 
      });
    }

    // Load prompt template
    const promptTemplate = await loadPrompt('diagram_generation_prompt.txt');
    const prompt = promptTemplate
      .replace('<<<DIAGRAM_TYPE>>>', diagram_type)
      .replace('<<<PROJECT_INFO>>>', combinedInfo)
      .replace('<<<CONTEXT_TEXT>>>', formatContextBlock(context_text || ''));

    console.log(`Calling LLM for ${diagram_type} diagram generation`);
    const rawResponse = await callLLM(prompt, { task: 'creative' });

    // Extract Mermaid code from response (remove markdown code fences if present)
    let mermaidCode = rawResponse.trim();
    mermaidCode = mermaidCode.replace(/^```mermaid\s*/i, '').replace(/```\s*$/i, '');
    mermaidCode = mermaidCode.replace(/^```\s*/i, '').replace(/```\s*$/i, '');
    mermaidCode = mermaidCode.trim();

    if (!mermaidCode) {
      throw new Error('LLM did not return valid Mermaid code');
    }

    // Normalize whitespace: replace non-breaking spaces with normal spaces
    mermaidCode = mermaidCode.replace(/\u00a0/g, ' ');

    const normalizeGraphEdges = (code) => {
      const lines = code.split('\n');
      const normalized = [];

      const normalizeEdgeLine = (line) => {
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '';
        if (!line.includes('-->')) {
          return [line];
        }

        const parts = line.split('-->');
        if (parts.length < 2) return [line];

        const lhsRaw = parts[0].replace(/%%.*/, '').trim();
        const rhsFull = parts.slice(1).join('-->').trim(); // in case arrow appears inside labels

        if (!lhsRaw || !rhsFull) return [line];

        // Extract label and target
        let label = '';
        let targetRaw = rhsFull;
        const labelMatch = rhsFull.match(/^\|\s*([^|]+?)\s*\|\s*(.+)$/);
        if (labelMatch) {
          label = labelMatch[1].trim();
          targetRaw = labelMatch[2].trim();
        } else {
          // try form with quoted label in the middle A -- "L" --> B already handled upstream; here only plain --> target
          const plainMatch = rhsFull.match(/^([^\s]+)(.*)$/);
          if (plainMatch) {
            targetRaw = plainMatch[1].trim();
            // ignore trailing comment
          }
        }

        const sources = lhsRaw.split('&').map((s) => s.trim()).filter(Boolean);
        const targets = targetRaw.split('&').map((t) => t.trim()).filter(Boolean);
        if (!sources.length || !targets.length) return [line];

        const labelSegment = label ? `|${label}|` : '';
        const expanded = [];
        sources.forEach((s) => {
          targets.forEach((t) => {
            expanded.push(`${indent}${s} -->${labelSegment} ${t}`);
          });
        });
        return expanded;
      };

      lines.forEach((line) => {
        normalizeEdgeLine(line).forEach((l) => normalized.push(l));
      });
      return normalized.join('\n');
    };

    // For non-ER diagrams, normalize sequence-style colon labels to pipe labels and expand ampersand edges
    if (diagram_type !== 'er') {
      // Convert "A --> B: Label" to "A -->|Label| B"
      mermaidCode = mermaidCode.replace(
        /([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)\s*:\s*([^\n]+)/g,
        (_m, a, b, label) => `${a} -->|${label.trim()}| ${b}`
      );
      // Convert "A -- Label --> B" to pipe form for consistency
      mermaidCode = mermaidCode.replace(
        /([A-Za-z0-9_]+)\s*--\s*([^>\n]+?)\s*-->\s*([A-Za-z0-9_]+)/g,
        (_m, a, label, b) => `${a} -->|${label.trim()}| ${b}`
      );
      // Expand edges that incorrectly use '&' to represent multiple sources/targets
      mermaidCode = normalizeGraphEdges(mermaidCode);
    }

    // Normalize Mermaid code for ER diagrams: convert SQL types to Mermaid-compatible types
    if (diagram_type === 'er') {
      // Convert SQL data types to Mermaid-compatible types
      mermaidCode = mermaidCode
        // Convert SERIAL, INT, INTEGER to int
        .replace(/\b(SERIAL|INT|INTEGER)\s+/gi, 'int ')
        // Convert VARCHAR, CHAR, TEXT, STRING to string
        .replace(/\b(VARCHAR\([^)]+\)|CHAR\([^)]+\)|TEXT|STRING)\s+/gi, 'string ')
        // Convert DATE, DATETIME, TIMESTAMP to date
        .replace(/\b(DATE|DATETIME|TIMESTAMP)\s+/gi, 'date ')
        // Convert NUMERIC, DECIMAL, FLOAT, DOUBLE, REAL to number
        .replace(/\b(NUMERIC\([^)]+\)|DECIMAL\([^)]+\)|FLOAT|DOUBLE|REAL)\s+/gi, 'number ')
        // Convert BOOLEAN, BOOL to boolean
        .replace(/\b(BOOLEAN|BOOL)\s+/gi, 'boolean ');
      
      // Ensure entity names are uppercase (common Mermaid convention)
      // This is a simple heuristic - convert first word after erDiagram to uppercase
      mermaidCode = mermaidCode.replace(/erDiagram\s*\n\s*(\w+)/g, (match, entityName) => {
        return `erDiagram\n    ${entityName.toUpperCase()}`;
      });
      
      // Convert entity definitions to uppercase (lines that start with entity name followed by {)
      mermaidCode = mermaidCode.replace(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm, (match, indent, entityName) => {
        return `${indent}${entityName.toUpperCase()} {`;
      });
      
      // Convert relationship entity names to uppercase (preserve relationship name after colon)
      mermaidCode = mermaidCode.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*(\|\|--[o|]?\{|\}o--o\{)\s*([A-Za-z_][A-Za-z0-9_]*)(\s*:\s*[^\n]*)?/g, (match, entity1, connector, entity2, relationshipName) => {
        return `${entity1.toUpperCase()} ${connector} ${entity2.toUpperCase()}${relationshipName || ''}`;
      });
    }

    // Render Mermaid diagram to image
    let imageBuffer;
    let imageBase64;
    
    try {
      // Use puppeteer to render Mermaid diagram
      let puppeteer;
      try {
        puppeteer = require('puppeteer');
      } catch (requireError) {
        throw new Error('Puppeteer is not installed. Please run: npm install puppeteer');
      }
      
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      
      // Escape HTML-sensitive characters in Mermaid code
      const escapedMermaid = mermaidCode
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Create HTML with Mermaid
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
          <style>
            body { margin: 0; padding: 20px; background: white; }
            .mermaid { display: flex; justify-content: center; }
          </style>
        </head>
        <body>
          <div class="mermaid">
            ${escapedMermaid}
          </div>
          <script>
            mermaid.initialize({ startOnLoad: true, theme: 'default' });
          </script>
        </body>
        </html>
      `;
      
      // Set up error logging
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });
      page.on('pageerror', error => {
        errors.push(error.message);
      });
      
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Wait a bit for Mermaid to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check for Mermaid errors
      const mermaidErrors = await page.evaluate(() => {
        const errorElements = document.querySelectorAll('.mermaid-error, .error');
        return Array.from(errorElements).map(el => el.textContent);
      });
      
      if (mermaidErrors.length > 0) {
        throw new Error(`Mermaid rendering errors: ${mermaidErrors.join('; ')}`);
      }
      
      // Wait for Mermaid to render
      try {
        await page.waitForSelector('.mermaid svg', { timeout: 10000 });
      } catch (waitError) {
        // Check if there's an error message in the page
        const errorInfo = await page.evaluate(() => {
          const errorEl = document.querySelector('.mermaid-error');
          const mermaidEl = document.querySelector('.mermaid');
          return {
            error: errorEl ? errorEl.textContent : null,
            mermaidContent: mermaidEl ? mermaidEl.textContent : null,
            innerHTML: document.body.innerHTML.substring(0, 500)
          };
        });
        
        if (errors.length > 0) {
          throw new Error(`Mermaid failed to render. Console errors: ${errors.join('; ')}`);
        }
        if (errorInfo.error) {
          throw new Error(`Mermaid error: ${errorInfo.error}`);
        }
        throw new Error(`Timeout waiting for Mermaid SVG. Page content preview: ${errorInfo.innerHTML}`);
      }
      
      // Get the SVG element
      const svgElement = await page.$('.mermaid svg');
      if (!svgElement) {
        const errorInfo = await page.evaluate(() => {
          return document.body.innerHTML.substring(0, 500);
        });
        throw new Error(`Failed to render Mermaid diagram. Page content: ${errorInfo}`);
      }
      
      // Take screenshot of the SVG element only
      const boundingBox = await svgElement.boundingBox();
      if (!boundingBox) {
        throw new Error('Could not get bounding box for SVG element');
      }
      
      imageBuffer = await page.screenshot({
        type: 'png',
        clip: {
          x: Math.max(0, boundingBox.x - 20), // Add padding
          y: Math.max(0, boundingBox.y - 20),
          width: boundingBox.width + 40,
          height: boundingBox.height + 40
        }
      });
      
      await browser.close();
      
      // Convert to base64
      imageBase64 = imageBuffer.toString('base64');
    } catch (renderError) {
      console.error('Diagram rendering error:', renderError);
      // Fallback: return the Mermaid code so frontend can render it
      return res.json({
        mermaid_code: mermaidCode,
        image_data: null,
        error: 'Failed to render diagram as image. Mermaid code provided for client-side rendering.',
        render_error: renderError.message
      });
    }

    // Return image as base64 data URI
    const imageDataUri = `data:image/png;base64,${imageBase64}`;

    await logInteraction(
      req.params.id || 'diagram_generation',
      '/api/design/diagram',
      prompt.substring(0, 1000) + '...',
      `Mermaid code generated (${mermaidCode.length} chars)`,
      { diagram_type, has_image: true }
    );

    res.json({
      mermaid_code: mermaidCode,
      image_data: imageDataUri,
      diagram_type: diagram_type
    });
  } catch (error) {
    console.error('Diagram generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate diagram' });
  }
}

// ML/NLP routes
app.post('/api/ml/requirements/analyze', async (req, res) => {
  try {
    const { requirements, project_id, srs_text } = req.body || {};
    let reqs = requirements;

    if ((!Array.isArray(reqs) || reqs.length === 0) && srs_text) {
      reqs = extractRequirementSentences(srs_text);
    }

    if (!Array.isArray(reqs) || reqs.length === 0) {
      return res.status(422).json({ error: 'requirements must be a non-empty array' });
    }

    const limited = reqs.slice(0, 50);
    const mlRes = await callMlService('/nlp/requirements/analyze', {
      requirements: limited,
      project_id,
    });
    const scores = mlRes.scores || [];

    const flagged = scores.filter((item) => item.score < 80);
    if (flagged.length > 0) {
      const explanationPrompt = `You are a software requirements expert. For each requirement and its issues, provide a concise one-sentence explanation and a fix suggestion.\n\nReturn ONLY a JSON array with objects: {"text":"...","explanation":"..."}.\n\nItems:\n${JSON.stringify(flagged.map((s) => ({ text: s.text, issues: s.issues.map((i) => i.type) })))}\n`;
      try {
        const rawExplanation = await callLLM(explanationPrompt, { task: 'fast' });
        const explanations = parseLLMJson(rawExplanation);
        if (Array.isArray(explanations)) {
          const explanationMap = new Map(explanations.map((e) => [e.text, e.explanation]));
          scores.forEach((s) => {
            if (explanationMap.has(s.text)) {
              s.gemini_explanation = explanationMap.get(s.text);
            }
          });
        }
      } catch (_) {
        // Best-effort explanation; ignore failures
      }
    }

    if (project_id && scores.length > 0) {
      const update = db.prepare(`
        UPDATE requirements
        SET quality_score = ?, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ? AND LOWER(text) = LOWER(?)
      `);
      db.transaction(() => {
        scores.forEach((score) => update.run(score.score, project_id, score.text));
      })();
    }

    res.json({ scores });
  } catch (error) {
    console.error('ML requirements analyze error:', error);
    res.status(503).json({ error: 'Analysis service unavailable' });
  }
});

app.post('/api/ml/conflict/detect', async (req, res) => {
  try {
    const { requirements, project_id } = req.body || {};
    if (!Array.isArray(requirements) || requirements.length === 0) {
      return res.status(422).json({ error: 'requirements must be a non-empty array' });
    }

    const mlRes = await callMlService('/nlp/conflict/detect', {
      requirements: requirements.slice(0, 50),
      project_id,
    });

    const conflicts = mlRes.conflict_pairs || [];
    const explainTargets = conflicts
      .filter((item) => item.confidence > 0.6)
      .slice(0, 6);

    if (explainTargets.length > 0) {
      const promptTemplate = await loadPrompt('conflict_explanation_prompt.txt');
      const results = await Promise.all(
        explainTargets.map(async (item) => {
          const prompt = promptTemplate
            .replace('<<<TYPE>>>', item.conflict_type)
            .replace('<<<REQ_A>>>', item.req_a)
            .replace('<<<REQ_B>>>', item.req_b);
          try {
            const raw = await callLLM(prompt, { task: 'fast' });
            const parsed = parseLLMJson(raw);
            return { key: `${item.req_a_index}-${item.req_b_index}`, explanation: parsed.explanation || raw };
          } catch (err) {
            return { key: `${item.req_a_index}-${item.req_b_index}`, explanation: '' };
          }
        })
      );
      const map = new Map(results.map((r) => [r.key, r.explanation]));
      conflicts.forEach((item) => {
        const key = `${item.req_a_index}-${item.req_b_index}`;
        if (map.has(key)) {
          item.explanation = map.get(key);
        }
      });
    }

    res.json({
      conflict_pairs: conflicts,
      graph: mlRes.graph || { nodes: [], edges: [] },
      summary: mlRes.summary || {},
    });
  } catch (error) {
    console.error('ML conflict detect error:', error);
    res.status(503).json({ error: 'Conflict detection unavailable' });
  }
});

app.post('/api/ml/defect/predict', async (req, res) => {
  try {
    const { code, language } = req.body || {};
    if (!code || !language) {
      return res.status(422).json({ error: 'code and language are required' });
    }
    const mlRes = await callMlService('/code/defect/predict', { code, language });
    res.json(mlRes);
  } catch (error) {
    console.error('ML defect predict error:', error);
    res.status(503).json({ error: 'Defect prediction service unavailable' });
  }
});

app.post('/api/ml/traceability/analyze', async (req, res) => {
  try {
    const { requirements, code_functions } = req.body || {};
    if (!Array.isArray(requirements) || !Array.isArray(code_functions)) {
      return res.status(422).json({ error: 'requirements and code_functions are required' });
    }
    const mlRes = await callMlService('/code/traceability/analyze', { requirements, code_functions });
    res.json(mlRes);
  } catch (error) {
    console.error('ML traceability analyze error:', error);
    res.status(503).json({ error: 'Traceability service unavailable' });
  }
});

app.post('/api/ml/defect/refactor', async (req, res) => {
  try {
    const { code, language } = req.body || {};
    if (!code || !language) {
      return res.status(422).json({ error: 'code and language are required' });
    }

    const before = await callMlService('/code/defect/predict', { code, language });
    const highRisk = (before.functions || []).filter((f) => f.risk_label === 'High');
    const riskSignals = highRisk.length
      ? highRisk.map((f) => `${f.name}: ${(f.shap_explanation || []).join('; ')}`).join('\n')
      : 'No high-risk functions flagged. Improve clarity, modularity, and error handling.';

    const promptTemplate = await loadPrompt('refactor_loop_prompt.txt');
    const prompt = promptTemplate.replace('<<<RISK_SIGNALS>>>', riskSignals).replace('<<<CODE>>>', code);
    const raw = await callLLM(prompt, { task: 'code' });
    const parsed = parseLLMJson(raw);
    const refactoredCode = parsed.refactored_code || parsed.code || code;

    const after = await callMlService('/code/defect/predict', { code: refactoredCode, language });

    res.json({
      before,
      after,
      refactored_code: refactoredCode,
      summary: parsed.summary || '',
    });
  } catch (error) {
    console.error('Closed-loop refactor error:', error);
    res.status(503).json({ error: 'Refactor service unavailable' });
  }
});

// GenAI feature routes
app.post('/api/ai/reviews/multi-agent', async (req, res) => {
  try {
    const { project_id, context_text } = req.body || {};
    const docs = context_text ? [] : getContextDocuments(project_id);
    const context = context_text || buildContextText(docs);

    if (!context) {
      return res.status(422).json({ error: 'No context provided. Mark documents as context first.' });
    }

    const [archPrompt, secPrompt, perfPrompt] = await Promise.all([
      loadPrompt('multi_agent_architect_review.txt'),
      loadPrompt('multi_agent_security_review.txt'),
      loadPrompt('multi_agent_performance_review.txt'),
    ]);

    const [archRaw, secRaw, perfRaw] = await Promise.all([
      callLLM(archPrompt.replace('<<<CONTEXT>>>', context), { task: 'review' }),
      callLLM(secPrompt.replace('<<<CONTEXT>>>', context), { task: 'review' }),
      callLLM(perfPrompt.replace('<<<CONTEXT>>>', context), { task: 'review' }),
    ]);

    const parseOrFallback = (raw) => {
      try {
        return parseLLMJson(raw);
      } catch {
        return { summary: raw, risks: [], actions: [] };
      }
    };

    res.json({
      architect: parseOrFallback(archRaw),
      security: parseOrFallback(secRaw),
      performance: parseOrFallback(perfRaw),
    });
  } catch (error) {
    console.error('Multi-agent review error:', error);
    res.status(503).json({ error: 'Multi-agent review unavailable' });
  }
});

app.post('/api/ai/rag/answer', async (req, res) => {
  try {
    const { project_id, question } = req.body || {};
    if (!question) {
      return res.status(422).json({ error: 'question is required' });
    }

    const docs = getContextDocuments(project_id).filter((doc) => !String(doc.content).startsWith('data:'));
    if (docs.length === 0) {
      return res.status(422).json({ error: 'No context documents available' });
    }

    const mlRes = await callMlService('/rag/query', {
      project_id: project_id || 'default',
      question,
      top_k: 3,
      documents: docs.map((doc, idx) => ({
        id: `${project_id || 'project'}-${idx}`,
        name: doc.name,
        content: doc.content,
      })),
    });

    const matches = mlRes.matches || [];
    if (!matches.length) {
      return res.json({ answer: 'Not enough information', confidence: 0.0, sources: [], matches: [] });
    }

    const context = matches
      .map((m) => `---\n[${m.name}]\n${m.text}`)
      .join('\n\n');

    const promptTemplate = await loadPrompt('rag_answer_prompt.txt');
    const prompt = promptTemplate.replace('<<<CONTEXT>>>', context).replace('<<<QUESTION>>>', question);
    const raw = await callLLM(prompt, { task: 'fast' });
    let parsed = {};
    try {
      parsed = parseLLMJson(raw);
    } catch {
      parsed = { answer: raw };
    }

    res.json({
      answer: parsed.answer || raw,
      confidence: parsed.confidence ?? 0.5,
      sources: parsed.sources || matches.map((m) => m.name),
      matches,
    });
  } catch (error) {
    console.error('RAG answer error:', error);
    res.status(503).json({ error: 'RAG service unavailable' });
  }
});

app.post('/api/ai/requirements/decompose', async (req, res) => {
  try {
    const { requirement } = req.body || {};
    if (!requirement) {
      return res.status(422).json({ error: 'requirement is required' });
    }
    const promptTemplate = await loadPrompt('requirement_decompose_prompt.txt');
    const prompt = promptTemplate.replace('<<<REQUIREMENT>>>', requirement);
    const raw = await callLLM(prompt, { task: 'fast' });
    const parsed = parseLLMJson(raw);
    res.json(parsed);
  } catch (error) {
    console.error('Requirement decomposition error:', error);
    if (error.message && error.message.includes('busy')) {
      return res.status(500).json({ error: error.message });
    }
    res.status(503).json({ error: 'Requirement decomposition unavailable' });
  }
});

app.post('/api/ai/requirements/adversarial', async (req, res) => {
  try {
    const { requirement } = req.body || {};
    if (!requirement) {
      return res.status(422).json({ error: 'requirement is required' });
    }
    const promptTemplate = await loadPrompt('adversarial_stress_tester_prompt.txt');
    const prompt = promptTemplate.replace('<<<REQUIREMENT>>>', requirement);
    const raw = await callLLM(prompt, { task: 'fast' });
    const parsed = parseLLMJson(raw);
    res.json(parsed);
  } catch (error) {
    console.error('Adversarial tester error:', error);
    if (error.message && error.message.includes('busy')) {
      return res.status(500).json({ error: error.message });
    }
    res.status(503).json({ error: 'Adversarial tester unavailable' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
