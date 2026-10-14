import type { Condition, FormField, Rule, RouteAction } from "./db/schema";
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
export function test(c: Condition, answers: Record<string, string>) {
  const a = norm(answers[c.fieldId]), v = norm(c.value);
  switch (c.op) {
    case "equals": return a === v;
    case "not_equals": return a !== v;
    case "contains": return v !== "" && a.includes(v);
    case "in": return v.split(",").map(x => x.trim()).filter(Boolean).includes(a);
    case "gte": return a !== "" && Number(a) >= Number(v);
    case "lte": return a !== "" && Number(a) <= Number(v);
  }
}
/** First matching rule wins; a rule with no conditions always matches. */
export function route(rules: Rule[], fallback: RouteAction, answers: Record<string, string>): { action: RouteAction; ruleIndex: number | null } {
  for (const [i, r] of rules.entries()) {
    const hits = r.conditions.map(c => test(c, answers));
    if (!r.conditions.length || (r.match === "any" ? hits.some(Boolean) : hits.every(Boolean))) return { action: r.action, ruleIndex: i };
  }
  return { action: fallback, ruleIndex: null };
}
export function validateForm(fields: FormField[], answers: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = String(answers[f.id] ?? "").trim().slice(0, 2000);
    if (f.required && !v) throw new Error(`required:${f.id}`);
    if (v && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error(`invalid:${f.id}`);
    if (v && f.type === "select" && !(f.options ?? []).includes(v)) throw new Error(`invalid:${f.id}`);
    if (v) out[f.id] = v;
  }
  return out;
}
/** Only http(s) URLs may be routing targets. */
export const safeUrl = (u: string) => { try { const x = new URL(u); return ["http:", "https:"].includes(x.protocol) ? x.toString() : null; } catch { return null; } };
