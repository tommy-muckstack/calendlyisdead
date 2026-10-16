import Link from "next/link";
export default function OpportunityNotFound() { return <section><h2>Opportunity unavailable</h2><p>It may have been deleted or belong to another account.</p><Link className="btn" href="/app/opportunities">Back to Opportunities</Link></section>; }
