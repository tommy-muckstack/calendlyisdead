import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { BP } from "@/lib/basepath";
import { integrationById } from "@/lib/integrations/catalog";
import { integrationStates } from "@/lib/integrations/state";
import { googleOAuth } from "@/lib/calendars/google";
import { msOAuth } from "@/lib/calendars/microsoft";
import { IntegrationIcon } from "@/components/IntegrationIcon";
import "@/components/integrations.css";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if (!user) redirect("/login");
  const item = integrationById((await params).id); if (!item) notFound();
  const state = (await integrationStates(user.id, user.addToCalendarId))[item.id];
  const configured = item.setup === "calendar" && (item.provider === "caldav" || (item.provider === "google" ? googleOAuth.configured() : msOAuth.configured()));
  return <section className="integration-detail">
    <Link href="/app/integrations" className="integration-back">← Integrations &amp; apps</Link>
    <header><IntegrationIcon item={item} /><div><h2>{item.name}</h2><span className={`integration-state ${state.tone}`}>{state.label}</span></div></header>
    <div className="integration-setup"><h3>{item.setup === "reusable" ? "Use your meeting link" : "Set up your integration"}</h3><p>{item.description}</p>
      {item.setup === "calendar" && <>
        <ol><li>Connect your calendar account and choose which calendars to check for conflicts.</li><li>In Calendar connections, choose where to add new bookings.</li><li>Manage or disconnect your account from Calendar connections at any time.</li></ol>
        {!configured && <p className="integration-notice">New {item.name} connections are unavailable on this deployment. You can still manage an existing connection.</p>}
        {state.tone === "attention" && <p className="integration-notice">A calendar needs attention. Check the account in Calendar connections and reconnect it if access has expired.</p>}
        <div className="integration-actions">{configured && (item.provider === "caldav" ? <Link className="btn primary" href="/app/calendars?connect=icloud">Connect iCloud Calendar</Link> : <a className="btn primary" href={`${BP}/api/integrations/${item.provider}/connect`}>Connect {item.name}</a>)}<Link className="btn" href="/app/calendars">Manage calendar connections</Link></div>
      </>}
      {item.setup === "meet" && <>
        <ol><li>Create a reusable meeting link in Google Meet.</li><li>Open an event type, choose Google Meet in Location, and paste the meeting link.</li><li>Save changes. New bookings include the same link in their confirmation and invitation.</li></ol>
        <p className="integration-notice">The location picker currently uses a link you provide. It does not create a unique Meet room for each booking.</p>
        <h3>Existing automatic Meet events</h3><p>If an existing event already creates Meet links automatically, connect Google Calendar and select a writable Google calendar under “Add new bookings to.” Keep that event’s current location to retain automatic link creation.</p>
        <p>“Calendar ready” reflects your selected Google destination and last known connection status. It does not verify live provider access or enable automatic Meet on an event.</p>
        <div className="integration-actions"><Link className="btn primary" href="/app/calendars">Set up Google Calendar</Link><Link className="btn" href="/app">Choose an event type</Link></div>
      </>}
      {item.setup === "reusable" && <>
        <ol><li>Create a reusable meeting link in {item.id === "zoom" ? "Zoom" : "Microsoft Teams"}.</li><li>Open an event type, choose {item.id === "zoom" ? "Zoom" : "Microsoft Teams"} in Location, and paste the meeting link.</li><li>Save changes. Bookings for that event include the same link in their confirmation and invitation.</li></ol>
        <p className="integration-notice">This setup uses a link you provide. It does not connect your {item.name} account or create a unique room for each booking.</p>
        <div className="integration-actions"><Link className="btn primary" href="/app">Choose an event type</Link></div>
      </>}
      {item.setup === "embed" && <>
        <ol><li>Choose your booking page or an event type.</li><li>Choose an inline embed, popup button, or popup link and customize its appearance.</li><li>Copy the generated code into your website and preview the result.</li></ol>
        <div className="integration-actions"><Link className="btn primary" href="/app/embed">Create an embed</Link></div>
      </>}
    </div>
  </section>;
}
