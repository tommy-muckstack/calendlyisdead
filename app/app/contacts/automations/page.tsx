import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { BP } from "@/lib/basepath";
import { contactAutomationEvents, readContactAutomation } from "@/lib/contact-automations";
import { readContactFieldAutomation } from "@/lib/contact-field-automations";
import { ContactCustomFieldAutomations } from "@/components/ContactFieldAutomation";
import { ContactListAutomationPanel } from "@/components/ContactListAutomation";
import { readContactQuestionAutomation } from "@/lib/contact-question-automations";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ event?: string | string[] }> }) {
  const user = await requireUser(); if (!user) redirect("/login");
  const params = await searchParams, events = await contactAutomationEvents(user.id), selected = params.event === undefined ? events[0]?.id : typeof params.event === "string" ? params.event : "";
  const event = events.find(event => event.id === selected), [initial, fieldInitial, questionInitial] = event ? await Promise.all([readContactAutomation(user.id, event.id), readContactFieldAutomation(user.id, event.id), readContactQuestionAutomation(user.id, event.id)]) : [undefined, undefined, undefined];
  return <section className="contacts" aria-labelledby="contact-automations-heading"><Link href="/app/contacts">← Contacts</Link><h2 id="contact-automations-heading">Contact automations</h2><p>Organize your own contacts when they book an event you host. Set up each event separately.</p>
    {events.length ? <><form className="contacts-filters" action={`${BP}/app/contacts/automations`} method="get"><label>Event type<select className="input" name="event" defaultValue={event?.id ?? ""}>{!event && <option value="">Choose an event type</option>}{events.map(event => <option value={event.id} key={event.id}>{event.title} · {event.kind.replaceAll("_", " ")}</option>)}</select></label><button className="btn">Open event automation</button></form>
      {event && initial && fieldInitial ? <div key={event.id}><ContactListAutomationPanel eventId={event.id} initial={initial} /><ContactCustomFieldAutomations eventId={event.id} initial={fieldInitial} questionInitial={questionInitial} /></div> : <p role="alert">Choose an event you currently host. This event may have been removed or reassigned.</p>}</> : <div className="contacts-empty"><h3>No event types yet</h3><p>Create an event type before setting up contact automations.</p><Link className="btn" href="/app">Open Scheduling</Link></div>}
    <p className="muted">New contact creation follows your <Link href="/app/contact-settings">Contacts settings</Link>. Pausing or deleting an automation keeps contacts already added to lists.</p>
  </section>;
}
