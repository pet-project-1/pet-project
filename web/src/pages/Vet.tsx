import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import PageHeader from "@/components/PageHeader";
import { dogs, intake30d } from "@/lib/mockData";

export default function Vet() {
  const [selected, setSelected] = useState(dogs[0].id);
  const dog = useMemo(() => dogs.find((d) => d.id === selected) ?? dogs[0], [selected]);
  const [foodType, setFoodType] = useState(dog.food_type ?? "");
  const [dailyG, setDailyG] = useState(dog.recommended_g ?? 60);
  const [frequency, setFrequency] = useState(2);
  const [note, setNote] = useState(dog.vet_note ?? "");
  const [saved, setSaved] = useState(false);

  const onSelectChange = (id: string) => {
    setSelected(id);
    const d = dogs.find((x) => x.id === id);
    if (d) {
      setFoodType(d.food_type ?? "");
      setDailyG(d.recommended_g ?? 60);
      setNote(d.vet_note ?? "");
      setSaved(false);
    }
  };

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
            value={selected}
            onChange={(e) => onSelectChange(e.target.value)}
          >
            {dogs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.breed_name_ko} · {d.weight_kg}kg
              </option>
            ))}
          </select>

          <div className="space-y-2 text-[12px]">
            <Row label="최근 7일 평균 섭취량" value={`${dailyG - 3} g / 회`} />
            <Row label="최근 섭취 시간" value="09:32" />
            <Row label="섭취 패턴" value="정상" tone="brand" />
            <Row label="체중 변화" value={`${dog.weight_kg}kg (변동 없음)`} />
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[12px] font-bold text-ink-body">30일 섭취 추이</div>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={intake30d}>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#8CA0B3" }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[30, 80]} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
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
            <div>
              <label className="mb-1.5 block font-semibold text-ink-body">담당 수의사</label>
              <input className="input" defaultValue="김수의사 · 도그마루 메디컬센터" />
            </div>
          </div>

          <button
            className="btn-primary mt-5 w-full"
            onClick={() => {
              setSaved(true);
              setTimeout(() => setSaved(false), 1800);
            }}
          >
            <Save size={16} />
            {saved ? "저장 완료" : "급여 설정 저장"}
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
