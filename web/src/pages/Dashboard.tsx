// US-15 급식 현황 대시보드
// AC1: 개체별 급식 상태 (완료/대기/미섭취) 표시
// AC2: 급식 이력 테이블 조회 가능
// AC3: Supabase Realtime 으로 실시간 데이터 반영 (← <Layout> 의 useRealtime 훅)

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import PageHeader, { LiveBadge } from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import StatusPill from "@/components/StatusPill";
import CameraBox from "@/components/CameraBox";
import {
  useAlertsQuery,
  useDevicesQuery,
  useDogsQuery,
  useFeedingsQuery,
} from "@/hooks/queries";
import { parseUnregisteredAccessMessage } from "@/lib/feederApi";

// 대시보드 "실시간 카메라" 카드는 급식기 1번 스트림을 보여준다.
const FEEDER_1_ID = import.meta.env.VITE_FEEDER_1_DEVICE_ID;

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: dogs = [], isLoading: dogsLoading } = useDogsQuery();
  const { data: feedings = [] } = useFeedingsQuery();
  const { data: alerts = [] } = useAlertsQuery();
  const { data: devices = [] } = useDevicesQuery();

  const stats = useMemo(() => {
    const today = feedings; // 서버에서 이미 최신순 100건. 운영 시 날짜 필터.
    const completed = today.filter((f) => f.status === "completed").length;
    const blocked = today.filter((f) => f.status === "blocked").length;
    const incomplete = today.filter((f) => f.status === "incomplete").length;
    const dispensedRows = today.filter((f) => f.dispensed_g > 0);
    const avgIntake = dispensedRows.length
      ? Math.round(
          (dispensedRows.reduce(
            (acc, f) => acc + (f.consumed_g / f.dispensed_g) * 100,
            0
          ) /
            dispensedRows.length) *
            10
        ) / 10
      : 0;
    const incompleteIds = today
      .filter((f) => f.status === "incomplete")
      .map((f) => f.dog_name)
      .slice(0, 3)
      .join(", ");
    return { completed, blocked, incomplete, avgIntake, incompleteIds };
  }, [feedings]);

  const now = new Date();

  return (
    <>
      <PageHeader
        title="대시보드"
        subtitle={format(now, "yyyy년 M월 d일 EEEE HH:mm:ss", { locale: ko })}
        right={<LiveBadge />}
      />

      <div className="mb-6 grid grid-cols-5 gap-4">
        <StatCard
          label="등록 개체"
          value={dogsLoading ? "—" : dogs.length}
          sub="실시간 동기화됨"
        />
        <StatCard
          label="오늘 급식 완료"
          value={stats.completed}
          sub={
            dogs.length
              ? `${Math.round((stats.completed / dogs.length) * 100)}% 완료`
              : "—"
          }
        />
        <StatCard
          label="미섭취 개체"
          value={stats.incomplete}
          sub={stats.incompleteIds || "없음"}
          tone="warn"
        />
        <StatCard
          label="접근 차단"
          value={stats.blocked}
          sub="미등록 개체"
          tone="danger"
        />
        <StatCard
          label="평균 섭취율"
          value={stats.avgIntake || 0}
          unit="%"
          sub="권장량 대비"
        />
      </div>

      <div className="mb-6 grid grid-cols-[2fr_1fr] gap-5">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[14px] font-bold text-ink-body">
              <span className="h-2 w-2 rounded-full bg-brand-dark" /> 실시간 카메라
            </div>
            <span className="pill bg-brand/20 text-brand-dark">YOLO v8</span>
          </div>
          {/* 급식기 1번 카메라의 Supabase Realtime 스트림 — feeder:<VITE_FEEDER_1_DEVICE_ID>. */}
          <CameraBox label="실시간 영상 피드" deviceId={FEEDER_1_ID} height={320} />
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[14px] font-bold text-ink-body">
              <span className="h-2 w-2 rounded-full bg-accent-danger" /> 최근 알림
            </div>
            <span className="pill bg-accent-danger/15 text-accent-danger">
              {alerts.filter((a) => !a.resolved_at).length}건
            </span>
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 4).map((a) => {
              const meta =
                a.type === "unregistered_access"
                  ? parseUnregisteredAccessMessage(a.message)
                  : null;
              const isClickable = !!meta && !a.resolved_at;
              const onClick = isClickable
                ? () =>
                    navigate(
                      `/dogs?registerPendingTid=${meta!.track_id}&deviceId=${meta!.device_id}`,
                    )
                : undefined;
              const color =
                a.severity === "danger"
                  ? "#E76F51"
                  : a.severity === "warn"
                  ? "#F4A261"
                  : "#5C8214";
              return (
                <div
                  key={a.id}
                  role={isClickable ? "button" : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onClick={onClick}
                  onKeyDown={(e) => {
                    if (isClickable && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onClick?.();
                    }
                  }}
                  className={`flex items-start gap-2.5 rounded-lg bg-surface p-3 ${
                    isClickable ? "cursor-pointer transition hover:bg-brand/5" : ""
                  }`}
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <div
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold text-ink-body">
                      {a.title}
                    </div>
                    <div className="truncate text-[11px] text-ink-mute">
                      {meta ? "클릭하여 개체 등록 →" : a.message}
                    </div>
                    <div className="mt-0.5 text-[10px] text-ink-faint">
                      {format(new Date(a.created_at), "MM.dd HH:mm")}
                    </div>
                  </div>
                </div>
              );
            })}
            {alerts.length === 0 && (
              <div className="py-4 text-center text-[12px] text-ink-faint">
                알림이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[14px] font-bold text-ink-body">
            <span className="h-2 w-2 rounded-full bg-brand-dark" /> 개체별 급식 현황
          </div>
          <span className="pill bg-brand/20 text-brand-dark">실시간</span>
        </div>

        {dogsLoading ? (
          <div className="flex items-center justify-center py-10 text-ink-faint">
            <Loader2 className="mr-2 animate-spin" size={16} /> 로딩 중…
          </div>
        ) : (
          <table>
            <thead>
              <tr className="border-b border-ink-line">
                {["개체", "품종", "체중", "권장량", "섭취량", "섭취율", "상태"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dogs.slice(0, 8).map((d) => {
                const fr = feedings.find((f) => f.dog_id === d.id);
                const consumed = fr?.consumed_g ?? 0;
                const recommended = d.recommended_g ?? 60;
                const pct = Math.min(
                  100,
                  Math.round((consumed / recommended) * 100)
                );
                const status = fr?.status ?? "pending";
                return (
                  <tr
                    key={d.id}
                    className="border-b border-ink-softline hover:bg-surface"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-avatar text-[14px]">
                          🐶
                        </div>
                        <div className="font-bold text-ink-body">{d.name}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-ink-mute">
                      {d.breed_name_ko}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-ink-mute">
                      {d.weight_kg}kg
                    </td>
                    <td className="px-3 py-3 text-[12px] text-ink-mute">
                      {recommended}g
                    </td>
                    <td className="px-3 py-3 text-[12px] text-ink-mute">
                      {consumed}g
                    </td>
                    <td className="px-3 py-3">
                      <div className="h-1.5 w-[100px] overflow-hidden rounded-full bg-ink-line">
                        <div
                          className={`h-full rounded-full ${
                            pct < 60 ? "bg-accent-warn" : "bg-brand"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          {devices.map((dev) => (
            <div
              key={dev.id}
              className="rounded-lg border border-ink-line bg-surface p-3 text-[12px]"
            >
              <div className="flex items-center justify-between">
                <div className="font-bold text-ink-body">{dev.name}</div>
                <span
                  className={`pill ${
                    dev.status === "online"
                      ? "bg-brand/20 text-brand-dark"
                      : "bg-accent-danger/15 text-accent-danger"
                  }`}
                >
                  {dev.status === "online" ? "온라인" : "오프라인"}
                </span>
              </div>
              <div className="mt-1 text-ink-mute">
                {dev.location} · 사료 잔량 {dev.food_remaining_pct}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
