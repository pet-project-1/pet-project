import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  MonitorPlay,
  PawPrint,
  History,
  Stethoscope,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/services/AuthService";
import clsx from "clsx";

const items = [
  { to: "/dashboard", label: "대시보드", icon: LayoutDashboard, key: "D" },
  { to: "/monitoring", label: "실시간 모니터링", icon: MonitorPlay, key: "M" },
  { to: "/dogs", label: "개체 관리", icon: PawPrint, key: "P" },
  { to: "/history", label: "급식 이력", icon: History, key: "H" },
  { to: "/vet", label: "수의사 연동", icon: Stethoscope, key: "V" },
  { to: "/alerts", label: "알림", icon: Bell, key: "A" },
  { to: "/settings", label: "설정", icon: Settings, key: "S" },
];

const groupOf: Record<string, string> = {
  "/dashboard": "메인",
  "/monitoring": "메인",
  "/dogs": "관리",
  "/history": "관리",
  "/vet": "관리",
  "/alerts": "시스템",
  "/settings": "시스템",
};

export default function Sidebar() {
  const { user, signOut } = useAuth();

  let lastGroup = "";
  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-[220px] flex-col border-r border-sidebar-border bg-sidebar py-6">
      <div className="border-b border-sidebar-border px-6 pb-5 mb-3">
        <div className="text-[20px] font-black text-brand">PawFeeder</div>
        <div className="mt-0.5 text-[11px] font-normal text-ink-faint">
          Shelter Management System
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        {items.map((it) => {
          const group = groupOf[it.to];
          const showLabel = group !== lastGroup;
          lastGroup = group;
          return (
            <div key={it.to}>
              {showLabel && (
                <div className="px-3 pb-1.5 pt-3 text-[9px] font-bold uppercase tracking-[1.5px] text-brand-muted">
                  {group}
                </div>
              )}
              <NavLink
                to={it.to}
                className={({ isActive }) => clsx("nav-link", isActive && "active")}
              >
                <span className="nav-icon-box">
                  <it.icon size={14} />
                </span>
                <span>{it.label}</span>
              </NavLink>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] font-bold text-[#CDE3C0]">
              {user?.display_name ?? "관리자"}
            </div>
            <div className="text-[10px] text-brand-muted">
              {user?.role === "vet" ? "수의사" : "보호소 관리자"}
            </div>
          </div>
          <button
            onClick={() => signOut()}
            title="로그아웃"
            className="rounded-md p-1.5 text-ink-faint transition hover:bg-sidebar-hover hover:text-white"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
