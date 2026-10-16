"use client";
export default function MeetingsError({ reset }: { reset: () => void }) {
  return <div role="alert"><h2>We couldn’t load your meetings</h2><p>Please try again.</p><button className="btn" onClick={reset}>Try again</button></div>;
}
