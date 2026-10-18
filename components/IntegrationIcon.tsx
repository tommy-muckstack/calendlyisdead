import type { Integration } from "@/lib/integrations/catalog";
import { I } from "@/components/app/icons";

/** Original capability pictograms, not reproductions of provider logos. */
export function IntegrationIcon({ item }: { item: Integration }) {
  return <span className="integration-icon" style={{ color: item.color }} aria-hidden="true">
    {item.icon === "calendar" ? I.cal(36) : <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {item.icon === "video" ? <><rect x="3" y="8" width="21" height="20" rx="4" /><path d="m24 15 9-6v18l-9-6" /></> : <><path d="m12 10-8 8 8 8m12-16 8 8-8 8m-4-20-4 28" /></>}
    </svg>}
  </span>;
}
