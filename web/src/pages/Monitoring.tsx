import { format } from "date-fns";
import PageHeader, { LiveBadge } from "@/components/PageHeader";
import CameraBox from "@/components/CameraBox";
import StatusPill from "@/components/StatusPill";
import { feedings } from "@/lib/mockData";

export default function Monitoring() {
  return (
    <>
      <PageHeader
        title="실시간 모니터링"
        subtitle="급식기 카메라 실시간 영상 및 인식 결과"
        right={<LiveBadge />}
      />

      <div className="mb-5 grid grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[14px] font-bold text-ink-body">
              <span className="h-2 w-2 rounded-full bg-brand-dark" />
              급식기 1번
            </div>
            <span className="pill bg-brand/15 text-brand">정상</span>
          </div>
          <CameraBox
            label="급식기 1번 실시간 영상"
            height={360}
            detection={{
              name: "몰티즈",
              confidence: 0.942,
              pos: { left: "12%", top: "26%" },
            }}
            status="급식 진행 중 · 1번 개체"
            time="09:32:15"
          />
        </div>
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[14px] font-bold text-ink-body">
              <span className="h-2 w-2 rounded-full bg-accent-danger" />
              급식기 2번
            </div>
            <span className="pill bg-accent-danger/15 text-accent-danger">차단 중</span>
          </div>
          <CameraBox
            label="급식기 2번 실시간 영상"
            height={360}
            blocked={{ pos: { left: "16%", top: "26%" } }}
            status="배식 중단"
            time="09:28:42"
          />
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2 text-[14px] font-bold text-ink-body">
          <span className="h-2 w-2 rounded-full bg-brand-dark" />
          실시간 급식 로그
        </div>
        <div className="space-y-1.5">
          {feedings.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-4 rounded-lg bg-surface px-3 py-3 text-[12px]"
            >
              <span className="w-12 text-ink-faint">
                {format(new Date(f.scheduled_at), "HH:mm")}
              </span>
              <span className="w-40 font-bold text-ink-body">
                {f.dog_name} {f.breed_name_ko !== "-" && `· ${f.breed_name_ko}`}
              </span>
              <span className="flex-1 text-ink-mute">
                {f.status === "blocked"
                  ? `${f.device_name} 접근`
                  : `${f.consumed_g}g / ${f.dispensed_g}g 섭취`}
              </span>
              <StatusPill status={f.status} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
