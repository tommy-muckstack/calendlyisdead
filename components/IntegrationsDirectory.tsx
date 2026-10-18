"use client";
import { useState } from "react";
import Link from "next/link";
import { integrations, type IntegrationState } from "@/lib/integrations/catalog";
import { IntegrationIcon } from "./IntegrationIcon";
import "./integrations.css";

export function IntegrationsDirectory({ states }: { states: Record<string, IntegrationState> }) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState("All categories"), [connected, setConnected] = useState(false);
  const visible = integrations.filter(item => (!connected || states[item.id].connected) && (category === "All categories" || category === item.category) && `${item.name} ${item.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="integrations-directory" aria-labelledby="integrations-heading">
    <div className="integrations-intro"><h2 id="integrations-heading">Integrations &amp; apps</h2><p>Connect your tools and keep your meetings in sync.</p></div>
    <div className="integrations-filters">
      <div><label htmlFor="integration-search">Search integrations</label><input id="integration-search" className="input" type="search" placeholder="Search integrations" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div><label htmlFor="integration-category">Category</label><select id="integration-category" className="input" value={category} onChange={event => setCategory(event.target.value)}>{["All categories", "Calendars", "Video conferencing", "Website"].map(value => <option key={value}>{value}</option>)}</select></div>
      <label className="integrations-connected"><input type="checkbox" checked={connected} onChange={event => setConnected(event.target.checked)} /> Connected apps</label>
    </div>
    <p className="integrations-count" role="status">{visible.length} {visible.length === 1 ? "integration" : "integrations"}</p>
    {visible.length ? <ul className="integrations-grid">{visible.map(item => <li key={item.id}>
      <Link className="integration-card" href={`/app/integrations/${item.id}`} aria-labelledby={`integration-${item.id}`}>
        <IntegrationIcon item={item} /><h3 id={`integration-${item.id}`}>{item.name}</h3><p>{item.description}</p>
        <span className={`integration-state ${states[item.id].tone}`}>{states[item.id].label}</span>
      </Link>
    </li>)}</ul> : <div className="integrations-empty"><h3>No integrations found</h3><p>Try another search or clear your filters.</p><button className="btn" onClick={() => { setQuery(""); setCategory("All categories"); setConnected(false); }}>Clear filters</button></div>}
  </section>;
}
