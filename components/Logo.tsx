export function Logo({ size = 28 }: { size?: number }) {
  return <span className="row" style={{ gap: 8, fontWeight: 800 }}><img src="/logo.svg" width={size} height={size} alt="" />CalendlyIsDead</span>;
}
