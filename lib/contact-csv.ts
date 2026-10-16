// Shared, dependency-free CSV handling. Limits bound both parsing and imports.
export const CSV_BYTES = 2 * 1024 * 1024;
export const CSV_ROWS = 1000;
export function parseContactCSV(input: string): string[][] {
  if (new TextEncoder().encode(input).length > CSV_BYTES) throw new Error("Choose a CSV file smaller than 2 MB.");
  const text = input.replace(/^\uFEFF/, "");
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) throw new Error("The CSV contains unsupported control characters.");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  function pushCell() { if (cell.length > 12000) throw new Error("A CSV value is too long."); row.push(cell); cell = ""; closed = false; if (row.length > 50) throw new Error("Use no more than 50 columns."); }
  function pushRow() { pushCell(); if (row.some(value => value.trim())) rows.push(row); row = []; if (rows.length > CSV_ROWS + 1) throw new Error("Import up to 1,000 contacts at a time."); }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; continue; }
    if (c === ",") pushCell();
    else if (c === "\r" || c === "\n") { pushRow(); if (c === "\r" && text[i + 1] === "\n") i++; }
    else if (c === '"' && !cell && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error("Check the quotation marks in your CSV file."); cell += c; }
  }
  if (quoted) throw new Error("A quoted CSV value is missing its closing quote.");
  if (cell || row.length || closed) pushRow();
  if (rows.length < 2) throw new Error("Include column headings and at least one contact.");
  if (rows[0].some(value => !value.trim())) throw new Error("Give every CSV column a heading.");
  if (rows.some(row => row.length !== rows[0].length)) throw new Error("Every CSV row must have the same number of columns as the heading row.");
  return rows;
}
export function csvCell(value: string): string {
  // Quotes alone do not prevent spreadsheet formula execution.
  const safe = /^[\s\uFEFF]*[=+@\-\t\r\n]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export const csvLine = (row: string[]) => row.map(csvCell).join(",") + "\r\n";
