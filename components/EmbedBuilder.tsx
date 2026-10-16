"use client";
import { BP } from "@/lib/basepath";
import { useState } from "react";
export function EmbedBuilder({ base, username, types }: { base: string; username: string; types: { slug: string; title: string }[] }) {
  const [kind, setKind] = useState<"inline" | "widget" | "text">("inline");
  const [slug, setSlug] = useState(types[0]?.slug ?? ""), [color, setColor] = useState("#0E7C66"), [text, setText] = useState("Schedule time with me");
  const url = `${base}/${username}${slug ? `/${slug}` : ""}`;
  const script = `<script src="${base}/embed.js" async></script>`;
  const code = kind === "inline" ? `<div class="cid-inline" data-url="${url}" data-color="${color}" style="min-width:320px;height:700px"></div>\n${script}`
    : kind === "widget" ? `${script}\n<script>\n  window.addEventListener("load", () => CalendlyIsDead.initPopupWidget({ url: "${url}", text: ${JSON.stringify(text)}, color: "${color}" }));\n</script>`
    : `<a href="#" data-cid-popup="${url}" data-color="${color}">${text.replace(/</g, "&lt;")}</a>\n${script}`;
  return <>
    <h2>Add to your website</h2>
    <p className="muted">Paste one snippet into any site. No account or tracking script needed on the visitor&#39;s side.</p>
    <div className="row" style={{ gap: 8, margin: "12px 0" }} role="tablist">
      {([["inline", "Inline embed"], ["widget", "Popup widget"], ["text", "Popup text link"]] as const).map(([k, l]) =>
        <button key={k} role="tab" aria-selected={kind === k} className={`btn ${kind === k ? "primary" : ""}`} onClick={() => setKind(k)}>{l}</button>)}
    </div>
    <div className="card" style={{ padding: 18 }}>
      <label className="f" htmlFor="emb-et">Event type</label>
      <select id="emb-et" className="input" value={slug} onChange={e => setSlug(e.target.value)}><option value="">All event types (profile page)</option>{types.map(t => <option key={t.slug} value={t.slug}>{t.title}</option>)}</select>
      <label className="f" htmlFor="emb-color">Button and accent color</label><input id="emb-color" type="color" value={color} onChange={e => setColor(e.target.value)} />
      {kind !== "inline" && <><label className="f" htmlFor="emb-text">Text</label><input id="emb-text" className="input" value={text} onChange={e => setText(e.target.value)} /></>}
      <label className="f">Code</label>
      <pre className="code" data-testid="embed-code">{code}</pre>
      <button className="btn" onClick={() => navigator.clipboard?.writeText(code)}>Copy code</button>
      <a className="btn" style={{ marginLeft: 8 }} href={BP + "/embed-demo.html"} target="_blank">See a live demo page</a>
    </div>
  </>;
}
