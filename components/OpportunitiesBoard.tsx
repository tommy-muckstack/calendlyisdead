"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import { OPPORTUNITY_STAGES, OpportunityList, type Opportunity, type OpportunityListData, type Stage } from "@/lib/opportunity-validation";
import { AutomationResponseError, useAutomationOperation } from "./useContactAutomationOperation";
import { OpportunityEditor, opportunityRequest } from "./OpportunityEditor";
const stages = Object.keys(OPPORTUNITY_STAGES) as Stage[];
export type OpportunityBoardData = Record<Stage, OpportunityListData>;
export function OpportunitiesBoard({ initial, query, contactId }: { initial: OpportunityBoardData; query: string; contactId?: string }) {
  const [data, setData] = useState(initial), [creating, setCreating] = useState(false), [message, setMessage] = useState(""), [targets, setTargets] = useState<Record<string, Stage>>({});
  const operation = useAutomationOperation(), dragged = useRef<Opportunity | null>(null), status = useRef<HTMLParagraphElement>(null);
  async function fetchStage(stage: Stage, page: number, signal: AbortSignal) {
    const response = await fetch(`${BP}/api/opportunities?${new URLSearchParams({ q: query, stage, page: String(page), ...(contactId ? { contactId } : {}) })}`, { signal }); if (!response.ok) throw new AutomationResponseError("The board could not refresh. Your saved opportunities are kept. Try again.", response.status);
    const value = OpportunityList.parse(await response.json()); if (value.stage !== stage || value.page !== page) throw new Error("Unconfirmed board"); return value;
  }
  async function reload() {
    const result = await operation.run(async signal => Object.fromEntries(await Promise.all(stages.map(async stage => [stage, await fetchStage(stage, 1, signal)]))) as OpportunityBoardData);
    if (result) { setData(result.value); setMessage("Board refreshed."); }
  }
  async function page(stage: Stage, number: number) { const result = await operation.run(signal => fetchStage(stage, number, signal)); if (result) setData(current => ({ ...current, [stage]: result.value })); }
  async function move(opportunity: Opportunity, stage: Stage) {
    dragged.current = null; if (opportunity.stage === stage || operation.pending.current) return;
    const result = await operation.run(async signal => { const value = await opportunityRequest(opportunity.id, "PATCH", { action: "move", stage, version: opportunity.version }, signal); if (!value || value.opportunity.stage !== stage) throw new Error("Unconfirmed stage"); return value; });
    if (result) { setMessage(`${opportunity.name} moved to ${OPPORTUNITY_STAGES[stage]}.`); setData(current => ({ ...current, [opportunity.stage]: { ...current[opportunity.stage], rows: current[opportunity.stage].rows.filter(row => row.opportunity.id !== opportunity.id), total: Math.max(0, current[opportunity.stage].total - 1) }, [stage]: { ...current[stage], rows: current[stage].page === 1 ? [{ opportunity: result.value.opportunity, contact: result.value.contact }, ...current[stage].rows.filter(row => row.opportunity.id !== opportunity.id)].slice(0, 25) : current[stage].rows, total: current[stage].total + 1 } })); status.current?.focus(); }
  }
  return <><div className="contacts-heading"><div><h2>Opportunities</h2><p className="muted">Track your work from first conversation to completion.</p></div><Link className="btn" href="/app/opportunities/automations">Automations</Link><button className="btn primary" onClick={() => setCreating(true)}>+ Add opportunity</button></div>
    <form className="contacts-filters" action={`${BP}/app/opportunities`}><label>Search opportunities<input className="input" name="q" type="search" defaultValue={query} maxLength={200} /></label>{contactId && <input type="hidden" name="contactId" value={contactId} />}<button className="btn">Search</button>{(query || contactId) && <Link className="btn" href="/app/opportunities">Clear filters</Link>}</form>
    <p className="muted">Drag an opportunity to another stage, or choose its stage and select Move.</p><p role="status" tabIndex={-1} ref={status}>{message}</p>{operation.error && <p role="alert" className="contact-error">{operation.error}</p>}<button className="btn" disabled={operation.busy} onClick={() => void reload()}>Refresh board</button>
    <div className="opportunity-board" aria-label="Opportunity stages">{stages.map(stage => { const column = data[stage]; return <section className="opportunity-stage" key={stage} aria-labelledby={`stage-${stage}`} onDragOver={event => { if (dragged.current && !operation.busy) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragged.current) void move(dragged.current, stage); }}>
      <h3 id={`stage-${stage}`}>{OPPORTUNITY_STAGES[stage]} <span>{column.total}</span></h3><ul>{column.rows.map(({ opportunity: row, contact }) => <li key={row.id}><article className="opportunity-card" draggable={!operation.busy} onDragStart={event => { dragged.current = row; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", row.id); }} onDragEnd={() => { dragged.current = null; }}>
        <Link href={`/app/opportunities/${row.id}`}>{row.name}</Link><p>{contact?.name ?? "Contact unavailable"}</p>{row.amount && <p>{row.currency} {row.amount}</p>}{row.closeDate && <p>Close date: <time dateTime={row.closeDate}>{row.closeDate}</time></p>}
        <label htmlFor={`move-${row.id}`}>Move to stage</label><select id={`move-${row.id}`} className="input" value={targets[row.id] ?? row.stage} disabled={operation.busy} onChange={event => setTargets(current => ({ ...current, [row.id]: event.target.value as Stage }))}>{stages.map(key => <option key={key} value={key}>{OPPORTUNITY_STAGES[key]}</option>)}</select><button className="btn" disabled={operation.busy || !targets[row.id] || targets[row.id] === row.stage} onClick={() => void move(row, targets[row.id])}>Move</button>
      </article></li>)}</ul>{!column.rows.length && <p className="muted">{column.total ? "No opportunities on this page. Refresh or choose a previous page." : "No opportunities in this stage."}</p>}
      {column.total > 25 || column.page > 1 ? <nav aria-label={`${OPPORTUNITY_STAGES[stage]} pages`} className="contact-list-actions"><button className="btn" disabled={operation.busy || column.page <= 1} onClick={() => void page(stage, column.page - 1)}>Previous</button><span>Page {column.page} of {Math.max(1, Math.ceil(column.total / 25))}</span><button className="btn" disabled={operation.busy || column.page * 25 >= column.total} onClick={() => void page(stage, column.page + 1)}>Next</button></nav> : null}
    </section>; })}</div>
    {creating && <OpportunityEditor onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setMessage("Opportunity saved. Refreshing the board…"); void reload(); }} />}
  </>;
}
