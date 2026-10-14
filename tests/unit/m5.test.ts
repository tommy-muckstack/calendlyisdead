import { describe, it, expect } from "vitest";
import { route, validateForm, safeUrl } from "../../lib/routing";
import { render } from "../../lib/workflows";

describe("routing rules", () => {
  const rules = [
    { match: "all", conditions: [{ fieldId: "size", op: "gte", value: "50" }, { fieldId: "region", op: "equals", value: "US" }], action: { type: "event", value: "team:sales/enterprise" } },
    { match: "any", conditions: [{ fieldId: "email", op: "contains", value: "@gmail.com" }, { fieldId: "region", op: "in", value: "FR, DE" }], action: { type: "url", value: "https://example.com/self-serve" } },
  ] as any;
  const fb = { type: "message", value: "Thanks" } as any;
  it("all-conditions rule", () => expect(route(rules, fb, { size: "120", region: "us" })).toEqual({ action: rules[0].action, ruleIndex: 0 }));
  it("any-conditions rule and 'in' lists", () => {
    expect(route(rules, fb, { size: "10", region: "DE" }).ruleIndex).toBe(1);
    expect(route(rules, fb, { size: "10", region: "UK", email: "a@gmail.com" }).ruleIndex).toBe(1);
  });
  it("first match wins, fallback otherwise, numeric compare ignores blanks", () => {
    expect(route(rules, fb, { size: "500", region: "US", email: "x@gmail.com" }).ruleIndex).toBe(0);
    expect(route(rules, fb, { region: "US" })).toEqual({ action: fb, ruleIndex: null });
  });
  it("validates required, email and choice fields", () => {
    const f = [{ id: "e", label: "Email", type: "email", required: true }, { id: "r", label: "Region", type: "select", required: false, options: ["US", "DE"] }] as any;
    expect(() => validateForm(f, {})).toThrow("required:e");
    expect(() => validateForm(f, { e: "nope" })).toThrow("invalid:e");
    expect(() => validateForm(f, { e: "a@b.co", r: "XX" })).toThrow("invalid:r");
    expect(validateForm(f, { e: " a@b.co ", r: "US", extra: "1" })).toEqual({ e: "a@b.co", r: "US" });
  });
  it("only allows http(s) redirect targets", () => { expect(safeUrl("javascript:alert(1)")).toBeNull(); expect(safeUrl("https://x.com/a")).toBe("https://x.com/a"); });
});

describe("workflow templates", () => {
  const ctx = { booking: { uid: "u1", inviteeName: "Ada Lovelace", inviteeEmail: "ada@x.com", inviteeTz: "Europe/London", start: "2026-10-20T14:00:00Z", answers: { co: "Acme" }, meetingUrl: null },
    eventType: { title: "Quick chat", durationMin: 30, location: "Zoom" }, host: { name: "Demo Host", email: "h@x.com" } };
  it("fills variables in the invitee's time zone", () => {
    expect(render("Hi {{invitee.first_name}}, {{event.name}} on {{event.date}} at {{ event.time }} with {{host.name}} ({{event.location}})", ctx))
      .toBe("Hi Ada, Quick chat on Tuesday, October 20 at 3:00 PM GMT+1 with Demo Host (Zoom)");
  });
  it("answers, links, and unknown variables left as-is", () => {
    const out = render("{{answers.co}} {{cancel_url}} {{nope}}", ctx);
    expect(out).toMatch(/^Acme http.*\/booking\/u1\/cancel \{\{nope\}\}$/);
  });
});
