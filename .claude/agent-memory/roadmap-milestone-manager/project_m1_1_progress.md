---
name: M1.1 progress log
description: TRAVIS M1.1 (모노레포 + 툴체인) 마일스톤 step별 완료 이력 및 예상 대비 실제 편차
type: project
---

# M1.1 Step 진행 이력

## Step 1 — pnpm 모노레포 루트 초기화
- 완료일: 2026-04-15
- 예상: 1.5~2시간
- 검증 통과 기준:
  1. `pnpm install` 성공 (pnpm-lock.yaml 생성, prettier 3.8.3 / prettier-plugin-tailwindcss 0.6.14 / typescript 5.9.3)
  2. `pnpm lint` exit 0 ("No projects matched the filters" — apps/packages 비어있어 정상)
  3. `pnpm type-check` exit 0 (동일)
- 계획 대비 편차:
  - pnpm 10.29.0 → **10.33.0**으로 교체 (npm registry에 10.29.0 없음, 현행 최신 stable 사용)
  - `package.json`의 `packageManager` 필드도 10.33.0으로 동기화
- **Why:** 다음 마일스톤 분해 시 "외부 버전 고정은 registry 존재 여부 먼저 검증" 패턴 재발 방지.
- **How to apply:** 이후 step에서도 라이브러리 버전 pin할 때 실제 registry에 있는지 확인 후 권고.

## Step 2 — `packages/shared` + `packages/data-service` 스켈레톤
- 완료일: 2026-04-15
- 예상: 1시간
- 검증 통과 기준:
  1. `pnpm -F @travis/shared type-check` exit 0
  2. `pnpm -F @travis/data-service type-check` exit 0
  3. `pnpm -r type-check` 양 패키지 모두 green
  4. `packages/data-service/src/IDataService.ts` 존재 (메서드 0개 빈 인터페이스 — Architecture.md §10 deferred decision 준수)
- 계획 대비 편차:
  - 예상 범위 내 완료. code-reviewer 지적(C1/W1/W2/W3/S1) 모두 반영하여 🟡→🟢 등가 상태.
  - 상세 record: `docs/task-record/M1.1-step2-packages-skeleton.md`
- **Why:** Architecture §10 "인터페이스 메서드 시그니처는 실제 web/worker에서 첫 사용 시점에 결정" 원칙을 Step 2 단계에서 실제로 집행한 사례 — deferred decision 원칙이 "미루기"가 아니라 "근거 있는 지연"임을 후속 step 판단에 활용.
- **How to apply:** 이후 step에서 사용자가 "미리 메서드 다 정의하자" 같은 scope 확장 제안 시, 이 사례를 근거로 "첫 consumer에서 필요할 때 추가" 권고.

## Step 3 — `apps/web` Next.js 16 + Tailwind v4 + shadcn + Zustand 뼈대
- 완료일: 2026-04-16
- 예상: 3~4시간 / 실: ~3시간 (4-substep + code-reviewer 2회 + Playwright 시각 + Warning 2건 정리)
- 핵심 검증: localhost:3000 다크 zinc 렌더 + workspace `IDataService` 값+타입 동시 import + production build 3.6s + `.gitignore` `.env.local` 차단
- 함정 2건 (다음 step 권고에 반영):
  - **ESLint flat config**: `eslint-config-next` v16은 native flat 배열 default-export. `FlatCompat`는 "circular structure" 에러 → 공식 subpath spread 패턴(`...nextCoreWebVitals`) 필수.
  - **Prettier override**: 자체 `.prettierrc`가 있으면 루트를 상속하지 않고 완전 override. 루트 옵션 명시 복사 필수.
- **Why:** "최신 라이브러리는 일단 실제 export부터 까본다" + "monorepo prettier는 가장 가까운 config 1개만 선택" 두 교훈을 Step 4부터 선제 반영.
- **How to apply:** 이후 step에서 새 패키지 도입 시 (a) 공식 docs export 형태 우선 확인, (b) 자체 `.prettierrc` 둘 때 루트 옵션 명시 복사 권고.

