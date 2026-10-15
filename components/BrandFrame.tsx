import { BP } from "@/lib/basepath";
import { brandVars } from "@/lib/branding";
import { EmbedBridge } from "./EmbedBridge";
/** Wraps public pages: host brand color + logo, "powered by" footer unless hidden, and compact embed mode. */
export function BrandFrame({ user, embed, primary, booked, children }: { user?: any; embed?: boolean; primary?: string; booked?: string; children: React.ReactNode }) {
  const color = primary && /^[0-9a-f]{6}$/i.test(primary) ? `#${primary}` : user?.brandColor;
  return <div className={embed ? "embed" : ""} style={brandVars(color) as any} data-testid="brand-frame">
    {user?.logoUrl && !embed && <div style={{ textAlign: "center", marginTop: 28 }}><img src={user.logoUrl} alt={`${user.name ?? "Host"} logo`} data-testid="host-logo" style={{ maxHeight: 56, maxWidth: 220 }} /></div>}
    {children}
    {!user?.hideBranding && <p className="powered" data-testid="powered-by"><a href={BP + "/"} target="_blank">Powered by CalendlyIsDead</a>, free and open source</p>}
    {embed && <EmbedBridge booked={booked} />}
  </div>;
}
