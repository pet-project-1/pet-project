// US-01 관리자 로그인 — Supabase Auth 전용.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "@/lib/supabase";
import type { AppUser } from "@/types";

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: false,
      error: null,
      signIn: async (email, password) => {
        set({ loading: true, error: null });
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error || !data.user) {
            set({
              loading: false,
              error:
                error?.message ?? "이메일 또는 비밀번호가 올바르지 않습니다.",
            });
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
        } catch (e) {
          set({ loading: false, error: (e as Error).message });
          return false;
        }
      },
      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null });
      },
    }),
    { name: "pawfeeder-auth" }
  )
);
