const express = require('express');
const crypto = require('crypto');
const requireAuth = require('../middleware/requireAuth');
const { syncRequirementsFromText } = require('../services/artifacts');

function toClientDocument(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    type: row.type,
    mime: row.mime,
    size: row.size,
    source: row.source,
    content: row.content,
    useAsContext: Boolean(row.use_as_context),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createProjectDocumentsRouter(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);

  router.use((req, res, next) => {
    const project = db.prepare(`
      SELECT id FROM projects WHERE id = ? AND user_id = ?
    `).get(req.params.projectId, req.session.userId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    return next();
  });

  router.get('/', (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM project_documents
      WHERE project_id = ?
      ORDER BY created_at DESC
    `).all(req.params.projectId);

    res.json(rows.map(toClientDocument));
  });

  router.post('/', (req, res) => {
    const {
      id = crypto.randomUUID(),
      name,
      type = 'Document',
      mime = 'text/plain',
      size = null,
      source = 'generated',
      content,
      useAsContext,
    } = req.body || {};

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Document name is required' });
    }
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Document content is required' });
    }

    db.prepare(`
      INSERT INTO project_documents (
        id, project_id, name, type, mime, size, source, content, use_as_context
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.params.projectId,
      name,
      type,
      mime,
      size,
      source,
      content,
      useAsContext ? 1 : 0,
    );

    if (String(type).toLowerCase().includes('srs')) {
      syncRequirementsFromText(db, req.params.projectId, content, 'srs');
    }

    const row = db.prepare(`
      SELECT * FROM project_documents WHERE id = ? AND project_id = ?
    `).get(id, req.params.projectId);

    res.status(201).json(toClientDocument(row));
  });

  router.patch('/:documentId', (req, res) => {
    const existing = db.prepare(`
      SELECT * FROM project_documents
      WHERE id = ? AND project_id = ?
    `).get(req.params.documentId, req.params.projectId);

    if (!existing) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const next = {
      name: req.body.name ?? existing.name,
      type: req.body.type ?? existing.type,
      mime: req.body.mime ?? existing.mime,
      size: req.body.size ?? existing.size,
      source: req.body.source ?? existing.source,
      content: req.body.content ?? existing.content,
      useAsContext: req.body.useAsContext ?? Boolean(existing.use_as_context),
    };

    db.prepare(`
      UPDATE project_documents
      SET name = ?, type = ?, mime = ?, size = ?, source = ?, content = ?,
          use_as_context = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?
    `).run(
      next.name,
      next.type,
      next.mime,
      next.size,
      next.source,
      next.content,
      next.useAsContext ? 1 : 0,
      req.params.documentId,
      req.params.projectId,
    );

    if (String(next.type).toLowerCase().includes('srs')) {
      syncRequirementsFromText(db, req.params.projectId, next.content, 'srs');
    }

    const row = db.prepare(`
      SELECT * FROM project_documents WHERE id = ? AND project_id = ?
    `).get(req.params.documentId, req.params.projectId);

    res.json(toClientDocument(row));
  });

  router.delete('/:documentId', (req, res) => {
    const result = db.prepare(`
      DELETE FROM project_documents
      WHERE id = ? AND project_id = ?
    `).run(req.params.documentId, req.params.projectId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ success: true });
  });

  return router;
}

module.exports = createProjectDocumentsRouter;
