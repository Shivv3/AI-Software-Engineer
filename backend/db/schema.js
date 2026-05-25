function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function initializeSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone_number TEXT,
      age INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT,
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
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
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

    CREATE TABLE IF NOT EXISTS srs_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT,
      section_id TEXT,
      subsection_id TEXT,
      content TEXT,
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, section_id, subsection_id)
    );

    CREATE TABLE IF NOT EXISTS project_documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'Document',
      mime TEXT DEFAULT 'text/plain',
      size INTEGER,
      source TEXT DEFAULT 'generated',
      content TEXT NOT NULL,
      use_as_context INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artifact_counters (
      project_id TEXT NOT NULL,
      artifact_type TEXT NOT NULL,
      next_id INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (project_id, artifact_type),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      req_id TEXT NOT NULL,
      text TEXT NOT NULL,
      section TEXT,
      quality_score INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, req_id)
    );

    CREATE TABLE IF NOT EXISTS design_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      des_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, des_id)
    );

    CREATE TABLE IF NOT EXISTS traceability_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      link_type TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, source_type, source_id, target_type, target_id, link_type)
    );

    CREATE TABLE IF NOT EXISTS ml_results (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      result_type TEXT NOT NULL,
      payload JSON NOT NULL,
      score INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id);
    CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);
    CREATE INDEX IF NOT EXISTS idx_design_components_project ON design_components(project_id);
    CREATE INDEX IF NOT EXISTS idx_trace_source ON traceability_links(project_id, source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_trace_target ON traceability_links(project_id, target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_ml_results_project_type ON ml_results(project_id, result_type, created_at);
  `);

  ensureColumn(db, 'projects', 'user_id', 'TEXT');
  ensureColumn(db, 'project_documents', 'use_as_context', 'INTEGER DEFAULT 0');
}

module.exports = { initializeSchema };
