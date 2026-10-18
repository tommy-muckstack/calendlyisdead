"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div><p role="alert">Login settings could not be loaded.</p><button className="btn" onClick={reset}>Try again</button></div>;
}
