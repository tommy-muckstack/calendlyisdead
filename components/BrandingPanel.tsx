"use client";
import { BP } from "@/lib/basepath";
import { useState } from "react";
type B = { brandColor: string | null; logoUrl: string | null; hideBranding: boolean };
export function BrandingPanel({ username, initial }: { username: string; initial: B }) {
  const [b, setB] = useState(initial), [msg, setMsg] = useState("");
  async function save(n: Partial<B>) {
    const next = { ...b, ...n }; setB(next);
    const r = await fetch(BP + "/api/me/branding", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(n) });
    setMsg(r.ok ? "Saved" : (await r.json()).error === "bad_logo" ? "Logo must be an https link or an image under 200 KB" : "Couldn't save"); setTimeout(() => setMsg(""), 1600);
  }
  function upload(f?: File) {
    if (!f) return; if (f.size > 200_000) { setMsg("Logo must be under 200 KB"); return; }
    const rd = new FileReader(); rd.onload = () => save({ logoUrl: String(rd.result) }); rd.readAsDataURL(f);
  }
  return <>
    <h2>Branding</h2>
    <p className="muted">Applies to your booking pages, confirmation pages and embeds. All free.</p>
    <div className="card" style={{ padding: 20, maxWidth: 560 }}>
      <label className="f" htmlFor="br-color">Brand color</label>
      <div className="row"><input id="br-color" type="color" value={b.brandColor ?? "#0E7C66"} onChange={e => save({ brandColor: e.target.value })} />
        {b.brandColor && <button className="btn" onClick={() => save({ brandColor: null })}>Reset</button>}</div>
      <label className="f" htmlFor="br-logo">Logo (PNG, JPG, SVG or WebP, under 200 KB)</label>
      <input id="br-logo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" onChange={e => upload(e.target.files?.[0])} />
      {b.logoUrl && <div className="row" style={{ marginTop: 10 }}><img src={b.logoUrl} alt="Your logo" style={{ maxHeight: 48 }} /><button className="btn" onClick={() => save({ logoUrl: null })}>Remove logo</button></div>}
      <label className="f" style={{ marginTop: 16 }}><input type="checkbox" checked={b.hideBranding} onChange={e => save({ hideBranding: e.target.checked })} /> Hide &quot;Powered by CalendlyIsDead&quot;</label>
      <p className="muted" style={{ fontSize: 13 }}>Calendly charges for this. Here it&#39;s a checkbox.</p>
      <a className="btn" href={`${BP}/${username}`} target="_blank">Preview booking page</a>
    </div>
    {msg && <div className="toast" role="status">{msg}</div>}
  </>;
}
