import "../../marketing.css";
import { cmSans, cmSerif } from "@/components/mk/fonts";
import { Banner, Nav, Footer } from "@/components/mk/chrome";
import { PriceCalc } from "@/components/PriceCalc";
import { CALENDLY } from "@/lib/pricing";
export const metadata = { title: "What your team pays for scheduling | CalendlyIsDead" };
export default function Calculator() {
  return <div className={`cm ${cmSans.variable} ${cmSerif.variable}`}><Banner /><Nav />
    <section className="cm-cmpsec" id="calculator">
      <div className="cm-cmp" style={{ marginTop: 0 }}><h2>What your team is paying for scheduling</h2>
        <div style={{ marginTop: 32 }}><PriceCalc /></div>
        <p style={{ fontSize: 13, opacity: .7 }}>Calendly list prices per seat, billed yearly, as of {CALENDLY.asOf}: Standard ${CALENDLY.standard}/mo, Teams ${CALENDLY.teams}/mo, Enterprise from ${CALENDLY.enterpriseFromYear.toLocaleString()}/yr. Self-hosting has your own hosting costs; small instances fit in free tiers.</p></div>
    </section>
    <Footer /></div>;
}
