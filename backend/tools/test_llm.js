const axios = require('axios');
require('dotenv').config({ path: '../../.env' });

const TEST_CASES = [
  {
    name: 'Simple Web App',
    project_text: `Building a basic e-commerce website with product catalog, shopping cart, and checkout. 
    Team size: 3 developers. Timeline: 2 months. Tech stack: MERN.`,
    constraints: {
      team_size: 3,
      timeline: "2 months",
      budget: "low"
    }
  },
  {
    name: 'Healthcare System',
    project_text: `Developing a medical records management system with strict security requirements.
    Need to follow HIPAA compliance. Team size: 8 developers. Timeline: 1 year.`,
    constraints: {
      team_size: 8,
      timeline: "12 months",
      budget: "high"
    }
  },
  {
    name: 'Mobile Game',
    project_text: `Creating a casual mobile game with frequent updates and features.
    Team size: 4 developers. Timeline: 6 months. Needs rapid iteration.`,
    constraints: {
      team_size: 4,
      timeline: "6 months",
      budget: "medium"
    }
  }
];

async function testSDLCRecommendation() {
  const BASE_URL = 'http://localhost:4000';
  
  console.log('Starting SDLC recommendation tests...\n');

  for (const testCase of TEST_CASES) {
    console.log(`Testing: ${testCase.name}`);
    console.log('Project:', testCase.project_text);
    
    try {
      const response = await axios.post(
        `${BASE_URL}/api/sdlc/recommend`,
        {
          project_text: testCase.project_text,
          constraints: testCase.constraints
        }
      );

      console.log('\nResponse:');
      console.log(JSON.stringify(response.data, null, 2));
      
      // Validate response structure
      const { model, why, confidence } = response.data;
      if (!model || !why || typeof confidence !== 'number') {
        console.error('❌ Invalid response structure');
      } else {
        console.log('✓ Valid response structure');
        console.log(`✓ Confidence: ${(confidence * 100).toFixed(1)}%`);
      }

    } catch (error) {
      console.error('❌ Error:', error.response?.data?.error || error.message);
    }
    
    console.log('\n-------------------\n');
  }
}

// Test rate limiting
async function testRateLimiting() {
  console.log('Testing rate limiting...');
  const requests = [];
  
  // Make 35 requests (more than our limit of 30 per minute)
  for (let i = 0; i < 35; i++) {
    requests.push(
      axios.post('http://localhost:4000/api/sdlc/recommend', {
        project_text: 'Small project for rate limit testing',
        constraints: { team_size: 2, timeline: "1 month" }
      }).catch(error => error.response)
    );
  }

  const results = await Promise.all(requests);
  const successful = results.filter(r => r.status === 200).length;
  const ratelimited = results.filter(r => r.status === 429).length;

  console.log(`\nRate limit test results:`);
  console.log(`✓ Successful requests: ${successful}`);
  console.log(`✓ Rate limited requests: ${ratelimited}`);
}

// Run tests
async function runTests() {
  try {
    await testSDLCRecommendation();
    await testRateLimiting();
  } catch (error) {
    console.error('Test suite error:', error);
  }
}

runTests();