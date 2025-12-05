const { Document, Packer, Paragraph } = require('docx');

function createDesignDocument(designMarkdown) {
  const paragraphs = [];

  const lines = (designMarkdown || '').split('\n');

  for (const line of lines) {
    // Very simple mapping: keep markdown as plain text paragraphs
    paragraphs.push(new Paragraph(line));
  }

  return new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });
}

module.exports = { createDesignDocument };


