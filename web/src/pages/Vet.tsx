// US-12 수의사 연동 — 개체별 섭취 데이터 조회 + 급여 처방.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { format } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import { useDogsQuery, useFeedingsQuery } from "@/hooks/queries";
import { buildIntakeSeries } from "@/lib/intake";
import { DogService } from "@/services/DogService";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/services/AuthService";

export default function Vet() {
  const qc = useQueryClient();
  const vetId = useAuth((s) => s.user?.id);
  const { data: dogs = [], isLoading } = useDogsQuery();
  const { data: feedings = [] } = useFeedingsQuery();

  const [selected, setSelected] = useState<string | null>(null);
  const [foodType, setFoodType] = useState("");
  const [dailyG, setDailyG] = useState(60);
  const [frequency, setFrequency] = useState(2);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dog = useMemo(
    () => dogs.find((d) => d.id === selected) ?? null,
    [dogs, selected]
  );

  // 개체가 로드되거나 선택이 바뀌면 폼을 해당 개체 값으로 채운다.
  useEffect(() => {
    if (!dogs.length) return;
    const target = dogs.find((d) => d.id === selected) ?? dogs[0];
    setSelected(target.id);
    setFoodType(target.food_type ?? "");
    setDailyG(target.recommended_g ?? 60);
    setNote(target.vet_note ?? "");
    setSaved(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dogs, selected]);

  // 선택 개체의 섭취 통계.
  const stats = useMemo(() => {
    if (!dog) return null;
    const mine = feedings
      .filter((f) => f.dog_id === dog.id && f.dispensed_g > 0)
      .sort(
        (a, b) =>
          new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
      );
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = mine.filter(
      (f) => new Date(f.scheduled_at).getTime() >= weekAgo
    );
    const avg7d = recent.length
      ? Math.round(recent.reduce((s, f) => s + f.consumed_g, 0) / recent.length)
      : null;
    const last = mine[0];
    const ratio =
      avg7d != null && dog.recommended_g
        ? avg7d / dog.recommended_g
        : null;
    const pattern =
      ratio == null ? "데이터 없음" : ratio >= 0.9 ? "정상" : ratio >= 0.7 ? "주의" : "이상";
    return {
      avg7d,
      lastAt: last ? new Date(last.dispensed_at ?? last.scheduled_at) : null,
      pattern,
      patternOk: ratio != null && ratio >= 0.9,
    };
  }, [dog, feedings]);

  const onSave = async () => {
    if (!dog || !vetId) {
      setError("로그인 정보를 확인할 수 없습니다.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // US-12: 처방 이력은 vet_recommendations 에 누적 기록.
      const { error: recError } = await supabase
        .from("vet_recommendations")
        .insert({
          dog_id: dog.id,
          vet_id: vetId,
          food_type: foodType || null,
          daily_g: dailyG,
          frequency_per_day: frequency,
          note: note || null,
        });
      if (recError) throw recError;

      // 개체 카드에 반영되도록 dogs 레코드도 갱신.
      await DogService.update(dog.id, {
        food_type: foodType,
        recommended_g: dailyG,
        vet_note: note,
      });
      qc.invalidateQueries({ queryKey: ["dogs"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <PageHeader title="수의사 연동" subtitle="개체별 섭취 데이터 조회 및 급여 조정" />
        <div className="flex items-center justify-center py-20 text-ink-faint">
          <Loader2 className="mr-2 animate-spin" size={16} /> 로딩 중…
        </div>
      </>
    );
  }

  if (!dogs.length || !dog) {
    return (
      <>
        <PageHeader title="수의사 연동" subtitle="개체별 섭취 데이터 조회 및 급여 조정" />
        <div className="card p-10 text-center text-[13px] text-ink-mute">
          등록된 개체가 없습니다. 먼저 개체를 등록해주세요.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="수의사 연동" subtitle="개체별 섭취 데이터 조회 및 급여 조정" />

      <div className="grid grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 text-[14px] font-bold text-ink-body">
            <span className="h-2 w-2 rounded-full bg-brand-dark" /> 섭취 데이터 조회
          </div>

          <label className="mb-1.5 block text-[12px] font-semibold text-ink-body">개체 선택</label>
          <select
            className="input mb-4"
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {dogs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.breed_name_ko} · {d.weight_kg}kg
              </option>
            ))}
          </select>

          <div className="space-y-2 text-[12px]">
            <Row
              label="최근 7일 평균 섭취량"
              value={stats?.avg7d != null ? `${stats.avg7d} g / 회` : "기록 없음"}
            />
            <Row
              label="최근 섭취 시간"
              value={stats?.lastAt ? format(stats.lastAt, "MM.dd HH:mm") : "-"}
            />
            <Row
              label="섭취 패턴"
              value={stats?.pattern ?? "데이터 없음"}
              tone={stats?.patternOk ? "brand" : undefined}
            />
            <Row label="체중" value={`${dog.weight_kg} kg`} />
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[12px] font-bold text-ink-body">30일 섭취 추이</div>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={buildIntakeSeries(feedings, dog.id, 30)}>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#8CA0B3" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(v: number) => [`${v}g`, "섭취량"]}
                  />
                  <ReferenceLine y={dailyG} stroke="#1A82E2" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="consumed_g"
                    stroke="#1A82E2"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 text-[14px] font-bold text-ink-body">
            <span className="h-2 w-2 rounded-full bg-brand-dark" /> 급여 조정
          </div>

          <div className="space-y-3 text-[12px]">
            <div>
              <label className="mb-1.5 block font-semibold text-ink-body">권장 사료</label>
              <input className="input" value={foodType} onChange={(e) => setFoodType(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block font-semibold text-ink-body">권장 급여량 (1회)</label>
              <input
                className="input"
                type="number"
                value={dailyG}
                onChange={(e) => setDailyG(parseInt(e.target.value || "0", 10))}
              />
            </div>
            <div>
              <label className="mb-1.5 block font-semibold text-ink-body">1일 급식 횟수</label>
              <select
                className="input"
                value={frequency}
                onChange={(e) => setFrequency(parseInt(e.target.value, 10))}
              >
                <option value={1}>1회 (저녁)</option>
                <option value={2}>2회 (아침, 저녁)</option>
                <option value={3}>3회 (아침, 점심, 저녁)</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block font-semibold text-ink-body">수의사 메모</label>
              <textarea
                className="input min-h-[80px] py-2"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="알레르기, 처방, 특이사항"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-accent-danger/30 bg-accent-danger/5 px-3 py-2 text-[12px] font-semibold text-accent-danger">
              {error}
            </div>
          )}

          <button
            className="btn-primary mt-5 w-full"
            onClick={onSave}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? "저장 중…" : saved ? "저장 완료" : "급여 설정 저장"}
          </button>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "brand";
}) {
  return (
    <div className="flex items-center justify-between border-b border-ink-softline py-1.5">
      <span className="text-ink-faint">{label}</span>
      <span className={tone === "brand" ? "font-bold text-brand" : "font-bold text-ink-body"}>
        {value}
      </span>
    </div>
  );
}