## Step 4 — `apps/worker` Node.js TS 뼈대
- 완료일: 2026-04-16
- 예상: 1시간 / 실: ~1시간 (3-substep + code-reviewer 1회 + W2 선제 적용)
- 검증 통과 기준 (9 gate + Prettier):
  1. `pnpm -F @travis/worker dev` → "hello from travis-worker" + exit 0 (env 부재 graceful)
  2. `pnpm -r type-check` 4 workspaces green
  3. 6 grep gate (NEXT_PUBLIC_*·복붙 사고·jsx·plugins·supabase 참조·workspace lint) 모두 통과 또는 주석 안의 설명만
  4. `pnpm -r lint` + `prettier --check apps/worker` clean
- 계획 대비 편차:
  - 예상 정확. 3-substep(4a 진입점 / 4b 품질 게이트 / 4c supabase 연결점) 분해 효과적.
  - **W2 선제 적용**: code-reviewer가 "Step 5에서 `await` 추가 시 unhandled rejection 가능" 지적 → `main()`을 `async + .catch()`로 즉시 변경. ROADMAP 검증 동일 통과 + Step 5 부담 ↓.
  - 상세 record: `docs/task-record/M1.1-step4-apps-worker.md`
- **Why:** Step 3 함정 2건(ESLint export 형태 / Prettier override)을 선제 반영한 덕분에 0 파동 통과. context7 공식 docs를 사전 검증하는 패턴이 시간 절약 효과 입증.
- **How to apply:** Step 5 정의 시 다음 3가지를 명시 항목으로 권고:
  - (a) `.env` 로드 방식 = `tsx --env-file=.env src/index.ts` (의존성 0개)
  - (b) NodeNext 상대 import = `import { supabase } from "./supabase.js"` (.ts 아님)
  - (c) Step 4에서 W2 선반영 완료 → main 시그니처 변경 불필요, import 1줄 + ping 1줄로 끝.

## Step 5 — Supabase 기존 프로젝트 연결 + env 투입
- 완료일: 2026-04-18
- 예상: 1시간 / 실: ~35분 (단일 step + code-reviewer 1회 + W1·W2 주석 정리)
- 검증 통과 기준 (6 gate):
  1. env 파일 git 미포함 (G1)
  2. web client ready 로그 (G2, 코드 로직 보장)
  3. worker connected 로그 (G3, auth.admin.listUsers 성공)
  4. lint/type-check green (G4)
  5. service_role 웹 미노출 (G5)
  6. prettier clean (G6)
- 계획 대비 편차:
  - **ping 방식 변경**: auth.getUser() → auth.admin.listUsers(). getUser()는 service_role 단독으로 "Auth session missing" 반환 — 연결 실패가 아니라 세션 부재이지만 로그에 혼동. admin.listUsers()로 변경하여 깨끗하게 해결.
  - **Supabase MCP 활용**: get_project_url + get_publishable_keys로 URL·anon key 자동 획득. service_role key만 사용자 대시보드 입력.
  - **사용자 키 혼동 해결**: 사용자가 새 형식 키(sb_publishable_/sb_secret_)를 보내서, legacy JWT 키와의 차이를 설명하고 legacy service_role key를 안내.
  - 상세 record: `docs/task-record/M1.1-step5-supabase-env.md`
- **Why:** Supabase MCP + context7 공식 문서 사전 조사가 작업 시간을 절반으로 줄임. 반면 auth.getUser() ping 실패는 "공식 문서만으로는 안 보이는 실전 차이"의 사례 — admin API 문서를 별도로 확인했어야 했음.
- **How to apply:** 이후 step에서 Supabase Auth API 사용 시, service_role은 반드시 admin.* 네임스페이스 사용 권고. 일반 auth.* 메서드는 사용자 세션 전제.
