"use client";
import { DateTime } from "luxon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OPPORTUNITY_STAGES, type OpportunityDetailData } from "@/lib/opportunity-validation";
import { OpportunityEditor, opportunityRequest } from "./OpportunityEditor";
import { useAutomationOperation } from "./useContactAutomationOperation";
export function OpportunityDetails({ initial, historyPage, timezone }: { initial: OpportunityDetailData; historyPage: number; timezone: string }) {
  const [editing, setEditing] = useState(false); const router = useRouter(), operation = useAutomationOperation(), alert = useRef<HTMLParagraphElement>(null), opportunity = initial.opportunity;
  useEffect(() => { if (operation.error && !operation.busy) alert.current?.focus(); }, [operation.error, operation.busy]);
  async function remove() { if (!confirm(`Delete ${opportunity.name}? This permanently removes the opportunity and its stage history. The contact and meetings are kept.`)) return; const result = await operation.run(signal => opportunityRequest(opportunity.id, "DELETE", { version: opportunity.version }, signal)); if (result) { router.push("/app/opportunities"); router.refresh(); } }
  return <><Link href="/app/opportunities">← Opportunities</Link><div className="contacts-heading"><h2>{opportunity.name}</h2><div className="contact-list-actions"><button className="btn" disabled={operation.busy} onClick={() => setEditing(true)}>Edit</button><button className="btn contact-delete" disabled={operation.busy} onClick={() => void remove()}>Delete opportunity</button></div></div>
    {operation.error && <p className="contact-error" role="alert" ref={alert} tabIndex={-1}>{operation.error}</p>}{operation.conflict && <button className="btn" onClick={() => router.refresh()}>Reload opportunity</button>}
    <dl className="contact-properties"><div><dt>Stage</dt><dd>{OPPORTUNITY_STAGES[opportunity.stage]}</dd></div><div><dt>Contact</dt><dd>{initial.contact ? <Link href={`/app/contacts/${initial.contact.id}`}>{initial.contact.name} · {initial.contact.email}</Link> : "Contact unavailable"}</dd></div><div><dt>Value amount</dt><dd>{opportunity.amount ? `${opportunity.currency} ${opportunity.amount}` : "Not set"}</dd></div><div><dt>Close date</dt><dd>{opportunity.closeDate || "Not set"}</dd></div><div><dt>Source</dt><dd>{opportunity.source || "Not set"}</dd></div><div><dt>Notes</dt><dd className="contact-note-body">{opportunity.notes || "Not set"}</dd></div></dl>
    <h3>Stage history</h3><p className="muted">Times shown in {timezone}</p><ol className="opportunity-history">{initial.history.map(move => <li key={move.id}><span>{move.from ? `${OPPORTUNITY_STAGES[move.from]} → ${OPPORTUNITY_STAGES[move.to]}` : `Created in ${OPPORTUNITY_STAGES[move.to]}`}</span><time dateTime={move.at}>{DateTime.fromISO(move.at).setZone(timezone).toFormat("LLL d, yyyy · h:mm:ss a")}</time></li>)}</ol>
    <nav className="contacts-pagination" aria-label="Stage history pages">{historyPage > 1 && <Link className="btn" href={`/app/opportunities/${opportunity.id}?historyPage=${historyPage - 1}`}>Previous history</Link>}<span>Page {historyPage} of {Math.max(1, Math.ceil(initial.historyTotal / 50))}</span>{historyPage * 50 < initial.historyTotal && <Link className="btn" href={`/app/opportunities/${opportunity.id}?historyPage=${historyPage + 1}`}>Next history</Link>}</nav>
    {editing && <OpportunityEditor initial={initial} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh(); }} />}
  </>;
}
