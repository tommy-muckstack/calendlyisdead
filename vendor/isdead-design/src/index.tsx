import * as React from "react";
type Cx = { className?: string };
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "danger";
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "md" | "sm"; block?: boolean; pill?: boolean; icon?: React.ReactNode };
export function Button({ variant = "outline", size = "md", block, pill, icon, className, children, ...p }: ButtonProps) {
  return <button {...p} className={cx("ids-btn", `ids-btn--${variant}`, size === "sm" && "ids-btn--sm", block && "ids-btn--block", pill && "ids-btn--pill", className)}>{icon}{children}</button>;
}
export type LinkButtonProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: "md" | "sm"; block?: boolean; pill?: boolean };
export function LinkButton({ variant = "outline", size = "md", block, pill, className, ...p }: LinkButtonProps) {
  return <a {...p} className={cx("ids-btn", `ids-btn--${variant}`, size === "sm" && "ids-btn--sm", block && "ids-btn--block", pill && "ids-btn--pill", className)} />;
}
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx("ids-input", className)} />;
});
export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) { return <label {...p} className={cx("ids-label", className)} />; }
export function Card({ hero, className, ...p }: React.HTMLAttributes<HTMLDivElement> & { hero?: boolean }) { return <div {...p} className={cx("ids-card", hero && "ids-card--hero", className)} />; }
export function Divider({ label, className }: { label?: string } & Cx) { return <div role="separator" className={cx("ids-divider", className)}>{label}</div>; }
export function Pill({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) { return <span {...p} className={cx("ids-pill", className)} />; }
export function NavBar({ brand, links = [], actions, className }: { brand: React.ReactNode; links?: { href: string; label: string }[]; actions?: React.ReactNode } & Cx) {
  return <nav className={cx("ids-nav", className)}><div className="ids-nav__brand">{brand}</div>
    <div className="ids-nav__links">{links.map(l => <a key={l.href + l.label} href={l.href}>{l.label}</a>)}</div>
    <div className="ids-nav__actions">{actions}</div></nav>;
}
/** Full-bleed gradient page with a centered white card: the shared /login template. */
export function AuthCard({ title, children, footer, className }: { title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode } & Cx) {
  return <section className={cx("ids-auth", className)}><div className="ids-auth__card"><h1 className="ids-h2">{title}</h1>{children}{footer && <div className="ids-auth__footer">{footer}</div>}</div></section>;
}
export function Hero({ eyebrow, title, subtitle, actions, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return <header className="ids-hero">{eyebrow}<h1 className="ids-h1" style={{ margin: "16px auto", maxWidth: 900 }}>{title}</h1>
    {subtitle && <p className="ids-muted" style={{ fontSize: "var(--ids-type-lg)", maxWidth: 640, margin: "0 auto" }}>{subtitle}</p>}
    {actions && <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>{actions}</div>}{children}</header>;
}
export function Section({ id, title, subtitle, children, className, style }: { id?: string; title?: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode; style?: React.CSSProperties } & Cx) {
  return <section id={id} className={cx("ids-section", className)} style={style}>{title && <h2 className="ids-h2" style={{ textAlign: "center", fontSize: "var(--ids-type-3xl)" }}>{title}</h2>}
    {subtitle && <p className="ids-muted" style={{ textAlign: "center", maxWidth: 640, margin: "12px auto 0" }}>{subtitle}</p>}{children}</section>;
}
export function Footer({ columns, note }: { columns: { title: string; links: { href: string; label: string }[] }[]; note?: React.ReactNode }) {
  return <footer><div className="ids-footer">{columns.map(c => <div key={c.title}><h4>{c.title}</h4>{c.links.map(l => <a key={l.label} href={l.href}>{l.label}</a>)}</div>)}</div>
    {note && <p className="ids-muted" style={{ textAlign: "center", fontSize: 13, padding: "0 32px 40px" }}>{note}</p>}</footer>;
}
export const themes = ["calendly", "superhuman", "wisprflow"] as const;
export type ThemeName = (typeof themes)[number];
