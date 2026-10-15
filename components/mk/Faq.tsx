"use client";
import { useState } from "react";
export function Faq({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState<number | null>(null);
  return <div className="cm-faql">{items.map(([q, a], i) => <div key={q} className={open === i ? "on" : ""}>
    <button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}><i><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M2 6h8" />{open !== i && <path d="M6 2v8" />}</svg></i>{q}</button>
    {open === i && <p>{a}</p>}
  </div>)}</div>;
}
