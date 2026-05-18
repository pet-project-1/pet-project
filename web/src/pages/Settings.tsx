import { useState } from "react";
import { Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useDevicesQuery } from "@/hooks/queries";

export default function Settings() {
  const { data: devices = [], isLoading: devicesLoading } = useDevicesQuery();
  const [morning, setMorning] = useState("08:00");
  const [evening, setEvening] = useState("18:00");
  const [blockUnregistered, setBlockUnregistered] = useState(true);
  const [voiceGuide, setVoiceGuide] = useState(true);
  const [notifMissed, setNotifMissed] = useState(true);
  const [notifAbnormal, setNotifAbnormal] = useState(true);
  const [notifAccess, setNotifAccess] = useState(true);
  const [notifVet, setNotifVet] = useState(true);

  return (
    <>
      <PageHeader title="설정" subtitle="시스템 환경 설정" />

      <div className="grid grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 text-[14px] font-bold text-ink-body">
            <span className="h-2 w-2 rounded-full bg-brand-dark" /> 급식 설정
          </div>

          <div className="space-y-4">
            <RowField
              label="오전 급식 시간"
              hint="오전 급식 자동 시작 시간"
            >
              <input className="input w-32" type="time" value={morning} onChange={(e) => setMorning(e.target.value)} />
            </RowField>
            <RowField
              label="오후 급식 시간"
              hint="오후 급식 자동 시작 시간"
            >
              <input className="input w-32" type="time" value={evening} onChange={(e) => setEvening(e.target.value)} />
            </RowField>
            <RowToggle
              label="미등록 개체 접근 시 배식 중단"
              hint="등록되지 않은 개체 접근 시 자동으로 사료 배출 중단"
              value={blockUnregistered}
              onChange={setBlockUnregistered}
            />
            <RowToggle
              label="급식 시 음성 출력"
              hint="급식 시간에 저장된 음성을 스피커로 출력하여 반려견 유도"
              value={voiceGuide}
              onChange={setVoiceGuide}
            />
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 text-[14px] font-bold text-ink-body">
            <span className="h-2 w-2 rounded-full bg-brand-dark" /> 알림 설정
          </div>

          <div className="space-y-4">
            <RowToggle
              label="미섭취 알림"
              hint="급식 시간 경과 후 미섭취 시 알림 발송"
              value={notifMissed}
              onChange={setNotifMissed}
            />
            <RowToggle
              label="섭취량 이상 알림"
              hint="평균 대비 30% 이상 감소 시 알림"
              value={notifAbnormal}
              onChange={setNotifAbnormal}
            />
            <RowToggle
              label="미등록 개체 접근 알림"
              hint="미등록 개체 접근 시 즉시 알림"
              value={notifAccess}
              onChange={setNotifAccess}
            />
            <RowToggle
              label="수의사 변경 알림"
              hint="수의사가 급여 설정 변경 시 알림"
              value={notifVet}
              onChange={setNotifVet}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 card p-5">
        <div className="mb-4 flex items-center gap-2 text-[14px] font-bold text-ink-body">
          <span className="h-2 w-2 rounded-full bg-brand-dark" /> 하드웨어 상태
        </div>

        {devicesLoading ? (
          <div className="flex items-center justify-center py-8 text-ink-faint">
            <Loader2 className="mr-2 animate-spin" size={16} /> 로딩 중…
          </div>
        ) : devices.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-ink-mute">
            등록된 급식기가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {devices.map((d) => (
              <div key={d.id} className="rounded-lg border border-ink-line bg-surface p-4">
                <div className="text-[11px] text-ink-faint">{d.name}</div>
                <div
                  className={`mt-1 text-[14px] font-bold ${
                    d.status === "online" ? "text-brand-dark" : "text-accent-danger"
                  }`}
                >
                  {d.status === "online" ? "정상 작동 중" : "오프라인"}
                </div>
                <div className="mt-1 text-[11px] text-ink-mute">
                  {d.location} · 사료 잔량 {d.food_remaining_pct}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function RowField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-softline pb-3">
      <div>
        <div className="text-[13px] font-semibold text-ink-body">{label}</div>
        {hint && <div className="text-[11px] text-ink-faint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function RowToggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <RowField label={label} hint={hint}>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition ${
          value ? "bg-brand" : "bg-ink-line"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            value ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </RowField>
  );
}
