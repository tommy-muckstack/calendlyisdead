"use client";
import { useEffect } from "react";
/** Inside an embed iframe: report height so the parent can size the frame, and tell it when a booking lands. */
export function EmbedBridge({ booked }: { booked?: string }) {
  useEffect(() => {
    if (window.parent === window) return;
    const post = (m: any) => window.parent.postMessage({ source: "calendlyisdead", ...m }, "*");
    const ro = new ResizeObserver(() => post({ type: "height", height: document.documentElement.scrollHeight }));
    ro.observe(document.body);
    post({ type: "ready" });
    if (booked) post({ type: "booked", uid: booked });
    return () => ro.disconnect();
  }, [booked]);
  return null;
}
