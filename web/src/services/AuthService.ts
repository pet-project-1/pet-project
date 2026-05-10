// US-01 관리자 로그인
// Supabase가 설정되면 실제 인증을 사용하고, 그렇지 않으면 로컬 스텁으로 동작.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isSupabaseEnabled, supabase } from "@/lib/supabase";
import type { AppUser } from "@/types";

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const STUB_USERS: { email: string; password: string; user: AppUser }[] = [
  {
    email: "admin@pawfeeder.test",
    password: "shelter1234",
    user: {
      id: "stub-admin",
      email: "admin@pawfeeder.test",
      role: "admin",
      display_name: "박관리자",
    },
  },
  {
    email: "vet@pawfeeder.test",
    password: "vet1234",
    user: {
      id: "stub-vet",
      email: "vet@pawfeeder.test",
      role: "vet",
      display_name: "김수의사",
    },
  },
];

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: false,
      error: null,
      signIn: async (email, password) => {
        set({ loading: true, error: null });
        try {
          if (isSupabaseEnabled && supabase) {
            const { data, error } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            if (error || !data.user) {
              set({ loading: false, error: error?.message ?? "로그인 실패" });
              return false;
            }
            set({
              loading: false,
              user: {
                id: data.user.id,
                email: data.user.email ?? email,
                role: (data.user.user_metadata?.role ?? "admin") as AppUser["role"],
                display_name:
                  (data.user.user_metadata?.display_name as string) ?? "관리자",
              },
            });
            return true;
          }
          // Stub auth
          await new Promise((r) => setTimeout(r, 350));
          const found = STUB_USERS.find(
            (u) => u.email === email && u.password === password
          );
          if (!found) {
            set({ loading: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." });
            return false;
          }
          set({ loading: false, user: found.user });
          return true;
        } catch (e) {
          set({ loading: false, error: (e as Error).message });
          return false;
        }
      },
      signOut: async () => {
        if (isSupabaseEnabled && supabase) await supabase.auth.signOut();
        set({ user: null });
      },
    }),
    { name: "pawfeeder-auth" }
  )
);
