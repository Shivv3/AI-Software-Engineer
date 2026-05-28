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

function escapeControlCharsInStrings(text) {
  if (!text) return text;
  let result = '';
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        result += ch;
        continue;
      }

      if (ch === '\\') {
        isEscaped = true;
        result += ch;
        continue;
      }

      if (ch === '"') {
        inString = false;
        result += ch;
        continue;
      }

      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        switch (ch) {
          case '\n':
            result += '\\n';
            break;
          case '\r':
            result += '\\r';
            break;
          case '\t':
            result += '\\t';
            break;
          case '\b':
            result += '\\b';
            break;
          case '\f':
            result += '\\f';
            break;
          default:
            result += `\\u${code.toString(16).padStart(4, '0')}`;
        }
        continue;
      }

      result += ch;
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    result += ch;
  }

  return result;
}

function parseLLMJson(rawText) {
  const extracted = extractJson(rawText);
  try {
    return JSON.parse(extracted);
  } catch (err) {
    try {
      const escapedControl = escapeControlCharsInStrings(extracted);
      const repaired = escapedControl.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
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

module.exports = { extractJson, escapeControlCharsInStrings, parseLLMJson, formatContextBlock };
