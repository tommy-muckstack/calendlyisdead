import { describe, expect, it } from "vitest";
import { CSV_BYTES, csvCell, csvLine, parseContactCSV } from "../../lib/contact-csv";
import { ExportRequest, ImportRequest, ImportResult } from "../../lib/contact-transfer-validation";
describe("contact CSV format", () => {
  it("reads BOM, escaped quotes, commas, multiline values and mixed line endings", () => {
    expect(parseContactCSV('\uFEFFName,Email,Notes\r\n"A, B",a@example.invalid,"say ""hi""\nnext"\rC,c@example.invalid,\n')).toEqual([["Name", "Email", "Notes"], ["A, B", "a@example.invalid", 'say "hi"\nnext'], ["C", "c@example.invalid", ""]]);
  });
  it.each(['Name,Email\n"unterminated,a', 'Name,Email\n"A"oops,b', 'Name,Email\nA"B,b', 'Name,Email\nA,b,c', 'Name,\nA,b', 'Name,Email', 'Name,Email\nA,\x00', 'Name,Email\nA,' + 'a'.repeat(12001)])("rejects malformed or oversized values: %s", value => expect(() => parseContactCSV(value)).toThrow());
  it("bounds bytes, rows and columns, including ignored blank rows", () => {
    expect(() => parseContactCSV("é".repeat(CSV_BYTES))).toThrow("2 MB");
    expect(() => parseContactCSV("Name,Email\n" + "A,a@example.invalid\n".repeat(1001))).toThrow("1,000");
    expect(() => parseContactCSV("x,".repeat(50) + "x\na,b")).toThrow("50 columns");
    expect(parseContactCSV("Name,Email\n\nA,a@example.invalid\n\n")).toHaveLength(2);
  });
  it.each(["=1+1", "+cmd", "-2", "@SUM(A1)", "  =1", "\tword", " \ntext"])("neutralizes spreadsheet formulas %j", value => expect(csvCell(value)).toBe(`"'${value}"`));
  it("quotes and escapes ordinary CSV cells", () => expect(csvLine(['A, B', 'say "hi"', 'é'])).toBe('"A, B","say ""hi""","é"\r\n'));
  it("requires unique mapping and Name/Email", () => {
    const input = { id: crypto.randomUUID(), csv: "a,b\nc,d", mapping: ["name", "email"], policy: "merge" };
    expect(ImportRequest.safeParse(input).success).toBe(true);
    expect(ImportRequest.safeParse({ ...input, mapping: ["name", "name", "email"] }).success).toBe(false);
    expect(ImportRequest.safeParse({ ...input, mapping: ["name", ""] }).success).toBe(false);
    expect(ImportRequest.safeParse({ ...input, userId: "other" }).success).toBe(false);
  });
  it("requires an unambiguous export selection", () => {
    const id = crypto.randomUUID(); expect(ExportRequest.safeParse({ id, all: true }).success).toBe(true);
    for (const input of [{ id }, { id, ids: [] }, { id, ids: [id], all: true }, { id, all: false }]) expect(ExportRequest.safeParse(input).success).toBe(false);
    const result = { id, preview: "a".repeat(64), committed: true, rows: [{ row: 2, status: "created", contactId: id, issues: [] }] };
    expect(ImportResult.safeParse(result).success).toBe(true);
    expect(ImportResult.safeParse({ ...result, rows: [{ ...result.rows[0], contactId: null }] }).success).toBe(false);
    expect(ImportResult.safeParse({ ...result, preview: "bad" }).success).toBe(false);
    expect(ImportResult.safeParse({ ...result, rows: [{ ...result.rows[0], row: 9 }] }).success).toBe(false);
  });
});
