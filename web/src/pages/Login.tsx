// US-01 관리자 로그인
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "@/services/AuthService";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, loading, error } = useAuth();
  const [email, setEmail] = useState("admin@pawfeeder.com");
  const [password, setPassword] = useState("");

  if (user) {
    const dest = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? "/dashboard";
    return <Navigate to={dest} replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await signIn(email, password);
    if (ok) navigate("/dashboard", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-[28px] font-black text-brand">PawFeeder</div>
          <div className="mt-1 text-[12px] text-ink-faint">
            Shelter Management System
          </div>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl bg-white p-7 shadow-xl">
          <h2 className="text-[18px] font-bold text-ink">관리자 로그인</h2>
          <p className="mt-1 text-[12px] text-ink-mute">
            인가된 사용자만 급식 관리 기능을 사용할 수 있습니다.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-ink-body">
                이메일
              </label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@pawfeeder.com"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-ink-body">
                비밀번호
              </label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-accent-danger/30 bg-accent-danger/5 px-3 py-2 text-[12px] font-semibold text-accent-danger">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary mt-6 w-full" disabled={loading}>
            <LogIn size={16} />
            {loading ? "로그인 중…" : "로그인"}
          </button>

          <div className="mt-5 flex items-start gap-2 rounded-lg bg-canvas p-3 text-[11px] text-ink-mute">
            <ShieldCheck size={14} className="mt-[1px] shrink-0 text-brand-dark" />
            <div>
              관리자: <b>admin@pawfeeder.com</b> / <b>PawFeeder2026!</b>
              <br />
              수의사: <b>vet@pawfeeder.com</b> / <b>PawFeeder2026!</b>
            </div>
          </div>
        </form>

        <div className="mt-4 text-center text-[11px] text-ink-faint">
          품종 맞춤형 자동 배급 시스템 · 2조
        </div>
      </div>
    </div>
  );
}
