/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_FEEDER_1_DEVICE_ID?: string;
  readonly VITE_FEEDER_2_DEVICE_ID?: string;
  readonly VITE_FEEDER_1_API_URL?: string;
  readonly VITE_FEEDER_2_API_URL?: string;
  readonly VITE_FEEDER_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
