// US-04 개체 조회 + US-05 수정 + US-06 삭제 진입점
// US-03 등록은 별도 다이얼로그에서.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, Pencil, Trash2, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { DogService } from "@/services/DogService";
import { useBreedsQuery, useFeedingsQuery } from "@/hooks/queries";
import { buildIntakeSeries } from "@/lib/intake";
import type { Dog } from "@/types";
import DogFormDialog from "@/components/DogFormDialog";

export default function Dogs() {
  const [list, setList] = useState<Dog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [breedFilter, setBreedFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<
    { trackId: number; deviceId: string } | null
  >(null);
  const [editTarget, setEditTarget] = useState<Dog | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Dog | null>(null);

  // 알람 클릭으로 들어온 경우: ?registerPendingTid=<tid>&deviceId=<id>
  // → 자동으로 등록 모달을 pending 모드로 연다.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const tidStr = searchParams.get("registerPendingTid");
    const deviceId = searchParams.get("deviceId");
    if (tidStr && deviceId) {
      const tid = Number(tidStr);
      if (Number.isFinite(tid)) {
        setPendingTarget({ trackId: tid, deviceId });
        setRegisterOpen(true);
      }
    }
  }, [searchParams]);

  const closeRegister = () => {
    setRegisterOpen(false);
    setPendingTarget(null);
    if (searchParams.get("registerPendingTid")) {
      setSearchParams({}, { replace: true });
    }
  };

  const { data: breeds = [] } = useBreedsQuery();
  const { data: feedings = [] } = useFeedingsQuery();

  const refresh = async () => {
    const data = await DogService.list();
    setList(data);
    if (data.length && !selectedId) setSelectedId(data[0].id);
  };

  useEffect(() => {
    refresh();
    const unsub = DogService.subscribe(refresh);
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return list.filter((d) => {
      if (breedFilter !== "ALL" && d.breed_code !== breedFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !d.name.toLowerCase().includes(q) &&
          !d.breed_name_ko.toLowerCase().includes(q) &&
          !d.id.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [list, breedFilter, search]);

  const selected = list.find((d) => d.id === selectedId);

  const onDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      // 급식 이력이 있으면 DB 트리거가 차단하고 에러 메시지를 던진다.
      await DogService.remove(deleteTarget.id);
      setDeleteTarget(null);
      setError(null);
      if (selectedId === deleteTarget.id) setSelectedId(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="개체 관리"
        subtitle="등록된 개체 정보 및 상세 관리"
        right={
          <button
            className="btn-primary"
            onClick={() => {
              setPendingTarget(null);
              setRegisterOpen(true);
            }}
          >
            <Plus size={16} /> 개체 등록
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-accent-danger/30 bg-accent-danger/5 px-3 py-2 text-[12px] font-semibold text-accent-danger">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[1.5fr_1fr] gap-5">
        {/* 목록 */}
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[14px] font-bold text-ink-body">
              <span className="h-2 w-2 rounded-full bg-brand-dark" /> 등록 개체 목록
              <span className="pill ml-1 bg-brand/20 text-brand-dark">{filtered.length}마리</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  className="input h-9 w-44 pl-7 text-[12px]"
                  placeholder="이름·품종·ID 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="input h-9 w-28 text-[12px]"
                value={breedFilter}
                onChange={(e) => setBreedFilter(e.target.value)}
              >
                <option value="ALL">품종 전체</option>
                {breeds.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name_ko}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-ink-mute">
              조건에 맞는 개체가 없습니다.
            </div>
          ) : (
            <table>
              <thead>
                <tr className="border-b border-ink-line">
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">개체</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">품종</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">체중</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">등록일</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">권장량</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-ink-faint">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelectedId(d.id)}
                    className={`cursor-pointer border-b border-ink-softline ${
                      selectedId === d.id ? "bg-brand/5" : "hover:bg-surface"
                    }`}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-avatar text-[14px]">
                          🐶
                        </div>
                        <div className="font-bold text-ink-body">{d.name}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-ink-mute">{d.breed_name_ko}</td>
                    <td className="px-3 py-3 text-[12px] text-ink-mute">{d.weight_kg}kg</td>
                    <td className="px-3 py-3 text-[12px] text-ink-mute">
                      {format(new Date(d.created_at), "MM.dd")}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-ink-mute">
                      {d.recommended_g ?? "-"}g
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        className="rounded p-1.5 text-ink-mute hover:bg-surface"
                        title="수정"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditTarget(d);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="ml-1 rounded p-1.5 text-accent-danger hover:bg-accent-danger/10"
                        title="삭제"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(d);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 상세 */}
        <div className="card p-5">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-[12px] text-ink-mute">
              개체를 선택하면 상세 정보가 표시됩니다.
            </div>
          ) : (
            <>
              <div className="text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-brand bg-avatar text-3xl">
                  🐶
                </div>
                <div className="mt-3 text-[16px] font-bold text-ink-body">{selected.name}</div>
                <div className="text-[11px] text-ink-faint">
                  {selected.breed_name_ko} · 등록일{" "}
                  {format(new Date(selected.created_at), "yyyy.MM.dd")}
                </div>
              </div>

              <div className="mt-5 space-y-2 text-[12px]">
                <DetailRow label="품종" value={selected.breed_name_ko} />
                <DetailRow label="체중" value={`${selected.weight_kg} kg`} />
                <DetailRow label="권장 급여량" value={`${selected.recommended_g ?? "-"} g / 회`} />
                <DetailRow label="사료 종류" value={selected.food_type ?? "-"} />
                <DetailRow label="수의사 메모" value={selected.vet_note ?? "없음"} />
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-bold text-ink-body">
                  <BarChart3 size={14} className="text-brand-dark" /> 최근 7일 섭취량
                </div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={buildIntakeSeries(feedings, selected.id, 7)}>
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#8CA0B3" }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8 }}
                        formatter={(v: number) => [`${v}g`, "섭취량"]}
                      />
                      <Bar dataKey="consumed_g" radius={[4, 4, 0, 0]} fill="#9ED12A" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 등록 다이얼로그 (US-03) — pendingTarget 있으면 Pi /register 호출 모드 */}
      {registerOpen && (
        <DogFormDialog
          mode="create"
          pending={pendingTarget ?? undefined}
          onClose={closeRegister}
          onSaved={() => {
            closeRegister();
            refresh();
          }}
        />
      )}

      {/* 수정 다이얼로그 (US-05) */}
      {editTarget && (
        <DogFormDialog
          mode="edit"
          dog={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            refresh();
          }}
        />
      )}

      {/* 삭제 확인 (US-06) */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="개체를 삭제하시겠습니까?"
        message={
          deleteTarget
            ? `${deleteTarget.name} (${deleteTarget.breed_name_ko}) 의 모든 정보가 제거됩니다.\n급식 이력이 있는 경우 보관 처리가 권장됩니다.`
            : ""
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDeleteConfirm}
      />
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-softline py-1.5">
      <span className="text-ink-faint">{label}</span>
      <span className="font-bold text-ink-body">{value}</span>
    </div>
  );
}
