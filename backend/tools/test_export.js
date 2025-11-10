const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: '../../.env' });

const TEST_PROJECTS = [
  {
    title: "E-commerce Platform",
    project_text: "Building a modern e-commerce platform with user authentication, product catalog, shopping cart, and payment processing.",
    sdlc_analysis: {
      model: "Agile (Scrum)",
      why: "The project requires frequent iterations and continuous feedback from stakeholders. Features can be delivered incrementally.",
      when_not_to_use: "When the requirements are fixed and won't change frequently.",
      confidence: 0.85
    },
    project_plan: {
      milestones: [
        {
          title: "User Authentication & Profile",
          duration_weeks: 3,
          deliverables: ["Login/Register system", "User profile management", "Password reset flow"],
          roles_required: ["Frontend Developer", "Backend Developer", "Security Engineer"]
        },
        {
          title: "Product Catalog",
          duration_weeks: 4,
          deliverables: ["Product listing", "Search functionality", "Filtering system"],
          roles_required: ["Frontend Developer", "Backend Developer", "UI Designer"]
        }
      ],
      implicit_requirements: [
        {
          title: "Performance Requirements",
          type: "NFR",
          priority: "high",
          description: "System should handle 1000 concurrent users with response time under 2 seconds",
          rationale: "Expected high traffic during peak shopping seasons"
        },
        {
          title: "Data Backup",
          type: "NFR",
          priority: "medium",
          description: "Automated daily backups with 30-day retention",
          rationale: "Ensure business continuity and data recovery capabilities"
        }
      ]
    },
    srs_content: `1. Introduction
This document outlines the requirements for the e-commerce platform project.

2. System Overview
The system will provide a full-featured online shopping experience with user management, product browsing, and secure checkout.

3. Functional Requirements
3.1 User Authentication
- Users must be able to register with email and password
- Password recovery via email
- Social login integration (Google, Facebook)

3.2 Product Management
- Product catalog with categories
- Advanced search with filters
- Inventory tracking
- Price management

4. Non-Functional Requirements
4.1 Performance
- Support 1000 concurrent users
- Page load time under 2 seconds
- 99.9% uptime

4.2 Security
- PCI DSS compliance
- Data encryption at rest
- HTTPS implementation`
  }
];

async function testExport() {
  try {
    console.log('Starting export tests...\n');
    const BASE_URL = 'http://localhost:4000';

    for (const testProject of TEST_PROJECTS) {
      // 1. Create project
      console.log(`Creating project: ${testProject.title}`);
      const projectRes = await axios.post(`${BASE_URL}/api/project`, {
        title: testProject.title,
        project_text: testProject.project_text
      });
      const projectId = projectRes.data.id;

      // 2. Update project data
      console.log('Updating project data...');
      await db.prepare(`
        UPDATE projects 
        SET sdlc_analysis = ?,
            project_plan = ?,
            srs_content = ?
        WHERE id = ?
      `).run(
        JSON.stringify(testProject.sdlc_analysis),
        JSON.stringify(testProject.project_plan),
        testProject.srs_content,
        projectId
      );

      // 3. Export document
      console.log('Exporting document...');
      const response = await axios.post(
        `${BASE_URL}/api/project/${projectId}/export`,
        {},
        { responseType: 'arraybuffer' }
      );

      // 4. Save file
      const outputPath = path.join(__dirname, 'test_exports');
      await fs.mkdir(outputPath, { recursive: true });
      const filePath = path.join(outputPath, `test_export_${projectId}.docx`);
      await fs.writeFile(filePath, response.data);

      console.log(`✓ Export successful: ${filePath}`);
      console.log('-------------------\n');
    }

    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

testExport();