# 배포 가이드 (Supabase Cloud + Vercel)

## 0. 사전 준비
- GitHub 계정 + 빈 리포지토리 (예: `pawfeeder-web`)
- Supabase 계정: https://supabase.com (GitHub 로그인 권장)
- Vercel 계정: https://vercel.com (GitHub 로그인 권장)

---

## 1️⃣ Supabase 클라우드 프로젝트 만들기

### 1-1. 프로젝트 생성
1. https://supabase.com/dashboard → "New Project"
2. 입력값:
   - **Name**: `pawfeeder`
   - **Database Password**: 강력한 비번 (어디 적어둘 것)
   - **Region**: `Northeast Asia (Seoul)` 권장
   - **Plan**: Free
3. 생성에 1~2분 소요

### 1-2. 프로젝트 정보 메모 (이후 Vercel에 입력)
프로젝트 페이지 → **Settings → API** 에서:
- `Project URL`: `https://xxxxxxxxxxxx.supabase.co`
- `anon public` key: `eyJ...` (긴 문자열)

### 1-3. 마이그레이션 푸시
로컬 터미널에서:
```bash
cd pet-project/web

# 한 번만: Supabase CLI 로그인
supabase login

# 프로젝트 연결 (project-ref는 URL의 xxxxxxxxxxxx 부분)
supabase link --project-ref <YOUR_PROJECT_REF>
# DB Password 묻는 프롬프트에 1-1에서 만든 비번 입력

# 마이그레이션 6개 적용
supabase db push

# 시드 데이터 (옵션, 데모용)
supabase db reset --linked  # ⚠️ 클라우드 DB를 초기화하므로 주의
# 또는 psql로 seed.sql만 적용:
supabase db remote commit  # 또는 직접 psql:
psql "postgresql://postgres:[PW]@db.<REF>.supabase.co:5432/postgres" -f supabase/seed.sql
```

### 1-4. 데모 사용자 생성
Supabase Dashboard → **Authentication → Users → Add user → Create new user**
- Email: `admin@pawfeeder.test`, Password: `shelter1234`, Auto-confirm: ✅
- 생성 후 사용자 클릭 → **User Metadata**에 다음 JSON 붙여넣기:
  ```json
  { "role": "admin", "display_name": "박관리자" }
  ```
- 한 번 더 반복: `vet@pawfeeder.test` / `vet1234` / role=`vet`

트리거가 자동으로 `public.users`에 행을 만듭니다.

### 1-5. Auth 콜백 URL 등록 (Vercel 배포 후)
**Authentication → URL Configuration**:
- Site URL: `https://your-project.vercel.app`
- Redirect URLs: `https://your-project.vercel.app/**`

---

## 2️⃣ GitHub 리포지토리 푸시

```bash
cd pet-project        # ← web/ 의 부모

git init
git add .
git commit -m "feat: initial Sprint 1 web + supabase migrations"

git branch -M main
git remote add origin https://github.com/<YOU>/pawfeeder-web.git
git push -u origin main
```

⚠️ `.gitignore`가 `.env`를 제외하므로 anon key가 노출되지 않습니다. 만에 하나 실수했다면 키를 즉시 rotate.

---

## 3️⃣ Vercel 배포

### 3-1. 프로젝트 import
1. https://vercel.com/new → GitHub 리포 선택
2. **Configure Project**:
   - **Root Directory**: `web` ⚠️ 중요 (Edit → web 선택)
   - Framework Preset: Vite (자동 감지)
   - Build Command: `pnpm build` (자동)
   - Output Directory: `dist` (자동)

### 3-2. 환경 변수 등록
같은 화면 **Environment Variables**:
| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://xxxxxxxxxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | (1-2의 anon key) |

### 3-3. Deploy → 배포 URL 확인 → 1-5의 Site URL 갱신

---

## 4️⃣ 동작 확인 체크리스트

- [ ] `https://your-project.vercel.app` 접속 → 로그인 화면 표시
- [ ] `admin@pawfeeder.test` / `shelter1234` 로그인 성공
- [ ] 대시보드에 7마리(또는 실제 시드 데이터) 표시
- [ ] Supabase Studio에서 `feeding_records` 1행 INSERT → **새로고침 없이** 대시보드 갱신
- [ ] 개체 등록/수정/삭제 동작
- [ ] 브라우저 DevTools Network 탭에서 `wss://xxxxxxxxxxxx.supabase.co/realtime/...` 연결 확인

---

## 🔐 보안 체크 (배포 직전)

1. `.env` 파일이 git에 안 올라갔는지 확인 (`git ls-files | grep .env` 결과 비어있어야)
2. anon key는 클라이언트 노출 OK (RLS로 보호됨), service_role key는 절대 클라이언트 코드에 넣지 말 것
3. Auth → Email → "Confirm email" 활성화 권장 (운영)
4. RLS 정책 적용 확인: 각 테이블에서 `Enable RLS` 표시 ✅

---

## 🆘 자주 발생하는 문제

| 증상 | 원인 / 해결 |
|---|---|
| 빌드 실패: `Cannot find package` | `Root Directory`를 `web`으로 설정 안 함 |
| 라우트 404 (예: `/dashboard` 새로고침 시) | `vercel.json` rewrites 누락 — 이미 추가됨 |
| 로그인 후 무한 새로고침 | Auth Site URL 미설정 (1-5 단계) |
| Realtime 안 뜸 | publication에 테이블 추가 안 됨. 클라우드는 기본 활성. 마이그레이션 4번 푸시 확인 |
| `infinite recursion in policy` | 마이그레이션 5, 6번 누락. `supabase db push`로 동기화 |
