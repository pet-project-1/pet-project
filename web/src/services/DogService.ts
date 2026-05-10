// US-03 ~ US-06 개체 CRUD 서비스
// Supabase 활성화 전에는 in-memory 목 저장소를 사용.

import { isSupabaseEnabled, supabase } from "@/lib/supabase";
import { breeds, dogs as seed } from "@/lib/mockData";
import type { Dog } from "@/types";

let store: Dog[] = [...seed];
const subscribers = new Set<() => void>();

const notify = () => subscribers.forEach((fn) => fn());

export const DogService = {
  subscribe(fn: () => void) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },

  async list(): Promise<Dog[]> {
    if (isSupabaseEnabled && supabase) {
      const { data, error } = await supabase
        .from("dogs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Dog[]) ?? [];
    }
    await new Promise((r) => setTimeout(r, 120));
    return [...store];
  },

  async get(id: string): Promise<Dog | undefined> {
    if (isSupabaseEnabled && supabase) {
      const { data, error } = await supabase.from("dogs").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Dog;
    }
    await new Promise((r) => setTimeout(r, 80));
    return store.find((d) => d.id === id);
  },

  async create(input: Omit<Dog, "id" | "created_at" | "breed_name_ko" | "status">): Promise<Dog> {
    const breed = breeds.find((b) => b.code === input.breed_code);
    if (!breed) throw new Error("올바르지 않은 품종 코드입니다.");

    const dup = store.some(
      (d) => d.name.trim() === input.name.trim() && d.status !== "archived"
    );
    if (dup) throw new Error("이미 동일한 이름의 개체가 등록되어 있습니다.");

    const dog: Dog = {
      ...input,
      id: `dog-${Date.now()}`,
      created_at: new Date().toISOString(),
      breed_name_ko: breed.name_ko,
      recommended_g: input.recommended_g ?? Math.round(input.weight_kg * breed.daily_g_per_kg / 2),
      status: "active",
    };

    if (isSupabaseEnabled && supabase) {
      const { data, error } = await supabase.from("dogs").insert(dog).select().single();
      if (error) throw error;
      return data as Dog;
    }
    await new Promise((r) => setTimeout(r, 120));
    store = [dog, ...store];
    notify();
    return dog;
  },

  async update(id: string, patch: Partial<Dog>): Promise<Dog> {
    if (isSupabaseEnabled && supabase) {
      const { data, error } = await supabase.from("dogs").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as Dog;
    }
    await new Promise((r) => setTimeout(r, 100));
    const idx = store.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error("개체를 찾을 수 없습니다.");
    if (patch.breed_code) {
      const b = breeds.find((br) => br.code === patch.breed_code);
      if (!b) throw new Error("올바르지 않은 품종 코드입니다.");
      patch.breed_name_ko = b.name_ko;
    }
    store[idx] = { ...store[idx], ...patch };
    notify();
    return store[idx];
  },

  async remove(id: string, hasFeedingHistory: boolean): Promise<void> {
    if (hasFeedingHistory) {
      // US-06 AC: 급식 이력이 있는 개체는 삭제 불가 또는 경고 표시 → 소프트 삭제로 우회 권장.
      throw new Error(
        "급식 이력이 있는 개체는 완전 삭제할 수 없습니다. 보관(archived) 처리 후 다시 시도해주세요."
      );
    }
    if (isSupabaseEnabled && supabase) {
      const { error } = await supabase.from("dogs").delete().eq("id", id);
      if (error) throw error;
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
    store = store.filter((d) => d.id !== id);
    notify();
  },

  async archive(id: string): Promise<void> {
    await this.update(id, { status: "archived" });
  },
};

export const breedOptions = breeds;
