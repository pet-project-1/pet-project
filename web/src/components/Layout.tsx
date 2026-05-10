import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useRealtime } from "@/hooks/useRealtime";

export default function Layout() {
  // 인증된 모든 페이지에서 Supabase 실시간 채널 구독 (US-15 AC#3)
  useRealtime();

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar />
      <main className="ml-[220px] px-8 py-7">
        <Outlet />
      </main>
    </div>
  );
}
