import clsx from "clsx";

type Tone = "default" | "warn" | "danger";

export default function StatCard({
  label,
  value,
  unit,
  sub,
  tone = "default",
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  tone?: Tone;
}) {
  const accent = {
    default: "from-brand-dark to-brand",
    warn: "from-accent-warn to-[#E9C46A]",
    danger: "from-accent-danger to-accent-warn",
  }[tone];

  const numColor = {
    default: "text-brand",
    warn: "text-accent-warn",
    danger: "text-accent-danger",
  }[tone];

  return (
    <div className="card relative overflow-hidden p-5">
      <div className={clsx("absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r", accent)} />
      <div className="text-[11px] font-medium text-ink-faint">{label}</div>
      <div className={clsx("mt-2 text-[32px] font-black leading-none", numColor)}>
        {value}
        {unit && (
          <span className="ml-0.5 text-[14px] font-bold align-top">{unit}</span>
        )}
      </div>
      {sub && <div className="mt-1.5 text-[10px] text-ink-faint">{sub}</div>}
    </div>
  );
}
