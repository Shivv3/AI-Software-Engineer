const fs = require('fs').promises;
const path = require('path');

async function loadPrompt(filename) {
  return fs.readFile(path.join(__dirname, '..', 'prompts', filename), 'utf-8');
}

module.exports = { loadPrompt };
