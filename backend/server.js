const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
require('dotenv').config({ path: envPath });
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const Ajv = require('ajv');
const { Document, Packer, Paragraph } = require('docx');
const Database = require('better-sqlite3');
const llm = require('./services/llm');

const app = express();
const port = process.env.PORT || 4000;
const ajv = new Ajv();

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Database setup
const dbPath = path.resolve(__dirname, process.env.DB_PATH || './data/db.sqlite');
console.log('Using database at:', dbPath);

// Create data directory if it doesn't exist
const dataDir = path.dirname(dbPath);
if (!require('fs').existsSync(dataDir)) {
  require('fs').mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT,
    project_text TEXT,
    sdlc_analysis JSON,
    project_plan JSON,
    srs_content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS srs_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    version INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    editor TEXT CHECK(editor IN ('user', 'assistant')),
    srs_content TEXT,
    prompt_text TEXT,
    suggestion_text TEXT,
    selection_start INTEGER,
    selection_end INTEGER,
    FOREIGN KEY(project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    endpoint TEXT,
    prompt TEXT,
    raw_response TEXT,
    parsed_response JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Load schemas
const sdlcSchema = require('./schemas/sdlc_recommendation.schema.json');
const planSchema = require('./schemas/plan_requirements.schema.json');

// Load prompts
async function loadPrompt(filename) {
  return await fs.readFile(path.join(__dirname, 'prompts', filename), 'utf-8');
}

// LLM wrapper
async function callLLM(promptText) {
  try {
    return await llm.generate(promptText);
  } catch (error) {
    if (error.message.includes('Rate limit exceeded')) {
      throw new Error('Server is busy, please try again in a few moments');
    }
    throw error;
  }
}

// Validation helper
async function validateLLMResponse(responseText, schema, retryPrompt) {
  try {
    const parsed = JSON.parse(responseText);
    if (ajv.validate(schema, parsed)) {
      return parsed;
    }

    // Retry once with explicit schema instruction
    const retryResponse = await callLLM(retryPrompt);
    const parsed2 = JSON.parse(retryResponse);
    
    if (ajv.validate(schema, parsed2)) {
      return parsed2;
    }
    
    throw new Error('Failed to get valid JSON after retry');
  } catch (error) {
    console.error('Validation Error:', error.message);
    throw error;
  }
}

// Logging helper
async function logInteraction(projectId, endpoint, prompt, rawResponse, parsedResponse) {
  db.prepare(`
    INSERT INTO logs (project_id, endpoint, prompt, raw_response, parsed_response)
    VALUES (?, ?, ?, ?, ?)
  `).run(projectId, endpoint, prompt, rawResponse, JSON.stringify(parsedResponse));
}

// Endpoints
app.use(bodyParser.json());

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
    const rawResponse = await callLLM(prompt);
    console.log('Raw LLM response:', rawResponse);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawResponse);
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
    const { project_text } = req.body;
    const promptTemplate = await loadPrompt('plan_prompt.txt');
    const prompt = promptTemplate.replace('<<<USER_PROJECT>>>', project_text);

    const rawResponse = await callLLM(prompt);
    const validated = await validateLLMResponse(
      rawResponse,
      planSchema,
      `Previous output invalid. Please return ONLY JSON matching schema: ${JSON.stringify(planSchema)}. Project: ${project_text}`
    );

    await logInteraction(req.params.id, '/api/plan/generate', prompt, rawResponse, validated);
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

    const promptTemplate = await loadPrompt('system_design_prompt.txt');
    const contextJson = JSON.stringify(context || {}, null, 2);

    const prompt = promptTemplate
      .replace('<<<SRS_CONTENT>>>', srs_text)
      .replace('<<<CONTEXT_JSON>>>', contextJson);

    const rawResponse = await callLLM(prompt);

    await logInteraction(
      req.params.id || 'design_anonymous',
      '/api/design/system',
      prompt,
      rawResponse,
      { design_markdown: rawResponse }
    );

    res.json({ design_markdown: rawResponse });
  } catch (error) {
    console.error('System design generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate system design' });
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

    const rawResponse = await callLLM(prompt);
    const parsed = JSON.parse(rawResponse);
    
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
app.post('/api/project', (req, res) => {
  try {
    const { title, project_text } = req.body;
    const id = 'p' + Date.now();

    db.prepare(`
      INSERT INTO projects (id, title, project_text, srs_content)
      VALUES (?, ?, ?, '')
    `).run(id, title, project_text);

    res.json({ id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get project details with latest SRS content
app.get('/api/project/:id', (req, res) => {
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

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get project version history
app.get('/api/project/:id/versions', (req, res) => {
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
app.get('/api/project/:id/version/:version', (req, res) => {
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

    const rawResponse = await callLLM(prompt);
    const parsed = JSON.parse(rawResponse);

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

    const rawResponse = await callLLM(prompt);
    const parsed = JSON.parse(rawResponse);

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

    // Create SRS sections table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS srs_sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT,
        section_id TEXT,
        subsection_id TEXT,
        content TEXT,
        status TEXT DEFAULT 'draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        UNIQUE(project_id, section_id, subsection_id)
      );
    `);

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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});