// US-03 ~ US-06 개체 CRUD 서비스 — Supabase 전용.

import { supabase } from "@/lib/supabase";
import type { Dog } from "@/types";

const DOG_SELECT = "*, breeds:breed_code(name_ko)";

function mapDog(d: any): Dog {
  return {
    id: d.id,
    name: d.name,
    breed_code: d.breed_code,
    breed_name_ko: d.breeds?.name_ko ?? d.breed_code,
    weight_kg: Number(d.weight_kg),
    photo_url: d.photo_url ?? undefined,
    shelter_id: d.shelter_id ?? undefined,
    status: d.status,
    food_type: d.food_type ?? undefined,
    recommended_g: d.recommended_g ?? undefined,
    vet_note: d.vet_note ?? undefined,
    created_at: d.created_at,
  };
}

// dogs 테이블에 실제로 존재하는 컬럼만 추려 낸다 (breed_name_ko 등 파생 필드 제외).
function toRow(input: Partial<Dog>) {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.breed_code !== undefined) row.breed_code = input.breed_code;
  if (input.weight_kg !== undefined) row.weight_kg = input.weight_kg;
  if (input.food_type !== undefined) row.food_type = input.food_type ?? null;
  if (input.recommended_g !== undefined) row.recommended_g = input.recommended_g ?? null;
  if (input.photo_url !== undefined) row.photo_url = input.photo_url ?? null;
  if (input.vet_note !== undefined) row.vet_note = input.vet_note ?? null;
  if (input.status !== undefined) row.status = input.status;
  return row;
}

// 로컬 상태가 아닌 DB 가 진실원본이라 구독은 단순 리프레시 신호로만 쓴다.
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());

export const DogService = {
  subscribe(fn: () => void) {
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  },

  async list(): Promise<Dog[]> {
    const { data, error } = await supabase
      .from("dogs")
      .select(DOG_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapDog);
  },

  async get(id: string): Promise<Dog | undefined> {
    const { data, error } = await supabase
      .from("dogs")
      .select(DOG_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapDog(data) : undefined;
  },

  async create(
    input: Omit<Dog, "id" | "created_at" | "breed_name_ko" | "status">
  ): Promise<Dog> {
    // US-03 AC: 동일 이름 중복 등록 방지 (보관 처리된 개체는 제외).
    const { data: dup, error: dupError } = await supabase
      .from("dogs")
      .select("id")
      .eq("name", input.name.trim())
      .neq("status", "archived")
      .limit(1);
    if (dupError) throw dupError;
    if (dup && dup.length) {
      throw new Error("이미 동일한 이름의 개체가 등록되어 있습니다.");
    }

    const { data, error } = await supabase
      .from("dogs")
      .insert(toRow({ ...input, name: input.name.trim() }))
      .select(DOG_SELECT)
      .single();
    if (error) throw error;
    notify();
    return mapDog(data);
  },

  async update(id: string, patch: Partial<Dog>): Promise<Dog> {
    const { data, error } = await supabase
      .from("dogs")
      .update(toRow(patch))
      .eq("id", id)
      .select(DOG_SELECT)
      .single();
    if (error) throw error;
    notify();
    return mapDog(data);
  },

  async remove(id: string): Promise<void> {
    // US-06: 급식 이력이 있으면 DB 트리거(dogs_prevent_hard_delete)가 차단한다.
    const { error } = await supabase.from("dogs").delete().eq("id", id);
    if (error) {
      if (error.message.includes("DOG_HAS_FEEDING_HISTORY")) {
        throw new Error(
          "급식 이력이 있는 개체는 완전 삭제할 수 없습니다. 보관(archived) 처리 후 다시 시도해주세요."
        );
      }
      throw error;
    }
    notify();
  },

  async archive(id: string): Promise<void> {
    await this.update(id, { status: "archived" });
  },
};
