// Supabase client — 단일 데이터 소스.
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 반드시 설정돼 있어야 한다.
//  - 로컬: web/.env
//  - 배포: Vercel 프로젝트 환경변수 (web/.env 는 .gitignore 라 빌드에 포함되지 않음)

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  throw new Error(
    "[PawFeeder] Supabase 환경변수가 없습니다. " +
      "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 .env(로컬) 와 " +
      "Vercel 프로젝트 환경변수에 설정하세요."
  );
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
