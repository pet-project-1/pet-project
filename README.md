# pet-project

품종 맞춤형 자동 배급 시스템 (PawFeeder) — 종합설계 1, 2조

## 구성
- `web/` — React 18 + TypeScript + Vite (박상우 트랙)
- `web/supabase/` — PostgreSQL 마이그레이션 + RLS + RPC + Realtime
- `YOLOv8/` — ONNX 추론 모듈 (한웅 트랙)
- `DEPLOY.md` — Supabase Cloud + Vercel 배포 가이드

## 빠른 시작
```bash
cd web
pnpm install
cp .env.example .env   # Supabase URL/ANON_KEY 입력
pnpm dev
```
