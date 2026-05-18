import type { ReactNode } from "react";

export default function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-7 flex items-end justify-between">
      <div>
        <h1 className="text-[24px] font-black text-ink leading-tight">{title}</h1>
        {subtitle && (
          <div className="mt-1 text-[12px] font-medium text-ink-faint">{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  );
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2.5 py-1 text-[10px] font-bold text-brand-dark">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-dark" />
      LIVE
    </span>
  );
}
