import { describe, it, expect } from "vitest";
import { validateAnswers } from "../../lib/booking";
const qs = [{ id: "co", label: "Company", type: "text", required: true }, { id: "sz", label: "Team size", type: "select", required: false, options: ["1-10", "11-50"] },
  { id: "ph", label: "Phone", type: "phone", required: false }] as any;
describe("invitee questions", () => {
  it("requires required answers", () => expect(() => validateAnswers(qs, {})).toThrow("answer_required:co"));
  it("rejects choices that aren't offered and bad phones", () => {
    expect(() => validateAnswers(qs, { co: "X", sz: "500" })).toThrow("answer_invalid:sz");
    expect(() => validateAnswers(qs, { co: "X", ph: "call me" })).toThrow("answer_invalid:ph");
  });
  it("keeps only known, non-empty answers", () => expect(validateAnswers(qs, { co: " Acme ", sz: "1-10", junk: "x" })).toEqual({ co: "Acme", sz: "1-10" }));
});
