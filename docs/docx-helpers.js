const { Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel,
        BorderStyle, WidthType, ShadingType, AlignmentType } = require('docx');

const CONTENT_WIDTH = 9360; // US Letter, 1" margins

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };
const HEADER_FILL = "D5E8F0";

// Heading 1
function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
// Heading 2
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
// Heading 3
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}
// Body paragraph (supports bold via runs array or plain string)
function p(text, opts = {}) {
  const runs = Array.isArray(text) ? text : [new TextRun(text)];
  return new Paragraph({ children: runs, spacing: { after: 120 }, ...opts });
}
// Italic note
function note(text) {
  return new Paragraph({ children: [new TextRun({ text, italics: true })], spacing: { after: 120 } });
}
// Bold label paragraph
function bold(text) {
  return new Paragraph({ children: [new TextRun({ text, bold: true })], spacing: { before: 120, after: 60 } });
}
// Bullet list item
function bullet(text, level = 0) {
  const runs = Array.isArray(text) ? text : [new TextRun(text)];
  return new Paragraph({ numbering: { reference: "bullets", level }, children: runs, spacing: { after: 40 } });
}
// Numbered list item
function num(text, ref = "numbers") {
  const runs = Array.isArray(text) ? text : [new TextRun(text)];
  return new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs, spacing: { after: 40 } });
}
function spacer() { return new Paragraph({ children: [new TextRun("")], spacing: { after: 60 } }); }

// Table from header row + data rows; colW = array of column widths summing to CONTENT_WIDTH
function table(header, rows, colW) {
  const totalW = colW.reduce((a, b) => a + b, 0);
  const mkCell = (txt, isHeader, w) => new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    margins: cellMargins,
    shading: isHeader ? { fill: HEADER_FILL, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: String(txt), bold: !!isHeader })] })],
  });
  const headerRow = new TableRow({
    tableHeader: true,
    children: header.map((t, i) => mkCell(t, true, colW[i])),
  });
  const dataRows = rows.map(r => new TableRow({
    children: r.map((t, i) => mkCell(t, false, colW[i])),
  }));
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colW,
    rows: [headerRow, ...dataRows],
  });
}

module.exports = { h1, h2, h3, p, note, bold, bullet, num, spacer, table,
  CONTENT_WIDTH, TextRun };
