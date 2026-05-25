function extractJson(rawText = '') {
  if (!rawText) return rawText;
  const fenced = rawText.match(/```json([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return rawText.slice(firstBrace, lastBrace + 1);
  }
  return rawText.trim();
}

function parseLLMJson(rawText) {
  const extracted = extractJson(rawText);
  try {
    return JSON.parse(extracted);
  } catch (err) {
    try {
      const repaired = extracted.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      return JSON.parse(repaired);
    } catch {
      throw err;
    }
  }
}

function formatContextBlock(context) {
  if (!context) return '(none provided)';
  if (typeof context === 'string') return context;
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return String(context);
  }
}

module.exports = { extractJson, parseLLMJson, formatContextBlock };
