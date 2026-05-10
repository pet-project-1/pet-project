# PawFeeder Web (박상우 트랙 · Sprint 1)

품종 맞춤형 자동 배급 시스템의 웹 대시보드. **시스템구조설계 §4** 사양 준수:
- React 18 + TypeScript + Vite
- TailwindCSS 3 + lucide-react
- React Router v6, Zustand, TanStack Query
- Recharts, date-fns
- (Optional) Supabase v2

## Sprint 1 매핑

| US | 화면 / 모듈 |
|---|---|
| US-01 관리자 로그인 | `pages/Login.tsx`, `services/AuthService.ts`, `components/ProtectedRoute.tsx` |
| US-02 DB 스키마 | `types/index.ts`, Supabase 마이그레이션은 별도 (다음 단계) |
| US-03 개체 등록 | `components/DogFormDialog.tsx` (mode=create) |
| US-04 개체 조회 | `pages/Dogs.tsx` (검색/품종 필터) |
| US-05 개체 수정 | `components/DogFormDialog.tsx` (mode=edit) |
| US-06 개체 삭제 | `components/ConfirmDialog.tsx` + 급식 이력 검증 |
| US-15 급식 현황 대시보드 | `pages/Dashboard.tsx` |

## 실행

```bash
pnpm install        # or npm install
pnpm dev            # http://localhost:5173
```

데모 계정: `admin@pawfeeder.test` / `shelter1234`
수의사: `vet@pawfeeder.test` / `vet1234`

## Supabase 연결 (Sprint 1 후반)

`.env`에 다음 추가 후 재시작하면 자동으로 실 백엔드 사용:

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

연결되지 않은 동안에는 in-memory 목 데이터로 동작합니다.
