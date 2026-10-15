// Original line icons (24px grid, 1.8 stroke) drawn for CalendlyIsDead.
import type { ReactNode } from "react";
const S = ({ children, s = 20 }: { children: ReactNode; s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>;
export const I = {
  sched: (s?: number) => <S s={s}><path d="M7 3h10M7 21h10" /><path d="M8 3c0 5 8 5 8 9s-8 4-8 9" /><path d="M16 3c0 5-8 5-8 9s8 4 8 9" /></S>,
  cal: (s?: number) => <S s={s}><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M4 10h16" /><rect x="8.5" y="13" width="3" height="3" rx=".6" /></S>,
  assist: (s?: number) => <S s={s}><path d="M12 3c.6 4.2 2.3 6 6.5 6.5-4.2.5-5.9 2.3-6.5 6.5-.6-4.2-2.3-6-6.5-6.500C9.7 9 11.4 7.2 12 3z" /><path d="M18 16.500c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.800z" /></S>,
  team: (s?: number) => <S s={s}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.4-3.5 2.8-5.5 5.5-5.500s5.1 2 5.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.600c2.4.2 3.9 1.9 4.2 4.4" /></S>,
  auto: (s?: number) => <S s={s}><circle cx="12" cy="12" r="2" /><path d="M12 10C12 5 14 3 17 3c0 3-2 5-5 7zM14 12c5 0 7 2 7 5-3 0-5-2-7-5zM12 14c0 5-2 7-5 7 0-3 2-5 5-7zM10 12C5 12 3 10 3 7c3 0 5 2 7 5z" /></S>,
  chart: (s?: number) => <S s={s}><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></S>,
  gear: (s?: number) => <S s={s}><circle cx="12" cy="12" r="3" /><path d="M12 2.500l1.5 2.5 2.9-.5.9 2.8 2.7 1.2-1 2.8 1 2.8-2.7 1.2-.9 2.8-2.9-.5L12 21.5 10.5 19l-2.9.5-.9-2.800L4 15.500l1-2.8-1-2.8 2.7-1.2.9-2.8 2.9.5z" /></S>,
  plus: (s?: number) => <S s={s}><path d="M12 5v14M5 12h14" /></S>,
  chev: (s?: number) => <S s={s}><path d="M6 9l6 6 6-6" /></S>,
  search: (s?: number) => <S s={s}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></S>,
  link: (s?: number) => <S s={s}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.700l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.700l1-1" /></S>,
  ext: (s?: number) => <S s={s}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></S>,
  dots: (s?: number) => <S s={s}><circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" /></S>,
  close: (s?: number) => <S s={s}><path d="M6 6l12 12M18 6L6 18" /></S>,
  help: (s?: number) => <S s={s}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.500a2.5 2.5 0 1 1 3.5 2.300c-.7.4-1 1-1 1.700M12 17v.1" /></S>,
  avail: (s?: number) => <S s={s}><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M4 10h16" /><circle cx="15" cy="15" r="2.5" /><path d="M15 14v1.200l.8.5" /></S>,
  panel: (s?: number) => <S s={s}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9.5 4.500v15" /></S>,
  up: (s?: number) => <S s={s}><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M12 16V8M8.5 11.500L12 8l3.5 3.5" /></S>,
  star: (s?: number) => <S s={s}><path d="M12 3.500l2.5 5.2 5.7.8-4.1 4 1 5.700L12 16.5 6.9 19.200l1-5.7-4.1-4 5.7-.8z" /></S>,
};
