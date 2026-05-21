// US-03 등록 + US-05 수정 폼 다이얼로그.
// pending 모드 (props.pending) 일 때는 Pi 의 /register 를 호출 — Pi 가 OSNet 임베딩과 함께
// supabase dogs 행을 insert 하고 미등록 접근 alert 도 resolve 한다.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { DogService } from "@/services/DogService";
import { useBreedsQuery } from "@/hooks/queries";
import {
  deviceIdToApiUrl,
  fetchPending,
  pendingThumbnailUrl,
  registerPendingDog,
} from "@/lib/feederApi";
import type { Dog } from "@/types";

interface PendingTarget {
  trackId: number;
  deviceId: string;
}

interface Props {
  mode: "create" | "edit";
  dog?: Dog;
  pending?: PendingTarget;
  onClose: () => void;
  onSaved: () => void;
}

export default function DogFormDialog({ mode, dog, pending, onClose, onSaved }: Props) {
  const [name, setName] = useState(dog?.name ?? "");
  const [breedCode, setBreedCode] = useState(dog?.breed_code ?? "MALTESE");
  const [weight, setWeight] = useState(dog?.weight_kg ?? 3.0);
  const [foodType, setFoodType] = useState(dog?.food_type ?? "소형견용 일반사료");
  const [recommendedG, setRecommendedG] = useState(dog?.recommended_g ?? 60);
  const [photoUrl, setPhotoUrl] = useState(dog?.photo_url ?? "");
  const [vetNote, setVetNote] = useState(dog?.vet_note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [thumbnailOk, setThumbnailOk] = useState(true);
  const [predictedBreed, setPredictedBreed] = useState<string | null>(null);

  const { data: breeds = [] } = useBreedsQuery();

  const isPending = !!pending;
  const pendingApiUrl = pending ? deviceIdToApiUrl(pending.deviceId) : undefined;

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // pending 모드: Pi /pending 한 번 fetch 해서 predicted_breed_code 가져오기.
  useEffect(() => {
    if (!isPending || !pendingApiUrl || !pending) return;
    let cancelled = false;
    fetchPending(pendingApiUrl)
      .then((items) => {
        if (cancelled) return;
        const match = items.find((p) => p.track_id === pending.trackId);
        if (match?.predicted_breed_code) {
          setPredictedBreed(match.predicted_breed_code);
        }
      })
      .catch(() => {
        /* Pi 통신 실패 — 사용자가 수동 선택. 무시. */
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, pendingApiUrl, pending]);

  // 예측 breed_code 가 supabase breeds 마스터에 존재할 때만 select 에 prefill.
  // 없으면 (DB 시드 미반영) 그대로 기본값 유지 — submit 시 사용자가 수동으로 선택.
  useEffect(() => {
    if (predictedBreed && breeds.some((b) => b.code === predictedBreed)) {
      setBreedCode(predictedBreed);
    }
  }, [predictedBreed, breeds]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("개체 이름을 입력해주세요.");
    if (weight <= 0) return setError("체중은 0보다 커야 합니다.");

    setSaving(true);
    try {
      if (mode === "create" && pending) {
        if (!pendingApiUrl) {
          throw new Error(
            `'${pending.deviceId}' 의 API URL 이 설정되지 않았습니다. web/.env 의 VITE_FEEDER_*_API_URL 확인 필요.`,
          );
        }
        await registerPendingDog(pendingApiUrl, {
          track_id: pending.trackId,
          name: name.trim(),
          breed_code: breedCode,
          weight_kg: weight,
          food_type: foodType || undefined,
          recommended_g: recommendedG,
          photo_url: photoUrl || undefined,
          vet_note: vetNote || undefined,
        });
      } else if (mode === "create") {
        await DogService.create({
          name: name.trim(),
          breed_code: breedCode,
          weight_kg: weight,
          food_type: foodType,
          recommended_g: recommendedG,
          photo_url: photoUrl || undefined,
          vet_note: vetNote || undefined,
        });
      } else if (dog) {
        await DogService.update(dog.id, {
          name: name.trim(),
          breed_code: breedCode,
          weight_kg: weight,
          food_type: foodType,
          recommended_g: recommendedG,
          photo_url: photoUrl || undefined,
          vet_note: vetNote || undefined,
        });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-ink">
            {isPending
              ? `추적 #${pending!.trackId} 개체 등록`
              : mode === "create"
              ? "신규 개체 등록"
              : "개체 정보 수정"}
          </h3>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {isPending && pendingApiUrl && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-ink-line bg-surface p-3">
            {thumbnailOk ? (
              <img
                src={pendingThumbnailUrl(pendingApiUrl, pending!.trackId)}
                alt={`추적 #${pending!.trackId}`}
                className="h-20 w-20 rounded-md border border-ink-line object-cover"
                onError={() => setThumbnailOk(false)}
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-md border border-ink-line bg-white text-[10px] text-ink-faint">
                썸네일 없음
              </div>
            )}
            <div className="text-[11px] text-ink-mute">
              <div className="font-bold text-ink-body">미등록 개체 #{pending!.trackId}</div>
              <div>급식기: {pending!.deviceId}</div>
              <div className="mt-1 text-ink-faint">
                정보 입력 후 등록하면 갤러리에 자동 추가됩니다.
              </div>
            </div>
          </div>
        )}

        {isPending && !pendingApiUrl && (
          <div className="mb-4 rounded-lg border border-accent-danger/30 bg-accent-danger/5 p-3 text-[11px] text-accent-danger">
            '{pending!.deviceId}' 의 API URL 이 설정되지 않았습니다.
            <br />
            web/.env 의 VITE_FEEDER_*_API_URL 을 확인해주세요.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="이름 *">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 8번 개체" />
          </Field>
          <Field
            label={
              predictedBreed && breedCode === predictedBreed
                ? "품종 * 🐾 자동 추론됨"
                : "품종 *"
            }
          >
            <select className="input" value={breedCode} onChange={(e) => setBreedCode(e.target.value)}>
              {breeds.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name_ko}
                </option>
              ))}
            </select>
          </Field>
          <Field label="체중(kg) *">
            <input
              className="input"
              type="number"
              step="0.1"
              min="0.1"
              value={weight}
              onChange={(e) => setWeight(parseFloat(e.target.value))}
            />
          </Field>
          <Field label="권장 급여량(g/회)">
            <input
              className="input"
              type="number"
              min="0"
              value={recommendedG}
              onChange={(e) => setRecommendedG(parseInt(e.target.value || "0", 10))}
            />
          </Field>
          <Field label="사료 종류">
            <input className="input" value={foodType} onChange={(e) => setFoodType(e.target.value)} />
          </Field>
          <Field label="사진 URL">
            <input className="input" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="수의사 메모" full>
            <textarea
              className="input min-h-[64px] py-2"
              value={vetNote}
              onChange={(e) => setVetNote(e.target.value)}
              placeholder="알레르기, 특이사항 등"
            />
          </Field>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-accent-danger/30 bg-accent-danger/5 px-3 py-2 text-[12px] font-semibold text-accent-danger">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            취소
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || (isPending && !pendingApiUrl)}
          >
            {saving ? "저장 중…" : mode === "create" ? "등록" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={full ? "col-span-2" : ""}>
      <span className="mb-1 block text-[12px] font-semibold text-ink-body">{label}</span>
      {children}
    </label>
  );
}
