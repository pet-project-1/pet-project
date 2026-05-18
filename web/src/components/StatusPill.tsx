import clsx from "clsx";
import type { FeedingStatus } from "@/types";

const labels: Record<FeedingStatus, string> = {
  completed: "완료",
  pending: "대기",
  incomplete: "미완료",
  blocked: "차단",
};

const tone: Record<FeedingStatus, string> = {
  completed: "bg-brand/20 text-brand-dark",
  pending: "bg-accent-warn/15 text-accent-warn",
  incomplete: "bg-accent-warn/15 text-accent-warn",
  blocked: "bg-accent-danger/15 text-accent-danger",
};

export default function StatusPill({ status }: { status: FeedingStatus }) {
  return <span className={clsx("pill", tone[status])}>{labels[status]}</span>;
}
