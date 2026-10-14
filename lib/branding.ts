/** Turn one brand color into the three CSS variables the UI uses. */
const hex = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c: number[]) => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const isHexColor = (s: unknown): s is string => typeof s === "string" && !!hex(s);
export function brandVars(color?: string | null): Record<string, string> {
  const c = color ? hex(color) : null; if (!c) return {};
  return { "--brand": toHex(c), "--brand-ink": toHex(c.map(v => v * 0.75)), "--brand-soft": toHex(c.map(v => v + (255 - v) * 0.88)) };
}
/** A logo must be an https URL or a small inline image (data URL under ~200 KB). */
export function validLogo(s: string) {
  if (!s) return true;
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(s)) return s.length < 270_000;
  try { const u = new URL(s); return u.protocol === "https:"; } catch { return false; }
}
