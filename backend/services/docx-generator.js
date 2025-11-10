const { 
  Document, 
  Paragraph, 
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle
} = require('docx');

function createProjectDocument(project) {
  const sections = [];

  // Title page
  sections.push({
    properties: {},
    children: [
      new Paragraph({
        text: "Software Requirements Specification",
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 }
      }),
      new Paragraph({
        text: project.title,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 100 }
      }),
      new Paragraph({
        text: new Date().toLocaleDateString(),
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 400 }
      }),
    ]
  });

  // SDLC Recommendation section
  if (project.sdlc_analysis) {
    const sdlc = JSON.parse(project.sdlc_analysis);
    sections.push({
      properties: {},
      children: [
        new Paragraph({
          text: "SDLC Recommendation",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Recommended Model: ", bold: true }),
            new TextRun(sdlc.model)
          ],
          spacing: { before: 100, after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Rationale: ", bold: true }),
            new TextRun(sdlc.why)
          ],
          spacing: { before: 100, after: 100 }
        }),
        sdlc.when_not_to_use && new Paragraph({
          children: [
            new TextRun({ text: "When Not to Use: ", bold: true }),
            new TextRun(sdlc.when_not_to_use)
          ],
          spacing: { before: 100, after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Confidence Score: ", bold: true }),
            new TextRun(`${(sdlc.confidence * 100).toFixed(1)}%`)
          ],
          spacing: { before: 100, after: 200 }
        })
      ].filter(Boolean)
    });
  }

  // Project Plan section
  if (project.project_plan) {
    const plan = JSON.parse(project.project_plan);
    
    // Milestones table
    const tableRows = [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph("Milestone")] }),
          new TableCell({ children: [new Paragraph("Duration")] }),
          new TableCell({ children: [new Paragraph("Deliverables")] }),
          new TableCell({ children: [new Paragraph("Required Roles")] })
        ],
        tableHeader: true
      }),
      ...plan.milestones.map(milestone => 
        new TableRow({
          children: [
            new TableCell({ 
              children: [new Paragraph(milestone.title)]
            }),
            new TableCell({ 
              children: [new Paragraph(`${milestone.duration_weeks} weeks`)]
            }),
            new TableCell({ 
              children: [new Paragraph(milestone.deliverables.join("\n"))]
            }),
            new TableCell({ 
              children: [new Paragraph(milestone.roles_required?.join("\n") || "")]
            })
          ]
        })
      )
    ];

    sections.push({
      properties: {},
      children: [
        new Paragraph({
          text: "Project Plan",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 100 }
        }),
        new Paragraph({
          text: "Milestones",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 100, after: 100 }
        }),
        new Table({
          rows: tableRows,
          width: {
            size: 100,
            type: "pct"
          }
        }),
        new Paragraph({
          text: "Implicit Requirements",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 }
        }),
        ...plan.implicit_requirements.map(req => [
          new Paragraph({
            children: [
              new TextRun({ text: req.title, bold: true }),
              new TextRun({ text: ` (${req.type}, Priority: ${req.priority})` })
            ],
            spacing: { before: 100, after: 50 }
          }),
          new Paragraph({
            text: req.description,
            spacing: { before: 50, after: 50 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Rationale: ", bold: true }),
              new TextRun(req.rationale)
            ],
            spacing: { before: 50, after: 100 }
          })
        ]).flat()
      ]
    });
  }

  // SRS Content section
  if (project.srs_content) {
    sections.push({
      properties: {},
      children: [
        new Paragraph({
          text: "Software Requirements Specification",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 100 }
        }),
        ...project.srs_content.split('\n\n').map(paragraph => 
          new Paragraph({
            text: paragraph.trim(),
            spacing: { before: 50, after: 50 }
          })
        )
      ]
    });
  }

  return new Document({
    sections,
    styles: {
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            size: 36,
            bold: true
          },
          paragraph: {
            spacing: { before: 240, after: 240 }
          }
        }
      ]
    }
  });
}

module.exports = { createProjectDocument };