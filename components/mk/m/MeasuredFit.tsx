"use client";
import { useEffect } from "react";
// Squeezes/stretches each measured text line (transform: scaleX) so a lookalike font occupies the original's measured width.
export function MeasuredFit() {
  useEffect(() => {
    const fit = () => document.querySelectorAll<HTMLElement>(".mp-t[data-w]").forEach(el => {
      const w = parseFloat(el.dataset.w || "0"); if (!w) return;
      el.style.transform = ""; const cur = el.getBoundingClientRect().width; if (!cur) return;
      const k = w / cur; if (Math.abs(k - 1) > 0.012 && k > 0.78 && k < 1.3) { el.style.transform = `scaleX(${k.toFixed(4)})`; el.style.transformOrigin = "left center"; }
    });
    (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(fit); fit();
  }, []);
  return null;
}
