const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getLinks, syncRequirementsFromText } = require('../services/artifacts');

function createProjectInsightsRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  function getProject(req, res, next) {
    const project = db.prepare(`
      SELECT * FROM projects WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.session.userId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    req.project = project;
    return next();
  }

  router.post('/api/projects/:id/requirements/sync', getProject, (req, res) => {
    const text = req.body?.text || req.project.srs_content || '';
    const result = syncRequirementsFromText(db, req.params.id, text, req.body?.section || 'srs');
    res.json(result);
  });

  router.get('/api/projects/:id/health', getProject, (req, res) => {
    const projectId = req.params.id;
    const requirements = db.prepare(`
      SELECT COUNT(*) as total, AVG(quality_score) as avg_score
      FROM requirements WHERE project_id = ?
    `).get(projectId);
    const documents = db.prepare(`
      SELECT COUNT(*) as total FROM project_documents WHERE project_id = ?
    `).get(projectId);
    const links = db.prepare(`
      SELECT COUNT(*) as total FROM traceability_links WHERE project_id = ?
    `).get(projectId);
    const latestMl = db.prepare(`
      SELECT result_type, score, created_at
      FROM ml_results
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(projectId);

    res.json({
      projectId,
      phases: {
        requirements: {
          score: requirements.avg_score ? Math.round(requirements.avg_score) : null,
          artifacts: requirements.total || 0,
        },
        design: { score: null, artifacts: 0 },
        implementation: { score: null, artifacts: 0 },
        quality: { score: null, artifacts: 0 },
      },
      documents: documents.total || 0,
      traceabilityLinks: links.total || 0,
      latestMl,
    });
  });

  router.get('/api/projects/:id/traceability', getProject, (req, res) => {
    const projectId = req.params.id;
    const requirements = db.prepare(`
      SELECT req_id, text, section, quality_score
      FROM requirements
      WHERE project_id = ?
      ORDER BY id ASC
    `).all(projectId);
    const links = getLinks(db, projectId);

    const rows = requirements.map((reqRow) => {
      const outgoing = links.filter(
        (link) => link.source_type === 'requirement' && link.source_id === reqRow.req_id,
      );
      const incoming = links.filter(
        (link) => link.target_type === 'requirement' && link.target_id === reqRow.req_id,
      );
      const reqLinks = [...outgoing, ...incoming];
      const linkedCards = reqLinks
        .filter((link) => link.source_type === 'card' || link.target_type === 'card')
        .map((link) => (link.source_type === 'card' ? link.source_id : link.target_id));

      return {
        ...reqRow,
        linked_cards: [...new Set(linkedCards)],
        status: linkedCards.length ? 'implemented' : 'unimplemented',
      };
    });

    const implemented = rows.filter((row) => row.status === 'implemented').length;
    res.json({
      requirements: rows,
      links,
      coverage_summary: {
        total_requirements: rows.length,
        implemented,
        coverage_pct: rows.length ? Math.round((implemented / rows.length) * 1000) / 10 : 0,
      },
    });
  });

  return router;
}

module.exports = createProjectInsightsRouter;
