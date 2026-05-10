// PawFeeder domain types — mirrors Supabase schema (시스템구조설계 §3)

export type UserRole = "admin" | "vet" | "manager";

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  display_name: string;
}

export interface Breed {
  code: string; // e.g. 'BEAGLE'
  name_ko: string;
  name_en: string;
  daily_g_per_kg: number;
}

export type DogStatus = "active" | "pending" | "archived";

export interface Dog {
  id: string;
  name: string;
  breed_code: string;
  breed_name_ko: string;
  weight_kg: number;
  photo_url?: string;
  shelter_id?: string;
  status: DogStatus;
  created_at: string;
  food_type?: string;
  recommended_g?: number;
  vet_note?: string;
}

export interface Device {
  id: string;
  name: string;
  location: string;
  last_seen: string;
  status: "online" | "offline";
  food_remaining_pct: number;
}

export type FeedingStatus = "completed" | "pending" | "incomplete" | "blocked";

export interface FeedingRecord {
  id: string;
  dog_id: string | null;
  dog_name?: string;
  breed_name_ko?: string;
  device_id: string;
  device_name: string;
  scheduled_at: string;
  dispensed_at?: string;
  dispensed_g: number;
  consumed_g: number;
  status: FeedingStatus;
  confidence?: number;
}

export type AlertSeverity = "danger" | "warn" | "info";
export type AlertType =
  | "missed_feeding"
  | "abnormal_intake"
  | "unregistered_access"
  | "system"
  | "vet_change"
  | "new_dog";

export interface AppAlert {
  id: string;
  dog_id: string | null;
  type: AlertType;
  title: string;
  message: string;
  severity: AlertSeverity;
  created_at: string;
  resolved_at: string | null;
}

export interface VetRecommendation {
  id: string;
  dog_id: string;
  vet_id: string;
  food_type: string;
  daily_g: number;
  frequency_per_day: number;
  note: string;
  created_at: string;
}
