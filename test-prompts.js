const path = require('path');
require('./backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '.env') });
const axiosModule = require('./backend/node_modules/axios');
const axios = axiosModule.default || axiosModule;
const fs = require('fs');

async function testPrompt(name, promptText) {
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const r = await axios.post(url, {
      contents: [{ parts: [{ text: promptText }] }]
    }, {
      headers: { 'Content-Type': 'application/json' },
      params: { key: process.env.GEMINI_API_KEY.trim() },
      timeout: 60000
    });
    console.log(`[${name}] Status: ${r.status} OK`);
  } catch(e) {
    console.log(`[${name}] Error status: ${e.response?.status}`);
    console.log(`[${name}] Error:`, JSON.stringify(e.response?.data || {}).slice(0, 500));
  }
}

async function main() {
  const promptsDir = path.join(__dirname, 'backend', 'prompts');
  
  // Test plan prompt
  const planPrompt = fs.readFileSync(path.join(promptsDir, 'plan_prompt.txt'), 'utf8')
    .replace('<<<USER_PROJECT>>>', 'Build a task management web app for small teams.');
  await testPrompt('plan_prompt', planPrompt);

  // Test edit prompt  
  const editPrompt = fs.readFileSync(path.join(promptsDir, 'edit_prompt.txt'), 'utf8')
    .replace('<<<USER_INSTRUCTION>>>', 'Make this more formal.')
    .replace('<<<SELECTED_TEXT>>>', 'This system helps teams manage tasks.');
  await testPrompt('edit_prompt', editPrompt);

  // Test system design prompt (truncated)
  const sysPrompt = fs.readFileSync(path.join(promptsDir, 'system_design_prompt.txt'), 'utf8')
    .replace('<<<SRS_CONTENT>>>', 'The system shall allow users to login and create tasks.')
    .replace('<<<CONTEXT_JSON>>>', '{}');
  await testPrompt('system_design_prompt', sysPrompt);

  // Test code test prompt
  const codeTestPrompt = fs.readFileSync(path.join(promptsDir, 'code_test_prompt.txt'), 'utf8')
    .replace('<<<LANGUAGE>>>', 'JavaScript')
    .replace('<<<CODE>>>', 'function add(a,b){return a+b;}')
    .replace('<<<CONTEXT_BLOCK>>>', '(none provided)')
    .replace('<<<INSTRUCTIONS>>>', 'comprehensive testing')
    .replace('<<<WANT_FIX>>>', 'no');
  await testPrompt('code_test_prompt', codeTestPrompt);

  // Test requirement decompose
  const decomposePrompt = fs.readFileSync(path.join(promptsDir, 'requirement_decompose_prompt.txt'), 'utf8')
    .replace('<<<REQUIREMENT>>>', 'The system shall provide user authentication.');
  await testPrompt('requirement_decompose_prompt', decomposePrompt);

  // Test adversarial
  const adversarialPrompt = fs.readFileSync(path.join(promptsDir, 'adversarial_stress_tester_prompt.txt'), 'utf8')
    .replace('<<<REQUIREMENT>>>', 'The system must respond within 100ms.');
  await testPrompt('adversarial_stress_tester_prompt', adversarialPrompt);
}

main().catch(console.error);
