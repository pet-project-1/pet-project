// Supabase client stub — Sprint 1.
// Real keys go into .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// Until then, services fall back to mockData.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseEnabled = Boolean(url && key);

export const supabase: SupabaseClient | null = isSupabaseEnabled
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
