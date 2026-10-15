import { Banner, Nav } from "@/components/mk/chrome";
// Calendly marketing chrome (announcement banner + nav) used by public pages.
export function SiteNav({ auth = false }: { auth?: boolean }) { return <><Banner /><Nav /></>; }
