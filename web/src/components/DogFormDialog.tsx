// US-03 등록 + US-05 수정 폼 다이얼로그
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { breedOptions, DogService } from "@/services/DogService";
import type { Dog } from "@/types";

interface Props {
  mode: "create" | "edit";
  dog?: Dog;
  onClose: () => void;
  onSaved: () => void;
}

export default function DogFormDialog({ mode, dog, onClose, onSaved }: Props) {
  const [name, setName] = useState(dog?.name ?? "");
  const [breedCode, setBreedCode] = useState(dog?.breed_code ?? "MALTESE");
  const [weight, setWeight] = useState(dog?.weight_kg ?? 3.0);
  const [foodType, setFoodType] = useState(dog?.food_type ?? "소형견용 일반사료");
  const [recommendedG, setRecommendedG] = useState(dog?.recommended_g ?? 60);
  const [photoUrl, setPhotoUrl] = useState(dog?.photo_url ?? "");
  const [vetNote, setVetNote] = useState(dog?.vet_note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("개체 이름을 입력해주세요.");
    if (weight <= 0) return setError("체중은 0보다 커야 합니다.");

    setSaving(true);
    try {
      if (mode === "create") {
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
            {mode === "create" ? "신규 개체 등록" : "개체 정보 수정"}
          </h3>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="이름 *">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 8번 개체" />
          </Field>
          <Field label="품종 *">
            <select className="input" value={breedCode} onChange={(e) => setBreedCode(e.target.value)}>
              {breedOptions.map((b) => (
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
          <button type="submit" className="btn-primary" disabled={saving}>
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
