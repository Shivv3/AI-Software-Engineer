const crypto = require('crypto');

const TYPE_PREFIX = new Map([
  ['requirement', 'REQ'],
  ['design', 'DES'],
  ['card', 'CARD'],
  ['file', 'FILE'],
  ['test', 'TEST'],
  ['REQ', 'REQ'],
  ['DES', 'DES'],
  ['CARD', 'CARD'],
  ['FILE', 'FILE'],
  ['TEST', 'TEST'],
]);

function normalizeType(type) {
  return TYPE_PREFIX.get(type) || String(type || '').toUpperCase();
}

function issueId(db, projectId, type) {
  const artifactType = normalizeType(type);
  const tx = db.transaction(() => {
    const current = db.prepare(`
      SELECT next_id FROM artifact_counters
      WHERE project_id = ? AND artifact_type = ?
    `).get(projectId, artifactType);

    if (!current) {
      db.prepare(`
        INSERT INTO artifact_counters (project_id, artifact_type, next_id)
        VALUES (?, ?, 2)
      `).run(projectId, artifactType);
      return `${artifactType}-1`;
    }

    db.prepare(`
      UPDATE artifact_counters
      SET next_id = next_id + 1
      WHERE project_id = ? AND artifact_type = ?
    `).run(projectId, artifactType);
    return `${artifactType}-${current.next_id}`;
  });

  return tx();
}

function linkArtifacts(db, projectId, source, target, linkType, confidence = 1.0) {
  db.prepare(`
    INSERT OR IGNORE INTO traceability_links (
      project_id, source_type, source_id, target_type, target_id, link_type, confidence
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    source.type,
    source.id,
    target.type,
    target.id,
    linkType,
    confidence,
  );
}

function getLinks(db, projectId, filters = {}) {
  const clauses = ['project_id = ?'];
  const params = [projectId];

  for (const [column, value] of Object.entries({
    source_type: filters.sourceType,
    source_id: filters.sourceId,
    target_type: filters.targetType,
    target_id: filters.targetId,
    link_type: filters.linkType,
  })) {
    if (value) {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }

  return db.prepare(`
    SELECT * FROM traceability_links
    WHERE ${clauses.join(' AND ')}
    ORDER BY created_at DESC
  `).all(...params);
}

function extractRequirementSentences(text = '') {
  return String(text)
    .replace(/\r/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/^[-*#\d.\s]+/, '').trim())
    .filter((sentence) => /\b(shall|must|should|will|require|requires|required)\b/i.test(sentence))
    .filter((sentence, index, all) => all.indexOf(sentence) === index)
    .slice(0, 200);
}

function syncRequirementsFromText(db, projectId, text, section = 'srs') {
  const sentences = extractRequirementSentences(text);
  const existing = db.prepare(`
    SELECT req_id, text FROM requirements WHERE project_id = ?
  `).all(projectId);
  const byText = new Map(existing.map((row) => [row.text.trim().toLowerCase(), row.req_id]));
  const inserted = [];

  const tx = db.transaction(() => {
    for (const sentence of sentences) {
      const key = sentence.trim().toLowerCase();
      if (byText.has(key)) continue;

      const reqId = issueId(db, projectId, 'REQ');
      db.prepare(`
        INSERT INTO requirements (project_id, req_id, text, section)
        VALUES (?, ?, ?, ?)
      `).run(projectId, reqId, sentence, section);
      inserted.push({ req_id: reqId, text: sentence, section });
    }
  });

  tx();
  return { total: sentences.length, inserted };
}

function saveMlResult(db, projectId, resultType, payload, score = null) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO ml_results (id, project_id, result_type, payload, score)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, projectId, resultType, JSON.stringify(payload), score);
  return id;
}

module.exports = {
  issueId,
  linkArtifacts,
  getLinks,
  syncRequirementsFromText,
  extractRequirementSentences,
  saveMlResult,
};
