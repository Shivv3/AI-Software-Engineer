const path = require('path');
require('./backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '.env') });
const axiosModule = require('./backend/node_modules/axios');
const axios = axiosModule.default || axiosModule;

async function testGroq() {
  try {
    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Return JSON: {"message":"hello"}' }],
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY.trim()}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    console.log('Groq Status:', r.status);
    console.log('Groq Response:', JSON.stringify(r.data?.choices?.[0]?.message?.content).slice(0, 200));
  } catch(e) {
    console.log('Groq Error status:', e.response?.status);
    console.log('Groq Error:', JSON.stringify(e.response?.data || {}).slice(0, 500));
    console.log('Groq Error message:', e.message);
  }
}

testGroq();
