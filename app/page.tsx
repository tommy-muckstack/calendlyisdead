import Link from "next/link";
import "./marketing.css";
import { cmSans, cmSerif } from "@/components/mk/fonts";
import { Banner, Nav, Footer } from "@/components/mk/chrome";
import { HeroArt, MobileHero, Story, Tiles, Stories, Reel } from "@/components/mk/home";
import { ICON, G, MsMark } from "@/components/mk/icons";
import { Wordmark } from "@/components/mk/chrome";
import { MeasuredPage } from "@/components/mk/m/MeasuredPage";
import hm from "@/components/mk/m/home390.json";
// Structure mirrors calendly.com's 2026 homepage: banner, nav, cream hero card with OAuth buttons, icon intro, scroll-driven
// "Scheduling" story, three accordion stories, gradient "why" section, integrations, final CTA, dark footer. Copy and art are original.
export const metadata = { title: "CalendlyIsDead: free, open-source scheduling" };
function SignupOptions() {
  return <>
    <div className="cm-cta">
      <Link className="cm-oauth" href="/signup?provider=google"><span className="ico"><G /></span>Sign up with Google</Link>
      <Link className="cm-oauth" href="/signup"><span className="ico" aria-hidden="true">{ICON.at}</span>Sign up with email</Link>
    </div>
    <p className="cm-fine">No credit card required</p>
  </>;
}
export default function Home() {
  return <div className={`cm ${cmSans.variable} ${cmSerif.variable}`}>
    <Banner /><Nav />
    <div className="cm-mwrap"><MeasuredPage data={hm as never} display={/Wulkan/}>
      <div className="cm-mobile-signup"><SignupOptions /></div>
    </MeasuredPage></div>
    <div className="mp-desk">
    <section className="cm-sec"><div className="cm-hero">
      <h1 className="cm-h1 cm-sans">Easy scheduling ahead.</h1>
      <p className="cm-lead">Join the people who book meetings for free with the open-source scheduling tool.</p>
      <SignupOptions />
      <HeroArt /><MobileHero />
    </div></section>
    <section className="cm-intro" id="product">
      <div className="cm-icons">{["#6fb3ff", "#dbee9f", "#b89ffa", "#5ddfd7"].map((c, i) => <i key={c} style={{ background: c }}>{[ICON.cal, ICON.spark, ICON.doc, ICON.card][i]}</i>)}</div>
      <h2 className="cm-h2 cm-sans">There’s more to meetings than finding a time.</h2>
      <p className="cm-p">Book meetings, capture discussions and decisions, and keep next steps moving with tools that help you handle the work before, during, and after every meeting.</p>
    </section>
    <Story id="scheduling" tall tag="Scheduling" tagBg="#6fb3ff" title="A better way to book your meetings"
      items={[{ icon: ICON.cal, t: "Full control over your calendar", d: "Connect your calendars, set your hours, and control exactly when you’re available to meet." }, { icon: ICON.list, t: "Meeting templates for every scenario", d: "From one-on-one calls to multi-host meetings, pre-built event types make scheduling easy for everyone." }, { icon: ICON.flow, t: "Automated email & text workflows", d: "Reduce no-shows with personalized email reminders, and let invitees reschedule when needed without the back-and-forth." }, { icon: ICON.embed, t: "Website embeds and routing forms", d: "Let visitors schedule right from your website. Add routing forms to qualify leads and match them with the right team member." }, { icon: ICON.grid, t: "Scheduling whenever, wherever", d: "Use it from any browser, embed it anywhere, or connect it with your favorite tools through webhooks and an API." }, { icon: ICON.team, t: "Tools for teams of all sizes", d: "Add teammates, set permissions, and run round robin and collective events without switching tools." }]}
      art="avail" />
    <Story id="assistant" flip tag="AI assistant" badge="Beta" tagBg="#dbee9f" title="Meet your AI scheduling assistant"
      items={[{ icon: ICON.at, t: "Conversational scheduling", d: "Paste an email thread and the assistant picks the right event type and drafts a reply with booking links. Say what you need and let it take it from there." }, { icon: ICON.cal, t: "Precise coordination" }, { icon: ICON.link, t: "24/7 assistance with meeting tasks" }]}
      art="assist" />
    <Story id="recaps" tag="Insights" badge="New" tagBg="#b89ffa" title="See what your meetings add up to"
      items={[{ icon: ICON.list, t: "Clear summaries with next steps", d: "See bookings, cancellations and busy hours at a glance, so nothing falls through the cracks." }, { icon: ICON.edit, t: "Pre-drafted follow-up emails" }, { icon: ICON.grid, t: "Works with your tools" }, { icon: ICON.spark, t: "Instant meeting recall" }]}
      art="recap" />
    <Story id="payments" flip tag="Payments" badge="New" tagBg="#5ddfd7" title="Flexible payment options that fit your business"
      items={[{ icon: ICON.card, t: "Upfront meeting payments", d: "Collect payment when clients book with you through your own Stripe account, with no cut taken by us." }, { icon: ICON.box, t: "Meeting packages" }, { icon: ICON.doc, t: "Invoices" }, { icon: ICON.link, t: "Payment links" }]}
      art="pay" />
    <section className="cm-cust">
      <div className="head"><span className="cm-eyebrow">Why people switch</span><h2 className="cm-h2 cm-sans">Real features. Real savings.</h2></div>
      <Stories />
    </section>
    <section className="cm-int" id="integrations">
      <span className="cm-eyebrow">Integrations</span>
      <h2 className="cm-h2 cm-sans">Connect it with your favorite tools</h2>
      <p className="cm-p">Calendars, video, payments and webhooks make it flexible.</p>
      <Link className="cm-more" href="/pricing">View all integrations →</Link>
      <Tiles />
      <div className="cm-two">
        <div className="cm-sc"><span style={{ display: "inline-flex" }}><G s={16} /></span><span className="go">↗</span><h3>Google suite</h3><p>Get your job done faster by connecting to Google Calendar and Meet.</p></div>
        <div className="cm-sc"><span style={{ display: "inline-flex" }}><MsMark s={16} /></span><span className="go">↗</span><h3>Microsoft suite</h3><p>Make your day easier with Outlook, Teams and CalDAV calendar support.</p></div>
      </div>
    </section>
    <section className="cm-final">
      <span className="cm-eyebrow">Get started</span>
      <h2 className="cm-h2 cm-sans">From the first meeting to the follow-up</h2>
      <p className="cm-p">All of the work around meetings, handled in one place. Book time, capture every discussion, and keep next steps moving without the manual work.</p>
      <Link className="cm-btn fill" href="/signup">Start for free</Link>
      <Reel />
    </section>
    </div>
    <Footer />
  </div>;
}
