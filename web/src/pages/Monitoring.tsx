import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import PageHeader, { LiveBadge } from "@/components/PageHeader";
import CameraBox from "@/components/CameraBox";
import StatusPill from "@/components/StatusPill";
import { useFeedingsQuery } from "@/hooks/queries";

const FEEDER_1_ID = import.meta.env.VITE_FEEDER_1_DEVICE_ID;
const FEEDER_2_ID = import.meta.env.VITE_FEEDER_2_DEVICE_ID;

export default function Monitoring() {
  const { data: feedings = [], isLoading } = useFeedingsQuery();

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
            <span className="pill bg-brand/20 text-brand-dark">정상</span>
          </div>
          <CameraBox
            label="급식기 1번 실시간 영상"
            deviceId={FEEDER_1_ID}
          />
        </div>
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[14px] font-bold text-ink-body">
              <span className="h-2 w-2 rounded-full bg-accent-danger" />
              급식기 2번
            </div>
            <span className="pill bg-brand/20 text-brand-dark">정상</span>
          </div>
          <CameraBox
            label="급식기 2번 실시간 영상"
            deviceId={FEEDER_2_ID}
          />
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2 text-[14px] font-bold text-ink-body">
          <span className="h-2 w-2 rounded-full bg-brand-dark" />
          실시간 급식 로그
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-ink-faint">
            <Loader2 className="mr-2 animate-spin" size={16} /> 로딩 중…
          </div>
        ) : feedings.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-ink-mute">
            급식 기록이 없습니다.
          </div>
        ) : (
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
        )}
      </div>
    </>
  );
}
