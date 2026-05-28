const path = require('path');
require('./backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '.env') });
const axiosModule = require('./backend/node_modules/axios');
const axios = axiosModule.default || axiosModule;

async function test() {
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const r = await axios.post(url, {
      contents: [{ parts: [{ text: 'Return JSON: {"message":"hello"}' }] }]
    }, {
      headers: { 'Content-Type': 'application/json' },
      params: { key: process.env.GEMINI_API_KEY.trim() },
      timeout: 30000
    });
    console.log('Status:', r.status);
    console.log('Response:', JSON.stringify(r.data).slice(0, 300));
  } catch(e) {
    console.log('Error status:', e.response?.status);
    console.log('Error data:', JSON.stringify(e.response?.data || {}).slice(0, 1000));
    console.log('Error message:', e.message);
    console.log('Error code:', e.code);
  }
}
test();
