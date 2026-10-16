"use client";
export default function ErrorPage({ reset }: { reset(): void }) {
  return <div role="alert"><p>Contact settings could not be loaded.</p><button className="btn" onClick={reset}>Try again</button></div>;
}
