"use client";
export default function OpportunitiesError({ reset }: { reset(): void }) { return <div role="alert"><h2>We couldn’t load opportunities</h2><p>Your saved opportunities are kept. Try again.</p><button className="btn" onClick={reset}>Try again</button></div>; }
