// 서버 ↔ 프론트 어댑터 — 전부 Supabase PostgREST 호출.
// 매핑 후 결과 타입은 @/types 와 일치.

import { supabase } from "./supabase";
import type { AppAlert, Breed, Device, Dog, FeedingRecord } from "@/types";

export async function fetchBreeds(): Promise<Breed[]> {
  const { data, error } = await supabase
    .from("breeds")
    .select("code, name_ko, name_en, daily_g_per_kg")
    .order("name_ko");
  if (error) throw error;
  return (data ?? []) as Breed[];
}

export async function fetchDogs(): Promise<Dog[]> {
  const { data, error } = await supabase
    .from("dogs")
    .select("*, breeds:breed_code(name_ko)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d: any) => ({
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
  }));
}

export async function fetchFeedings(limit = 1000): Promise<FeedingRecord[]> {
  const { data, error } = await supabase
    .from("feeding_records")
    .select(
      `id, dog_id, device_id, scheduled_at, dispensed_at,
       dispensed_g, consumed_g, status, confidence,
       dogs:dog_id(name, breeds:breed_code(name_ko)),
       devices:device_id(name)`
    )
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    dog_id: r.dog_id,
    dog_name: r.dogs?.name ?? "미등록",
    breed_name_ko: r.dogs?.breeds?.name_ko ?? "-",
    device_id: r.device_id,
    device_name: r.devices?.name ?? "",
    scheduled_at: r.scheduled_at,
    dispensed_at: r.dispensed_at ?? undefined,
    dispensed_g: Number(r.dispensed_g),
    consumed_g: Number(r.consumed_g),
    status: r.status,
    confidence: r.confidence != null ? Number(r.confidence) : undefined,
  }));
}

export async function fetchAlerts(): Promise<AppAlert[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((a: any) => ({
    id: a.id,
    dog_id: a.dog_id,
    type: a.type,
    title: a.title,
    message: a.message,
    severity: a.severity,
    created_at: a.created_at,
    resolved_at: a.resolved_at,
  }));
}

export async function fetchDevices(): Promise<Device[]> {
  const { data, error } = await supabase
    .from("devices")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    location: d.location ?? "",
    last_seen: d.last_seen ?? "",
    status: d.status,
    food_remaining_pct: d.food_remaining_pct ?? 0,
  }));
}
