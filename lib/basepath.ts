// Next.js basePath. The app is served under https://yourappisdead.com/calendlyisdead.
// next/link, router.push and next/navigation redirect() add it automatically;
// plain fetch(), <a href>, <img src>, location.href and absolute URLs do not, so use BP / withBase.
export const BP: string = process.env.NEXT_PUBLIC_BASE_PATH ?? "/calendlyisdead";
export const withBase = (p: string) => (p.startsWith("/") && !p.startsWith("//") ? BP + p : p);
