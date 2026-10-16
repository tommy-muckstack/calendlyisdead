"use client";
export default function ContactsError({ reset }: { reset(): void }) {
  return <div role="alert"><h2>We couldn’t load your contacts</h2><p>Please try again.</p><button className="btn" onClick={reset}>Try again</button></div>;
}
