# TRAVIS — 개발 로드맵

> 본 문서는 TRAVIS의 개발 순서를 **의존성 기반**으로 나열합니다.
> 각 단계는 "완료 조건"이 명확하므로, 해당 조건만 충족하면 다음 단계로 넘어갈 수 있습니다.
> 구체적인 테이블 스키마·컬럼·컴포넌트 형태·데이터 소스는 **개발 중 점진적으로 결정**하는 "deferred decision" 원칙을 따릅니다 (ref: `docs/DB_SCHEMA.md`, `docs/ARCHITECTURE.md §10`).
>
> 제품 요구사항은 `docs/PRD.md`, 시스템 설계는 `docs/ARCHITECTURE.md`, DB 원칙은 `docs/DB_SCHEMA.md`를 참조하세요.

---

## 이 문서의 읽기 규칙

- **M1은 하위 단계로 엄격히 쪼개짐** — 각 하위 단계는 앞 단계의 완료를 전제로 함
- **M2 이후는 "확장 루프(Extension Loop)"로 정의** — 고정된 마일스톤이 아니라 반복 패턴으로 표현
- **"산출물"** = 그 단계가 끝났을 때 저장소에 존재해야 하는 것
- **"완료 기준"** = 이게 되면 다음 단계로 넘어가도 됨 (checkbox로 체크 가능)
- 모든 단계는 `docs/PRD.md`와 `docs/ARCHITECTURE.md`의 불변 원칙(3개 경로, 4개 레지스트리, `dataService` 추상화, AI 외부 API 직접 호출 금지, 배치 API 의무)을 **절대 위반 금지**

---

## 비전공자를 위한 사전 개념 정리

이 로드맵을 읽기 전에 알아야 할 TRAVIS의 4가지 핵심 개념입니다. 각 단계 설명은 이 개념 위에서 이루어집니다.

### 1) 3개의 독립 건물

- **Vercel** — 프론트엔드 + AI 두뇌 (사용자가 접속하는 웹 화면 + AI 명령 처리)
- **Hetzner VPS** — 데이터 수집 공장 (거래소에서 데이터 긁어오는 서버)
- **Supabase** — 데이터 창고 + 로그인 시스템 (모든 저장된 데이터의 본거지)

세 건물은 독립적으로 돌아가며 Supabase를 허브로 연결됩니다.

### 2) 3개의 데이터 도로

- **경로 A (초고속도로)**: 실시간 가격/체결 데이터. 거래소 → Hetzner → 프론트 **직행**. DB를 절대 거치지 않음.
- **경로 B (일반도로)**: 뉴스·시총·펀딩레이트 등. Hetzner가 주기적으로 긁어서 Supabase 창고에 저장 → 프론트가 창고를 구독.
- **경로 C (AI 주문)**: 사용자 자연어 입력 → AI가 Supabase 창고 조회 → "이런 카드를 띄워라" JSON 지시서 → 프론트가 카드 생성 후 경로 A/B로 실시간 연결.

**철칙**: AI는 Supabase(+가끔 Tavily)만 본다. 거래소 API를 AI가 직접 호출하는 건 절대 금지.

### 3) 4개의 메뉴판 (레지스트리)

- **거래소 어댑터 레지스트리**
- **데이터 소스 레지스트리**
- **컴포넌트 레지스트리**
- **인터랙션 레지스트리**

새 항목을 메뉴판에 "등록"만 하면 AI가 자동으로 그걸 주문할 수 있게 됩니다.
**오케스트레이터(주방) 코드를 건드리는 것은 절대 금지**. 이게 TRAVIS 확장성의 전부입니다.

### 4) 사전 계산 + 갱신 모드

- **사전 계산**: Hetzner 공장이 원재료(가격, 거래량)를 긁어올 때, **실시간 스크리닝에 필요한 핵심 "반조리 식품"**(변화율, 핵심 기술 지표 현재값 등)도 미리 만들어서 `_now` 창고에 함께 저장합니다. 별도 선반이 아니라 **같은 칸에** 넣습니다. 단, "자주 쓰는 것 전부"가 아니라 **"실시간 필터링에 꼭 필요한 것만"** 미리 만듭니다. 나머지(시계열 추이 분석, 과거 차트 데이터 등)는 `_history` 창고에서 필요할 때 꺼내 씁니다. Hetzner는 **메모리에 최근 데이터를 유지(롤링 윈도우)**하여 매번 창고를 뒤지지 않고도 지표를 빠르게 계산합니다.
- **갱신 모드**: AI가 카드를 만들 때 "이 카드는 숫자만 바꿔라(`value`)" 또는 "이 카드는 조건에 맞는 항목이 들어오고 나가게 해라(`content`)"를 함께 지시합니다. "BTC 가격"은 value, "OI 급증 코인 목록"은 content. `_history` 데이터를 사용하는 카드(추이 차트 등)는 실시간 push 대신 **주기적으로 새로 조회(pull)**하는 방식으로 갱신됩니다.

### 5) `dataService` 추상화 레이어

AI와 프론트는 Supabase를 **직접** 부르지 않고, 중간에 `dataService`라는 "도서관 사서"를 경유합니다.
나중에 Supabase를 TimescaleDB/ClickHouse로 바꿔도 사서 한 명만 교체하면 됩니다.
**M1 첫날부터** 반드시 존재해야 하는 레이어입니다.

---

## M1 — 파운데이션 + 엔드투엔드 핵심 루프

**M1의 존재 이유**: "자연어 입력 → AI 판단 → 실시간 UI 카드 렌더" 이 전체 흐름이 **Binance 1개 거래소·컴포넌트 3종·최소 데이터 종류**로 증명되는 것.
이 루프가 뚫리면 M2부터는 "메뉴판(레지스트리)에 항목 추가" 반복 작업으로 모든 기능이 확장됩니다.

---

### M1.1 — 모노레포 스캐폴딩 + `dataService` 기초

**목표**
`npm run dev`로 빈 Next.js 앱이 뜨고, Supabase에 연결되며, Hetzner 워커 패키지 뼈대가 존재하고, `dataService` 추상화 레이어의 인터페이스가 이미 정의되어 있음.

**디렉터리 구조 (확정)**

```
travis/
├── apps/
│   ├── web/              # Next.js 16 프론트엔드 + API Routes (AI 오케스트레이터)
│   └── worker/           # Hetzner 데이터 수집 워커 + WS 릴레이 서버
├── packages/
│   ├── shared/           # 공통 타입, 4개 레지스트리 인터페이스, Zod 스키마
│   └── dataService/      # dataService 추상화 레이어 (AI+프론트 모두 경유)
├── supabase/
│   └── migrations/       # Supabase 마이그레이션 파일
├── docs/                 # PRD, ARCHITECTURE, DB_SCHEMA, ROADMAP
├── package.json          # pnpm workspaces 루트
└── pnpm-workspace.yaml
```

**산출물**

- pnpm workspaces 루트 `package.json` + `pnpm-workspace.yaml`
- `apps/web`: Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/UI 초기 셋업 + Zustand 빈 store
- `apps/worker`: Node.js + TypeScript 프로젝트 뼈대 (아직 로컬에서만 실행)
- `packages/shared`: 4개 레지스트리 인터페이스 파일 (타입 선언만, 내부 항목 0개)
- `packages/data-service`: 추상화 레이어 인터페이스 (`IDataService`) + Supabase 구현 (`SupabaseDataService`) 스켈레톤
- `supabase/migrations/` 디렉터리 생성 (아직 실제 테이블 없음)
- Supabase 프로젝트 생성 + `apps/web`과 `apps/worker`에서 연결 확인
- Vercel 연동 (GitHub push → 자동 배포)
- ESLint + Prettier + `type-check` 스크립트 (`pnpm lint`, `pnpm type-check`)
- `.env.example` — Supabase URL/키, Claude API 키 자리 (실제 키는 `.env.local`, gitignore)

**완료 기준**

- [x] 루트에서 `pnpm install` 성공
- [x] `pnpm -F web dev` → `localhost:3000`에 빈 Next.js 페이지 표시
- [x] `pnpm -F worker dev` → 워커가 로컬에서 "hello" 출력 후 정상 종료
- [x] `pnpm lint` + `pnpm type-check` 모두 통과
- [x] `IDataService` 인터페이스 파일 존재, `apps/web`에서 import 가능
- [x] `main` 브랜치에 push 시 Vercel 자동 배포 성공 (`https://travis-web.vercel.app`)

**의존성**: 없음 (첫 단계)

#### Steps (2026-04-15 분해)

- [x] **Step 1 — pnpm 모노레포 루트 초기화** (예상 1.5~2시간)
  - 산출물: ➕ 루트 `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc`, `.editorconfig`, `.env.example`, ✏️ `.gitignore`, ➕ 빈 `apps/`·`packages/`·`supabase/migrations/` (.gitkeep)
  - 검증: `pnpm install` 성공 + `pnpm lint`·`pnpm type-check` 가 "대상 없음"으로 exit 0
  - 순서 근거: 모노레포 땅이 없으면 이하 모든 step이 불가능.

- [x] **Step 2 — `packages/shared` + `packages/data-service` 스켈레톤** (예상 1시간)
  - 산출물: ➕ `packages/shared/{package.json,tsconfig.json,src/index.ts}`, ➕ `packages/data-service/{package.json,tsconfig.json,src/IDataService.ts,src/SupabaseDataService.ts,src/index.ts}`
  - 검증: 두 패키지 `type-check` green. `IDataService` 파일 존재.
  - 순서 근거: web/worker가 workspace deps로 집기 전에 패키지가 존재해야 링크 가능. **메서드 시그니처는 deferred — 메서드 0개 인터페이스만.**

- [x] **Step 3 — `apps/web` Next.js 16 + Tailwind v4 + shadcn + Zustand 뼈대** (예상 3~4시간 / 실 ~3시간, 4-substep 분해)
  - 산출물: ➕ `apps/web/{package.json,next.config.ts,tsconfig.json,eslint.config.mjs,postcss.config.mjs,.prettierrc,components.json,app/{layout.tsx,page.tsx,globals.css},lib/{utils.ts,supabase.ts,data.ts,store.ts}}`, ✏️ `.gitignore` (Playwright artifact 디렉토리 차단)
  - 검증: `pnpm -F web dev` → localhost:3000 렌더 + `pnpm -r type-check`·`lint` green + `IDataService` 값+타입 동시 import resolve + production build 3.6s + Playwright 시각 검증 (다크 zinc 배경 발현).
  - 순서 근거: 프론트 빌드 가동 + workspace 내부 패키지 import 실동작 최초 검증 지점.
  - **Substep 분해 (전부 완료):**
    - [x] **3a** — Next.js 16 빈 페이지 렌더 (package.json·tsconfig·next.config·eslint.config·app/{layout,page,globals.css})
    - [x] **3b** — Tailwind v4 + shadcn 메타 (postcss.config·.prettierrc·components.json·lib/utils.ts·globals.css zinc 토큰 + page.tsx Tailwind 유틸리티)
    - [x] **3c** — `lib/` 배선 (supabase.ts graceful env, data.ts 값+타입 동시 import, store.ts Zustand `isCanvasReady`)
    - [x] **3d** — 통합 검증 (workspace type-check + production build + git status + Playwright 시각 + Warning 2건 정리)

- [x] **Step 4 — `apps/worker` Node.js TS 뼈대** (예상 1시간 / 실 ~1시간, 3-substep + code-reviewer 1회 + W2 선제 적용)
  - 산출물: ➕ `apps/worker/{package.json,tsconfig.json,eslint.config.mjs,.prettierrc,src/index.ts,src/supabase.ts}` (총 6개; ROADMAP 산출물 4개 + 품질 게이트 2개)
  - 검증: `pnpm -F @travis/worker dev` → "hello from travis-worker" + exit 0 / `pnpm -r {type-check,lint}` green / `prettier --check` clean / 6종 grep gate(NEXT_PUBLIC_*·복붙 사고·jsx·plugins·supabase 참조·workspace lint) 모두 0건 또는 주석 안의 설명 텍스트만.
  - 순서 근거: Step 3 TS/pnpm 패턴 미러링이지만 런타임(Node only)·권한(service_role)·수명(1회 종료) 3가지 차이를 substep으로 분해.
  - **Substep 분해 (전부 완료):**
    - [x] **4a** — `package.json` + `tsconfig.json`(NodeNext) + `src/index.ts`(async + catch graceful) + `pnpm install`
    - [x] **4b** — `eslint.config.mjs`(typescript-eslint v8 native flat) + `.prettierrc`(루트 10옵션 복사, Tailwind plugin 제외)
    - [x] **4c** — `src/supabase.ts`(graceful null factory; index.ts에서 import 안 함 — Step 5의 연결점)

- [x] **Step 5 — Supabase 기존 프로젝트 연결 + env 투입** (예상 1시간 / 실 ~35분, 단일 step + code-reviewer 1회)
  - 산출물: ➕ `apps/web/.env.local`(gitignored), ➕ `apps/worker/.env`(gitignored), ✏️ `apps/worker/package.json`(--env-file), ✏️ `apps/worker/src/supabase.ts`(service_role auth options), ✏️ `apps/worker/src/index.ts`(admin.listUsers ping), ✏️ `apps/web/lib/supabase.ts`(성공 로그)
  - 검증: env 파일 git 미포함(G1) + worker `[supabase] worker connected to ...`(G3) + web `[supabase] web client ready`(G2, 코드 로직 보장) + lint/type-check green(G4) + service_role 웹 미노출(G5) + prettier clean(G6)
  - 순서 근거: web/worker 뼈대가 있어야 "연결 테스트 장소"가 존재. **테이블·RLS는 일절 건드리지 않음(deferred, M1.2/M1.3).** Supabase MCP로 URL+anon key 자동 획득, service_role key만 사용자 대시보드 입력.

- [x] **Step 6 — Vercel 가입 + GitHub 연결 + 자동 배포 검증** (예상 2시간 / 실 ~1시간)
  - 산출물: (대시보드) Vercel 프로젝트 생성 Root Directory `apps/web` + env 등록, ➕ 선택적 `vercel.json`
  - 검증: 첫 배포 Success + `*.vercel.app` 빈 페이지 렌더 + 2차 push 자동 빌드. **M1.1 완료 선언 조건.**
  - 순서 근거: 배포는 최후. 로컬 검증 후 push해야 빌드 실패 낭비 없음.

**총 예상**: 10~13시간 (2~3일)

**비전공자 설명**
"집을 짓기 전에 땅 고르기 + 기둥 세우기" 단계입니다. 아직 벽도 지붕도 없지만, 나중에 "여기에 방을 추가해" 했을 때 기반이 있어야 합니다.
`dataService`는 "나중에 부엌 설비를 가스에서 전기로 바꿀 때 배관 전체를 뜯지 않아도 되게 미리 어댑터를 끼워두는" 작업입니다. 이걸 지금 안 하면 나중에 3배 고생합니다.

---

### M1.2 — 4개 레지스트리 뼈대

**목표**
거래소/데이터소스/컴포넌트/인터랙션 레지스트리의 "껍질"(인터페이스)만 정의.
등록 항목은 dummy 1개씩이어도 OK. AI 시스템 프롬프트에 레지스트리 내용을 자동 주입하는 로직이 존재.

**산출물**

- `packages/shared/registries/` 아래 4개 파일:
  - `exchangeRegistry.ts` — 거래소 어댑터 공통 인터페이스 (REST + WS, 마켓 타입 배열 `spot`/`futures_usdm`/`futures_coinm`/`options`/`alpha`) + 등록 함수
  - `datasourceRegistry.ts` — 데이터 소스 메타 스키마 (schema, refresh interval tier, query capabilities, **queryable fields — 필터 가능 필드명·데이터 타입·지원 연산자 선언**) + 등록 함수
  - `componentRegistry.ts` — 컴포넌트 메타 스키마 (필요한 데이터 shape, 지원 사이즈, 지원 인터랙션) + 등록 함수
  - `interactionRegistry.ts` — 인터랙션 타입 스키마 (spawn, drill-down 등) + 등록 함수
- 각 레지스트리의 Zod 스키마 (AI 시스템 프롬프트 주입용 직렬화 함수 포함)
- `packages/shared/registries/promptInjection.ts` — 4개 레지스트리 → AI 시스템 프롬프트 텍스트로 자동 변환
- `apps/worker` 어댑터 패턴용 공통 인터페이스: `IExchangeAdapter`, `IWsRelay`, `IPoller`

**완료 기준**

- [x] 4개 레지스트리 각각에 dummy 항목 1개 등록 → `promptInjection()` 호출 시 AI가 읽기 가능한 텍스트 출력
- [x] Zod 검증이 dummy 항목에 통과
- [x] 단위 테스트: 레지스트리에 새 항목 추가 → `promptInjection()` 출력에 자동 반영 확인
- [x] 4개 레지스트리 인터페이스가 모두 `packages/shared`에 모여 있어 `apps/web`과 `apps/worker` 양쪽에서 import 가능

**의존성**: M1.1 완료

#### Steps (2026-04-18 분해)

- [x] **Step 1 — Zod 의존성 설치 + shared 패키지 tsconfig 강화** (예상: 30분 / 실: ~15분)
  - 산출물: ✏️ `packages/shared/package.json` (zod 추가), ✏️ `packages/shared/tsconfig.json` (lib → `["ES2022"]`로 제한, DOM 제거), ✏️ `packages/shared/src/index.ts` (SHARED_PLACEHOLDER 삭제 + registries 배럴 export 준비)
  - 검증: `pnpm install` 성공 + `pnpm -F @travis/shared type-check` green + `window`/`document` 참조 시 TS 에러 발생 확인 (DOM 제거 증명) + zod가 node_modules에 존재
  - 스코프 경계: zod 이외의 라이브러리 추가 금지. vitest 등 테스트 프레임워크는 Step 5에서 설치.

- [x] **Step 2 — 4개 레지스트리 인터페이스 + Zod 스키마 + 등록 함수** (예상: 2~3시간 / 실: ~40분)
  - 산출물: ➕ `packages/shared/src/registries/exchangeRegistry.ts`, ➕ `datasourceRegistry.ts`, ➕ `componentRegistry.ts`, ➕ `interactionRegistry.ts`, ➕ `packages/shared/src/registries/index.ts` (배럴), ✏️ `packages/shared/src/index.ts` (registries re-export)
  - 검증: `pnpm -F @travis/shared type-check` green + 각 파일에 (1) TS 인터페이스, (2) Zod 스키마, (3) `register()` 함수, (4) `getAll()` 함수가 존재 + `apps/web`과 `apps/worker`에서 import 경로 resolve 확인 (`pnpm -r type-check` green)
  - 스코프 경계: dummy 항목은 Step 3에서. 여기서는 "빈 메뉴판 틀"만. queryableFields 구조는 포함하되 구체 필드명은 deferred. updateMode는 `value | content` 타입으로 componentRegistry에 포함하되 `reactive`는 M2+.

- [x] **Step 3 — 4개 레지스트리에 dummy 항목 1개씩 등록** (예상: 1~1.5시간 / 실: ~15분)
  - 산출물: ✏️ 4개 레지스트리 파일 (각각 하단에 dummy entry register 호출 추가) 또는 ➕ `packages/shared/src/registries/dummies.ts` (한 곳에서 4개 dummy 등록)
  - 검증: `getAll()` 호출 시 각 레지스트리에서 1개 항목 반환 + Zod `.parse()` 통과 (dummy 항목이 스키마 준수) + `pnpm -r type-check` green
  - 스코프 경계: dummy는 Binance 기반 반실제 메타데이터 (`id: "binance"`, `marketTypes: ["spot", "futures_usdm"]` 등). API 호출 로직은 넣지 않음. datasource dummy에 실제 테이블명/컬럼명 확정하지 않음 (deferred). M1.3 진입 시 그대로 확장 가능한 형태.

- [x] **Step 4 — promptInjection.ts 구현** (예상: 1~1.5시간 / 실: ~15분)
  - 산출물: ➕ `packages/shared/src/registries/promptInjection.ts`, ✏️ `packages/shared/src/registries/index.ts` (promptInjection re-export)
  - 검증: `promptInjection()` 호출 시 4개 레지스트리의 dummy 항목이 모두 포함된 AI-readable 텍스트 문자열 반환 + 텍스트에 각 레지스트리 섹션이 구조적으로 구분됨 + `pnpm -r type-check` green
  - 스코프 경계: AI 프롬프트 "포맷"은 여기서 정하되, AI 호출 로직(M1.5)은 절대 포함하지 않음. 프롬프트 최적화 튜닝도 M1.5로 미룸.

- [x] **Step 5 — Worker 어댑터 패턴 인터페이스 (IExchangeAdapter, IWsRelay, IPoller)** (예상: 1시간 / 실: ~15분)
  - 산출물: ➕ `apps/worker/src/adapters/IExchangeAdapter.ts`, ➕ `apps/worker/src/adapters/IWsRelay.ts`, ➕ `apps/worker/src/adapters/IPoller.ts`, ➕ `apps/worker/src/adapters/index.ts` (배럴)
  - 검증: `pnpm -F @travis/worker type-check` green + 3개 인터페이스 파일 존재 + 메서드 시그니처가 M1.3 Binance 어댑터 구현 시 충분히 일반적임 (spot/futures/coinm 등 마켓 타입 무관하게 사용 가능)
  - 스코프 경계: 인터페이스 "선언"만. 구현체(BinanceAdapter 등)는 M1.3. 레지스트리와 별개 — worker 전용이므로 packages/shared에 넣지 않음.

- [x] **Step 6 — 단위 테스트 (vitest) + 최종 완료 기준 검증** (예상: 1.5~2시간 / 실: ~20분)
  - 산출물: ➕ `packages/shared/vitest.config.ts`, ✏️ `packages/shared/package.json` (vitest devDep + test 스크립트), ➕ `packages/shared/src/registries/__tests__/registries.test.ts`
  - 검증: (1) 레지스트리에 새 항목 추가 → `promptInjection()` 출력에 자동 반영되는 테스트 통과, (2) Zod 검증 실패 케이스 테스트 (잘못된 entry → throw), (3) `pnpm -F @travis/shared test` exit 0, (4) M1.2 완료 기준 4개 항목 전부 체크 가능
  - 스코프 경계: 테스트는 packages/shared 내부만. apps/web·apps/worker의 E2E 테스트는 해당 마일스톤에서. 테스트 커버리지 목표 설정은 지금 안 함.

**총 예상**: 7.5~10시간 (2일)

**비전공자 설명**
"AI가 볼 메뉴판 4장"을 미리 만드는 단계입니다. 메뉴판 자체는 비어있어도 되지만, 메뉴판의 **형식**은 고정해야 합니다. 나중에 "김치찌개"를 추가했을 때 AI가 자동으로 그걸 주문할 수 있게 됩니다.

---

### M1.3 — 데이터 파이프라인 최소 경로 (로컬 워커)

**목표**
Binance(spot + futures) 어댑터 1개 → **로컬 환경**에서 돌아가는 워커 → Supabase에 데이터 종류별로 분할된 테이블로 upsert → `dataService` 경유 조회 가능.
경로 A(WS 스트리밍)와 경로 B(폴링) 모두 최소 1개씩 동작.

> **Hetzner 배포는 M1 이후로 연기** (2026-04-19 결정). M1은 로컬 워커만으로 엔드투엔드 루프를 증명하는 것이 목적. 실서버 배포는 Launch Readiness §L.3 체크리스트로 이동.

**산출물**

- Binance 어댑터 구현 (spot + futures_usdm + futures_coinm, market type 배열로 선언, **배치 API 필수** — 단 Binance가 per-symbol만 제공하는 지표(OI·topLongShortRatio·takerLongShortRatio)는 예외로 per-symbol 순회 허용)
- 레지스트리 등록: Binance 어댑터, M1 단계에 필요한 최소 데이터소스 엔트리
- Supabase 마이그레이션 (테이블 이름/컬럼은 **구현 중 결정**, 카테고리만 고정):
  - `_now_*` 계열 — 워커 폴링 결과의 최신 스냅샷 (경로 B용)
  - `_history_*` 계열 — 시계열 축적 (M1에선 스키마만, 실제 backfill은 확장 루프에서)
  - `exchange_*` 계열 — Binance 심볼 메타데이터 (`exchange_symbols`가 유력 후보, 이름은 구현 중 확정)
  - `log_validation_failure` — AI 검증 실패 로그 (RLS는 M1.6에서 추가, 이 단계에선 임시로 service role 기반)
- 폴링 스케줄러 (tier 기반: high/mid/low 변동성, **구체 수치는 구현 중 결정**, **per-symbol 폴링 금지** — OI/LSR 등 API 자체 한계 케이스는 예외)
- WS 릴레이 서버: Binance spot + futures WS 연결 유지, 정규화된 포맷으로 프론트 릴레이 준비 (**로컬 실행**)
- **사전 계산 레이어**: 워커가 원시 데이터 수집 직후, upsert 직전에 **실시간 스크리닝에 필요한 핵심 지표**를 계산 (M1에선 최소 범위: 기본 변화율 등, 구체 지표는 구현 중 결정). 가공 값은 `_now_*` 테이블의 **같은 행에 컬럼으로** 원시 데이터와 함께 저장. 워커는 **메모리에 심볼별 롤링 윈도우**(최근 N개 데이터)를 유지하여, `_history` 테이블을 조회하지 않고 기술 지표를 효율적으로 계산. 기술적 지표(MA, RSI 등)의 추가는 확장 루프에서 점진적으로 — 사용자 로그 분석을 통해 스크리닝에 반복 사용되는 지표를 사전 계산 대상으로 승격.
- `dataService`에 M1 필수 메서드 구현 (예: 심볼 조회, 티커 조회, 최근 kline 조회, **필터 기반 조회**). 정확한 메서드 이름·시그니처는 구현 중 결정. `IDataService` 인터페이스 먼저 확장 후 `SupabaseDataService` 구현
- 워커 → Supabase 쓰기도 `dataService`의 쓰기 메서드 경유 (읽기만 추상화하면 반쪽짜리)

**완료 기준**

- [ ] 로컬 워커가 ≥30분 무중단 동작 + 수동 재시작 시 자동 복구 확인 (pm2 또는 직접 실행)
- [ ] Supabase Studio에서 Binance 데이터가 실제로 채워지는 것 시각 확인
- [ ] `dataService` 호출 → 최신 데이터 반환 확인 (단위 테스트 또는 임시 CLI)
- [ ] `apps/web` 테스트 스크립트에서 Supabase Realtime 구독 → `_now_*` 변경 이벤트 수신
- [ ] WS 릴레이 서버에 테스트 클라이언트 접속 → Binance 실시간 tick 수신
- [ ] 코드 리뷰: 배치 API만 사용됨 (per-symbol 루프 금지)
- [ ] Supabase Studio에서 `_now_*` 테이블에 원시 데이터 + 가공 값(변화율 등)이 같은 행에 함께 저장되는 것 확인
- [ ] grep 검증: `apps/web`에 `dataService`를 경유하지 않는 Supabase 직접 호출이 존재하지 않음

**의존성**: M1.1, M1.2 완료

#### Steps (2026-04-18 분해, 2026-04-18 확정)

  **확정된 설계 결정**: 테이블 11개 (now 3 + history 6 + symbols + log), 네이밍 `now_{도메인}_{세부}` / `history_{도메인}_{세부}`, 다중 거래소는 `exchange` + `market_type` 컬럼으로 구분, COIN-M 포함 (spot + futures_usdm + futures_coinm), kline 인터벌 4개 (1m, 5m, 1h, 1d), 사전 계산은 변화율만 (M1.3 최소), 청산은 history만 (이벤트성), 센티먼트 별도 테이블은 M2+.

- [x] **Step 1 — Supabase 11개 테이블 마이그레이션** (예상: 3~4시간 / 실: ~2시간)
  - 산출물: ➕ `supabase/migrations/*.sql` (11개 테이블), ✏️ `docs/DB_SCHEMA.md`
  - 테이블: `symbols`, `now_spot_ticker`, `now_futures_ticker`, `now_futures_indicator`, `history_spot_ticker`, `history_futures_ticker`, `history_futures_indicator`, `history_spot_kline`, `history_futures_kline`, `history_futures_liquidation`, `log_validation_failure`
  - 검증: Supabase Studio 11개 테이블 존재 + INSERT/SELECT 성공 + `pnpm -r type-check` green
  - 스코프 경계: RLS는 M1.6. 다운샘플링/파티셔닝은 확장 루프.
  - 사용자 결정: 각 테이블 구체 컬럼명 (Binance API 응답 보면서)

- [x] **Step 2 — dataService 읽기/쓰기 메서드 구현** (예상: 2~3시간 / 실: ~2시간, 2026-04-19)
  - 산출물: ✏️ `packages/data-service/src/IDataService.ts`(13 메서드 선언), ✏️ `SupabaseDataService.ts`(생성자 DI + 구현), ➕ `types/{database.generated,tables,Result,index}.ts`, ➕ `apps/worker/src/dataService.ts`(워커 싱글톤), ✏️ `apps/web/lib/{supabase,data}.ts`(제네릭+싱글톤), ➕ `apps/worker/src/scripts/smokeDataService.ts`(실 DB round-trip smoke + W2 hazard 회귀 케이스)
  - 검증: `pnpm -r type-check`·`lint` green + `pnpm -F @travis/worker smoke` PASSED (partial update 정상 + mixed-batch hazard 실증) + grep `\.from\(` apps/* = smoke 파일만 예외 허용 + code-reviewer W1~W5 전건 반영
  - 순서 근거: 테이블(Step 1)이 있어야 메서드 시그니처 정의 가능. 사용자 결정으로 (a) 테이블별 전용 메서드, (b) Supabase MCP 자동 생성 타입, (c) Step 3~5 쓰기 + 최소 읽기 2개만.
  - 사용자 follow-up(Step 3/M1.4에서 결정): (1) `volume_chg_5m` 의미 정의 문서화 위치, (2) Realtime 페이로드 분리 여부, (3) `funding_rate_chg_Xh` 사전계산 도입 여부.

- [x] **Step 3 — Binance REST 어댑터 구현 + 레지스트리 등록** (예상: 5~7시간 / 실: ~5시간, 2026-04-19)
  - 산출물: ➕ `apps/worker/src/adapters/_common.ts`, ➕ `apps/worker/src/adapters/binance/{client,types,normalize,BinanceSpotAdapter,BinanceUsdmAdapter,BinanceCoinmAdapter,index}.ts`, ➕ `apps/worker/src/scripts/smokeBinance.ts`, ✏️ `defaults.ts` (Binance 3마켓 + 8 datasource), ✏️ `IExchangeAdapter.ts` (한글 복구 + 느슨한 계약), ✏️ `apps/worker/package.json` (+smoke:binance)
  - 범위: spot + futures_usdm + futures_coinm 3개 마켓. 배치 API 우선, per-symbol은 Binance API 한계 케이스(OI·LSR·Taker)만 예외 허용.
  - 검증: type-check·lint green + 기존 shared tests 11건 pass + `pnpm -F @travis/worker smoke:binance` PASSED (4309 symbols + 4299 ticker + 765 indicator, BTCUSDT 4개 도메인 공존 DB 확인, COINM Taker 실 값 확인) + grep `.from(` adapter 내 0건 + code-reviewer C-1/C-3 + W-1/W-4/W-5/W-7 전건 반영
  - 사용자 follow-up (Step 4/5에서 결정): 폴링 주기 / per-symbol 대상 확장 / 스캘퍼 UX 체감 시점

- [x] **Step 4 — 폴링 스케줄러 + 사전 계산 레이어** (예상: 3~5시간 / 실: ~6시간, 2026-04-19)
  - 산출물: ➕ `apps/worker/src/compute/{RollingWindow,preCompute}.ts` + `__tests__/` (18 tests), ➕ `apps/worker/src/poller/TierPoller.ts` + `__tests__/` (6 tests), ➕ `apps/worker/src/poller/tasks/{tickerTask,premiumTask,perSymbolTask,index}.ts`, ✏️ `apps/worker/src/adapters/IPoller.ts`(PollTask에 `intervalMs` 추가 + PollStatus에 `lastError`/`nextRunAt` 추가), ✏️ `apps/worker/src/index.ts`(bootstrap + SIGINT/SIGTERM graceful shutdown), ➕ `apps/worker/src/scripts/smokeStep4.ts`, ✏️ `apps/worker/package.json`(vitest + `test`·`smoke:step4`)
  - 사전 계산 실 구현: `price_chg_5m/15m/1h/4h`, `volume_chg_5m/15m/1h`, `volume_ratio` (24h는 Binance ticker `price_change_pct`가 이미 제공), `oi_chg_5m/15m/1h/4h`. 롤링 윈도우 1분 샘플 × 1500개(25시간, ~150MB).
  - 확정 결정 (2026-04-19):
    - **Tier 차등 없음**: 모든 심볼 공평 취급 (사용자 철학). ticker 배치 3s, premium 배치 30s, perSymbol OI/LSR/Taker 직선 순회 (실측 1바퀴 331초 + intervalMs 10초 휴식 = 실질 주기 ~341초).
    - **volume_chg_5m 해석**: Step 4는 **해석 A 근사**(24h rolling 차분). Step 5 WS(`!miniTicker@arr` 또는 1m kline 스트림) 연결 후 **해석 B(5분 실거래량 비교)**로 자동 전환 — preCompute 입력 소스만 교체하면 컬럼명 유지.
    - **kline 폴링 전체 제외 → Step 5 WS로 이관**: per-symbol rate limit 한계로 전 심볼 5m/1h/1d 폴링 불가. `!kline@arr` 스트림이 효율적.
    - **IExchangeAdapter 재설계 보류** (YAGNI): M2 OKX 추가 시 실 API 패턴 기반 재설계.
  - 검증: `pnpm -F @travis/worker test` 24/24 PASSED + type-check·lint green + **90초 smoke PASSED** (tickerSymbols=4299, indicatorSymbols=638, heap peak=92MB, 3 task lastSuccess=true, 연속실패 0) + code-reviewer Critical 0/Warning 8 전부 반영 + crypto-trader advisory 완료 (Step 4 completion blocker 없음)
  - **사후 검증 (2026-04-20)**: 10분 + 3분 실구동 + `verify:step4` 로 정량 검증 중 **2건 수정**: (1) `updated_at` 자동 갱신 누락 → BEFORE UPDATE 트리거 3개 추가(마이그레이션 `20260420000001`), (2) `verifyStep4.ts` 의 PostgREST max-rows=1000 cap → server-side COUNT 쿼리로 재작성. 트리거 적용 후 전 심볼 30초 이내 갱신 100% 달성, mixed-batch 4도메인 공존 608/719(84.6%), 사전계산 82.8%. 자세한 내용은 `docs/task-record/M1.3-step4-polling-precompute.md` §사후 실측 검증.
  - **사후 검증 #2 (2026-04-20 1시간 smoke 후)**: 1시간 실구동 로그에서 **3건 품질 결함** 발견 → Track A/B 수정 적용, 이후 1시간 재smoke 후 SPOT 주기 2차 조정.
    - [A] SPOT `/api/v3/ticker/24hr` rate limit 200~260% 초과(한도 1,200/분) → `tickerTask` 를 `tickerSpotTask`(SPOT) + `tickerFuturesTask`(3s, USDM+COINM) 2개로 분리. SPOT 만 완화하여 선물 체감 영향 0. **1차 6초 → 2차 20초 → 3차 30초 조정** (2차 smoke에서도 180% 피크 + 429 관찰, per-call 실효 weight 248 → **432** 재역산, 공식 80의 5.4배. 3차 30초에서 공식 13% / 실측 72% 사용으로 안전).
    - [B] Postgres deadlock 4건 + 네트워크 일시 장애 4건 → ➕ `_upsertRetry.ts` (`retryOnTransient`, deadlock/fetch failed/502·503·504/ECONNRESET/Too Many Requests 패턴 재시도, 100ms→300ms backoff) + 동일 테이블 동시 upsert 제거(USDM→COINM 순차).
    - 신규: `apps/worker/src/poller/tasks/{_upsertRetry,tickerSpotTask,tickerFuturesTask}.ts` + `__tests__/_upsertRetry.test.ts` (13 tests). 삭제: `tickerTask.ts`. 수정: `index.ts`(barrel), `apps/worker/src/index.ts`, `premiumTask.ts`, `perSymbolTask.ts`, `scripts/smokeStep4.ts`.
    - 검증: type-check·lint green, **37 tests** (기존 24 + 신규 13) passed, 1차 90초 smoke task 4/4 lastSuccess=true · 연속실패 0, Supabase MCP 확인: fresh_60s 100%(Spot 3,562 / USDM 707 / COINM 30), all4_coexist 608/719(84.6% 유지), BTCUSDT USDM age=12초에 4도메인 공존 실증. 1시간 재smoke에서 SPOT rate limit 180~213% 잔존 관찰 → Binance 공식 weight(80) 재확인 후 실측 기반 20초 주기로 2차 조정. 자세한 내용은 `docs/task-record/M1.3-step4-polling-precompute.md` §사후 실측 검증 — 1시간 smoke 발견 #3.

- [x] **Step 5 — WS 릴레이 서버 (E1 scope, 전 심볼 공평 유지)** (예상: 3.5~5시간 / 실: ~4.5시간, 2026-04-20)
  - 산출물: ➕ `apps/worker/src/ws-relay/{BinanceWsRelay,BinanceKlineRelay,streamRouter,types,index}.ts` + `streams/{tickerWsHandler,markPriceWsHandler,forceOrderWsHandler,klineWsHandler}.ts` + `__tests__/{streamRouter,BinanceWsRelay}.test.ts`, ➕ `apps/worker/src/scripts/{smokeStep5,verifyStep5}.ts`, ✏️ `apps/worker/src/index.ts`(bootstrap WS 2 relay + poller 1), ✏️ `apps/worker/src/compute/preCompute.ts`(volume_chg_5m 해석 B), ✏️ `packages/data-service/src/SupabaseDataService.ts`(getSymbols LIMIT 10,000), ➖ `{tickerSpotTask,tickerFuturesTask,premiumTask}.ts` 삭제
  - 스트림: `!miniTicker@arr` (ticker), `!markPrice@arr@1s` (mark/funding), `!forceOrder@arr` (liquidation), `<symbol>@kline_1m` (volumeKlineWindow 전용, DB 저장 X)
  - E1 scope 확정: kline 5m/1h/1d history_*_kline 저장은 **이번 제외** (M1.4 실제 필요성 보이면 승격). 전 심볼 1m kline WS는 BinanceKlineRelay 가 chunk 단위로 분할.
  - **2026-04-20 hot-patch** (Step 5 후속 보강):
    - `BinanceKlineRelay` CHUNK_SIZE **1,000 → 250** — URL 길이 ~18KB 에서 Binance HTTP 414 (URI Too Long) 반환 실측 확인. 250 = URL ~4.5KB 로 8KB 한계 내 안전. SPOT 6 + USDM 3 + COINM 1 = **총 10 연결** (Binance "5분당 300 연결" 한도 대비 여유).
    - `SupabaseDataService.getSymbols` LIMIT 10,000 → **PAGE=1,000 pagination 루프 + `.order()` 정렬** — PostgREST `db-max-rows=1,000` 서버캡으로 `.limit(N>1000)` 이 무효. 이제 총 4,309 row symbols 테이블 전량 조회 가능.
    - COINM `getSymbols` 호출에 `status="TRADING"` 추가 — 2026-04-20 MCP 실측 결과 COINM 은 TRADING 30 + DELIVERING 8 구분됨. DELIVERING 은 WS push 없음 → 구독 대상 제외.
    - `withTimeout` 헬퍼 (`apps/worker/src/utils/withTimeout.ts`) + `loadAllSymbols` 가 `Promise.allSettled` + 60s timeout 으로 감싸기 — Supabase 간헐 장애 시 부팅 무한 hang 방지. 부분 실패 허용 (한 마켓 timeout 나도 다른 마켓 진행).
    - 실 수치 정정: **SPOT TRADING 1,408 / USDM TRADING 608 / COINM TRADING 30** (이전 기록 "SPOT 3,562" 은 BREAK 2,151 포함한 symbols 전체 rows 기준 오기재).
  - 검증: type-check·lint green, `pnpm -F @travis/worker test` **56 tests** (기존 37 + 신규 WS 19) passed, 60초 smoke:step5 — WS 9개 연결 전부 success, heap peak 27MB, **SPOT rate limit 경고 0건**, Supabase fresh_2m 전 마켓 100%, liquidation 15건 수집, BTCUSDT age 3초, volume_chg_5m 해석 B 전환 구조 배포 (10분+ 구동 시 발동)
  - **Step 4 후속 전환 완료**:
    - `volume_chg_5m` 해석 A → **해석 B**: preComputeTicker 에 volumeKlineWindow 4번째 인자 추가, 10개 sample 충족 시 자동 전환, 미달 시 해석 A fallback (부팅 직후 연속성 유지).
    - `tickerWindow` push 소스: 3초 REST → 1초 WS miniTicker. RollingWindow sampleIntervalMs=60,000 이 1초 push 를 60초 간격으로 자동 throttle.
  - **IP ban 위험 완전 해소**: Binance 공식 권고("Use WebSocket Streams to avoid bans")대로 REST 폴링 자체 제거. Step 4 153~213% 피크 rate limit → **0건 경고**. 429 발동 0회.
  - **Supabase Free Tier 한계 진단 (2026-04-20)**: 1시간 steady-state smoke 를 Cloudflare 522 + connection timeout 간헐 반복으로 연기. 원인은 Free tier compute sleep + cold-start + 0.5 vCPU/500MB/~15 connections 리소스 한계 (shared compute 구조). **Step 5 코드와 무관한 외부 인프라 문제**로 결론. M1.4 카드 구현 중 장시간 `dev` 구동이 자연스러운 end-to-end 검증을 대체. 실제 작업 방해 시 Supabase Pro ($25/월) 업그레이드 결정 (결정 대기 목록 참조). 상세 진단·처방: `docs/task-record/M1.3-step5-ws-relay.md` §Supabase Free Tier 한계 진단.
  - 상세: `docs/task-record/M1.3-step5-ws-relay.md`

> **Step 6(Hetzner VPS 배포)는 2026-04-19 결정으로 완전 삭제**됨. M1 엔드투엔드 증명은 로컬 워커로 완료하고, 실서버 배포는 Launch Readiness §L.3 체크리스트에서 처리. 관련 `ecosystem.config.cjs`·배포 스크립트·VPS 프로비저닝은 모두 M1 이후 작업.

**총 예상**: 15~22시간 (3~5일, Step 1~5)
- M1.1/M1.2 편차 반영: 인터페이스 작업(M1.2)은 극단적으로 빨랐으나, M1.3은 **외부 API 연동**이라는 질적 차이가 있어 보수적 상한 유지. 특히 Binance API rate limit 대응, WS 재연결 로직, per-symbol 지표 순회에서 예상치 못한 시간 소모 가능.

**비전공자 설명**
"진짜 데이터 배관"을 까는 단계입니다. 이때 **로컬 워커**가 거래소 데이터를 실제로 긁어와 창고(Supabase)에 채우기 시작합니다. 비유하면 "수돗물이 나오게 공사"하는 단계. 나중에 (M2~) 커피머신(CoinGecko), 정수기(CoinGlass) 등을 같은 배관에 꽂으면 됩니다. **실서버(Hetzner)로 옮기는 작업은 M1 완료 이후 Launch 준비 단계**에서 진행합니다.

**중요**: 이 단계에서 "어떤 테이블을 만들까?"를 지금 확정하지 않습니다. 개발 중 Binance API가 실제로 반환하는 필드를 보면서 `ticker`, `kline`, `symbol metadata` 등으로 **자연스럽게 분할**합니다 — `DB_SCHEMA.md`의 "deferred decision" 원칙.

---

### M1.4 — 프론트 최소 캔버스 + 컴포넌트 3종

**목표**
React Flow 무한 캔버스 + 채팅 입력 바 + 3개 카드 컴포넌트(`TickerCard`, `CoinListCard`, `KlineChartCard`)가 렌더링됨.
아직 AI는 연결 안 됨 — 프론트에서 수동으로 JSON을 주입해서 카드가 뜨는지만 확인.

**산출물**

- React Flow 캔버스 (@xyflow/react 12): 줌/팬, 커스텀 노드(카드)
- 카드 컨테이너 공통 컴포넌트: 드래그/리사이즈/삭제/헤더 *(Step 2 완료, 2026-04-21 — `CardContainer.tsx` + NodeResizer + 삭제 버튼. `docs/task-record/M1.4-step2-cardcontainer.md`)*
- 컴포넌트 3개 (각각 `componentRegistry`에 등록) *(Step 3 완료, 2026-04-21 — `docs/task-record/M1.4-step3-cards-and-dual-theme.md`)*:
  - `TickerCard` — 단일 심볼 실시간 가격 (**경로 B**: Supabase Realtime 구독, age 1~3초)
  - `CoinListCard` — 심볼 리스트 + 24h 변동률 정렬 (**경로 B**: Supabase Realtime 구독). **`content` 갱신 모드 지원** — 필터 조건이 주어지면 데이터 갱신 시마다 조건을 재평가하여 목록 항목을 동적으로 추가/제거.
  - `KlineChartCard` — TradingView Advanced Chart 임베드 (iframe + theme 동기화). *(PRD §5 차트 정책: lightweight-charts 채택 철회, TradingView 임베드 우선)*
- **UI 디자인 시스템 — UI-3 Monochrome 하이브리드 + 듀얼 테마** *(Step 3 완료)*:
  - 라이트 = Monochrome Light (paper `#fafaf9` + ink `#0a0a0a`) / 다크 = Carbon Architectural (paper `#1a1a1a` + 웜 크림 `#e8d9b8`)
  - up/down·long/short 에만 teal + vermilion 2색 예외 (crypto-trader 자문)
  - 폰트 3종 `next/font/google` 주입: DM Serif Display / JetBrains Mono / Archivo
  - 좌측 상단 ThemeToggle (next-themes, `enableSystem=false` — 트레이더 명시 선택)
  - AI 자유 텍스트 헤더 3필드 (`kicker` + `title` + `subtitle`) — `AiCardConfigSchema` 확장
- 3개 컴포넌트 등록 → `promptInjection()` 출력에 자동 포함되는지 확인
- 액션 디스패처 초기 구현 (spawn만 지원, drill-down은 확장 루프)
- 채팅 입력 바 (shadcn/UI, 아직 AI 연결 안 됨, 클릭 시 dummy 핸들러)
- Zustand 글로벌 상태: 캔버스 노드, 뷰포트, 채팅 상태 (Zustand hook은 client component에서만 사용)
- **갱신 모드 인프라**: 카드 컨테이너가 AI JSON의 `updateMode` 필드를 읽고 갱신 전략을 분기 (`value`: 값만 갱신, `content`: 필터 재평가로 항목 동적 추가/제거). `content` 모드 시 카드 내부에서 Supabase Realtime 이벤트 수신 → 필터 조건 재평가 → 목록 재구성. *(Step 2 완료, 2026-04-21 — `AiCardConfigSchema` + `useRealtimeRow/Table` 훅. Step 4 CoinListCard 에서 filterEvaluator 완성 예정)*
- **각 카드가 독립적으로 구독 관리** — 중앙 집중식 구독 금지 (CLAUDE.md 규칙)

**완료 기준**

- [x] localhost에서 캔버스가 렌더링되고, 줌/팬 동작 *(Step 1 완료, 2026-04-20 — `docs/task-record/M1.4-step1-canvas-base.md`)*
- [x] 개발자 콘솔에서 JSON을 수동 주입하면 3종 카드가 모두 생성됨 *(Step 3 완료, 2026-04-21 — Playwright 스크린샷 4장 증거)*
- [x] `TickerCard`는 Supabase Realtime(경로 B)으로 가격이 1~3초 이내 갱신 *(Step 4.5 (2026-04-22) RLS policy 추가로 최종 해결 — BTCUSDT $76,130.00 실데이터 렌더 증명. `m14-step4.5-ticker-real-price.png`)*
- [x] `CoinListCard`는 Supabase Realtime 구독 → DB 변경 시 자동 갱신 *(Step 4.5 동일 migration 으로 해결. 10 row top gainers 실데이터 렌더 증명)*
- [x] `KlineChartCard`는 TradingView 임베드로 과거/실시간 가격 표시 + 테마 동기화 *(Step 4 에서 ETH/USDT $2,314.08 실데이터 로드 실증, D-2 정책으로 차트만 다크 고정)*
- [x] 카드를 드래그·리사이즈·삭제 가능 *(삭제 즉시 + Undo 토스트 5초 패턴. Step 4.5 에서 false positive 판명 — 설계대로 완벽 작동, Undo 클릭 시 카드 복구까지 확인)*
- [x] `componentRegistry`에 3종이 등록됐고, AI 프롬프트 주입 테스트에 나타남
- [x] `CoinListCard`에 필터 조건 JSON을 수동 주입 → 조건에 맞는 항목만 표시되고, DB 변경 시 목록이 동적으로 갱신되는 것 확인 (`content` 갱신 모드)
- [x] **다크/라이트 테마 토글** (좌측 상단) — 사용자 명시 선택, SSR-safe hydration
- [x] **Step 4 — 채팅 입력 바 + actionDispatcher (spawn)** *(dummy 파서로 3종 카드 자동 생성 — E2/E3/E4 증명. `docs/task-record/M1.4-step4-final.md`)*
- [x] **Step 4 — AI 자유 텍스트 XSS 방어** *(sanitizeTitle 8 테스트, `<em>`/`<strong>` 화이트리스트)*
- [x] **Step 4 — LOADING 8초 stale 안내** *(useLoadingTimeout 훅 + 3 테스트, 실데이터 지연 시나리오 실증)*

**의존성**: M1.3 완료 (데이터가 흘러야 카드 렌더를 증명 가능)

**비전공자 설명**
"집에 가구를 놓는 단계"지만 아직 사람(AI)은 배치를 지시하지 못합니다. 먼저 가구가 혼자서도 제대로 동작하는지 확인하는 게 목적. 수도(M1.3의 로컬 워커)는 연결됐으니 수돗물이 가구까지 잘 오는지 본인 눈으로 검증합니다.

---

### M1.5 — AI 오케스트레이터 엔드투엔드 연결

**목표**
사용자가 채팅 입력에 `"BTCUSDT 가격 보여줘"` 또는 `"거래량 상위 10개 보여줘"`라고 입력 → Haiku 호출 → Zod 검증 → JSON → 캔버스에 해당 카드 자동 생성 → 실시간 갱신.
**TRAVIS의 핵심 루프가 최초로 작동**하는 단계.

**산출물**

- `apps/web/app/api/orchestrate/route.ts` — Next.js API Route
  - 사용자 쿼리 수신 → Haiku 호출 → Zod 검증(실패 시 Zod 에러 다시 AI에 피드백 후 1회 재시도) → JSON 반환
  - 2회 실패 시 크래시 없이 graceful fallback 응답
- Haiku 클라이언트 (`@anthropic-ai/sdk`): 시스템 프롬프트에 4개 레지스트리 내용 자동 주입 (M1.2의 `promptInjection` 사용)
- Zod 스키마: AI 출력 JSON 형식 (카드 목록 + 데이터 바인딩 + **갱신 모드(updateMode)** + **필터 조건(filters)** + actions 필드). AI가 사용자 의도에 따라 `updateMode`를 `value` 또는 `content`로 선택하고, `content` 모드 시 `filters` 배열에 필터 조건을 구조화하여 포함.
- Sonnet 에스컬레이션 **플래그만** 존재 (실제 Sonnet 호출은 확장 루프에서)
- AI가 `dataService` 경유로 데이터 존재 여부를 검증하는 방식 정의 (구체 형태는 구현 중 결정 — tool call 또는 사전 쿼리 중 택)
- 검증 실패 로그: `log_validation_failure` 에 기록 (구조는 M1.3에서 이미 마련)
- 프론트엔드 액션 디스패처가 API Route 응답 JSON을 읽어 카드 생성 + 구독 바인딩
- Graceful fallback UI: 2회 재시도 모두 실패 시 "쿼리를 다시 표현해 주세요" 카드 표시 (**크래시 절대 금지**)

**완료 기준** ✅ **M1.5 완료 선언 — 2026-04-23** (쿼리는 글로벌 English-only 방침에 따라 영어로 최종 확정)

- [x] `"Show BTCUSDT price"` → `TickerCard` 1개 생성 + 실시간 갱신 (Playwright A-ticker PASS)
- [x] `"Top 5 coins by 24h volume"` → `CoinListCard` 1개 생성 + 자동 정렬 (Playwright A-list PASS, `updateMode:content` 확인)
- [x] `"BTCUSDT 1-minute candlestick chart"` → `KlineChartCard` 1개 생성 (Playwright A-kline PASS, TradingView iframe 확인)
- [x] Zod 검증 고의 실패 테스트 → 1회 재시도 → 여전히 실패 시 fallback UI 표시, **크래시 없음** (FORCE_INVALID_RESPONSE flag 경로, Playwright B PASS)
- [x] `log_validation_failure`에 실패 기록 누적 (`smoke:query-log` 으로 4 rows 확인 — 그 중 3건이 E2E 경로로 방금 쌓임)
- [x] 코드 리뷰 + grep: AI 오케스트레이터가 외부 API(거래소 REST, CoinMarketCap 등)를 **직접** 호출하지 않음 — `apps/web/app/api/orchestrate/` 거래소 URL 하드코딩 **0건**
- [x] 코드 리뷰 + grep: AI 오케스트레이터가 `dataService` 경유로만 데이터 접근 — orchestrate 경로 내 직접 HTTP 호출 **0건** (Anthropic 은 `@anthropic-ai/sdk` 경유)
- [x] 같은 쿼리를 두 번 보내도 레지스트리 내용에 변화 없으면 안정적으로 같은 결과 (카드 타입 수준에서) — Playwright E PASS, `resolveUniqueId` 로 id 중복 구조적 해결
- [x] AI 가 `updateMode: "value"` / `"content"` + `filters` 올바르게 출력 — `data-update-mode` attribute 검증
- [x] `content` 모드 카드에서 DB 데이터 변경 시 필터 재평가 동적 갱신 — M1.4 Step 4 증명 승계 + M1.5 에서는 AI 출력 정확성 확인

**의존성**: M1.2, M1.3, M1.4 완료 ✅

#### Steps (2026-04-22 분해)

- [x] **Step 0 — 사전 인프라 + M1.4 이월 처리 + 서브에이전트 생성** (예상: 1.5~2시간 / 실: ~40분, 2026-04-22)
  - 산출물:
    - (M1.4 이월) ✏️ TradingView 심볼 매핑 로직 — USDM/Spot 구분 정확도 (§7-3). 위치는 `apps/web/components/cards/KlineChartCard.tsx` 또는 인접 헬퍼에서 `BINANCE:` prefix 결정 경로 (구현 중 확정). crypto-domain-expert 자문 경유.
    - (환경) ✏️ `.env.local` (ANTHROPIC_API_KEY 주입, 커밋 금지 확인), ✏️ `apps/web/package.json` (`@anthropic-ai/sdk` 추가)
    - (서브에이전트) ➕ `.claude/agents/ai-orchestrator-specialist.md`, ➕ `.claude/agents/crypto-domain-expert.md` (genagent 경유 생성)
  - 검증: (1) `KlineChartCard` 에서 USDM 계약은 `BINANCE:{SYM}.P` / Spot 은 `BINANCE:{SYM}` 로 임베드 URL 형성되는지 Playwright 1 케이스로 확인, (2) `pnpm -F @travis/web install` 후 `@anthropic-ai/sdk` import 가능, (3) `.env.local` 에 key 존재 + `.gitignore` 커버 확인 (`git check-ignore .env.local`), (4) 두 서브에이전트 파일 존재 + description 검증
  - 스코프 경계: **Haiku 실제 호출은 Step 1부터**. 여기서는 SDK 설치·key 주입만. 서브에이전트는 "생성"만, 활용은 Step 1~4. TradingView 심볼 맵은 "USDM/Spot 구분" 한정 — 코인-M·기타 변형은 deferred.

- [x] **Step 1 — Haiku 클라이언트 + 시스템 프롬프트 빌더** (예상: 2~3시간 / 실: ~50분, 2026-04-22)
  - 산출물: ➕ `apps/web/lib/ai/haikuClient.ts` (Anthropic SDK 래핑, 모델 ID `claude-haiku-4-5-20251001` 상수), ➕ `apps/web/lib/ai/buildSystemPrompt.ts` (`promptInjection()` 호출 → AI 시스템 프롬프트 텍스트 합성 + 출력 JSON 포맷 설명 포함), ➕ `apps/web/lib/ai/index.ts` (배럴)
  - 검증: (1) Node 스크립트 혹은 API 라우트 smoke 테스트로 Haiku 가 최소 1회 호출되어 non-empty 응답 수신, (2) `buildSystemPrompt()` 출력 문자열에 4개 레지스트리 dummy/실제 항목이 모두 포함 (grep 테스트), (3) Sonnet 에스컬레이션 **플래그 상수만** 정의 (예: `ESCALATE_TO_SONNET_FLAG = false`) — 실제 분기 로직 넣지 않음, (4) `pnpm -F @travis/web type-check` green
  - 스코프 경계: API 라우트·Zod 검증·재시도 로직은 Step 2. 여기서는 "Haiku 에 텍스트 보내고 텍스트 받는 최소 래퍼"만. **tool_use input_schema 의 구체 형태는 deferred** — Anthropic SDK 의 messages API 호출 방식 (tool_use 여부, 순수 text 응답 JSON 파싱 여부) 은 Step 2 에서 실측 후 결정.

- [x] **Step 2 — `/api/orchestrate` Route + Zod 검증 + self-correction 재시도 + 실패 로그** (예상: 4~5시간 / 실: ~2시간 25분, 2026-04-22 완료)

  **Sub-step 분해** (2026-04-22 결정, ai-orchestrator-specialist + zod-schema-architect 자문 반영):

  - [x] **Step 2a — API Route 뼈대 + 성공 경로** (예상 1~1.5h / 실: ~40분, 2026-04-22)
    - 산출물: ➕ `apps/web/app/api/orchestrate/route.ts` (POST 핸들러, text-only JSON 파싱, 성공 경로만), ✏️ `packages/shared/src/schemas/orchestrateResponse.ts` (top-level discriminated union 확장 — `{ kind: "success", payload: OrchestrateResponse } | { kind: "fallback", reason, message }`)
    - 검증: curl "BTCUSDT 가격" POST → 200 OK + `kind: "success"` + Zod 통과 JSON
    - 스코프 경계: Zod 실패 경로/재시도/log INSERT 는 Step 2b~2c

  - [x] **Step 2a.5 — tool_use 실측 스파이크** (30분 타임박스, 2026-04-22 완료)
    - 산출물: `apps/web/scripts/spike-tool-use.ts` (10 쿼리 × 2 모드 A/B), `haikuClient.ts` 에 `tools/toolChoice` 옵션 추가, `zod-to-json-schema@^3.25.2` dep
    - 실측 결과 (20 Haiku calls):
      - text-only : **7/10 (70%)** 성공, 평균 2528ms, input 3177 tokens
      - tool_use  : **10/10 (100%)** 성공, 평균 2090ms, input 6957 tokens
    - 실패 패턴 (text-only 3건): 모두 `zod_parse — Unrecognized key` (`market_type` vs `marketType`, `filter` vs `filters` 스키마 drift)
    - **결정: `USE_TOOL_USE = true` 기본값**. tool_use 의 `input_schema` 가 Anthropic 런타임에서 스키마 drift 원천 차단. 재시도 부담 감소 + 지연 단축 + log 축적 감소. 비용 2배 (호출당 $0.003→$0.007) 는 M2+ prompt caching 으로 90% 절감 가능 이월.
    - M2+ 이월: **Prompt caching** (tool_use 의 input_schema 를 `cache_control: { type: "ephemeral" }` breakpoint 로 묶어 5분 TTL 캐싱)

  - [x] **Step 2b — Zod safeParse + self-correction 재시도** (예상 1.5~2h / 실: ~45분, 2026-04-22)
    - 산출물: ➕ `packages/shared/src/schemas/formatZodError.ts` (English bullet 포맷 유틸 — `path: message (code)`), ✏️ `route.ts` (messages 3턴 누적 재시도: assistant 원본 + user correction), 재시도 backoff 정책 (Zod 실패 즉시 0ms, transient 500ms→1.5s 지수)
    - 검증: 의도적 스키마 깨기 → 1회 재시도 → 성공 / 2회 실패 → fallback `{ kind: "fallback" }` (크래시 없음)

  - [x] **Step 2c — service_role client + log_validation_failure + RLS 점검** (예상 1h / 실: ~35분, 2026-04-22)
    - 산출물: ➕ `apps/web/lib/supabase/serviceRoleClient.ts` (module singleton + `typeof window` 가드 + env 검증, Step 1 haikuClient 와 동일한 3중 방어선), ➕ `apps/web/lib/ai/logValidationFailure.ts` (얇은 래퍼, `SupabaseDataService.insertValidationFailureLog` 위임)
    - 검증: DB 직접 SELECT 로 `log_validation_failure` 최소 1건 + RLS anon policy 0개 재확인

  **주요 설계 결정** (사용자 승인 2026-04-22):
  1. Fallback shape: **top-level discriminated union `{ kind }`** (OrchestrateResponse 안에 fallback 필드 끼우지 않음)
  2. 재시도: **messages 3턴 누적** (system prompt cache 유지)
  3. Zod 에러 포맷: **English bullet** (Haiku 교정율 우선, 일관성)
  4. Backoff: **Zod 즉시 / transient 500ms→1.5s 지수** (UX 4초 상한)
  5. `log_validation_failure`: **기존 5 컬럼 유지** (id/query_text/ai_response/error_type/error_message/created_at — 컬럼 확장은 M1.6 이월)
  6. service_role client: **module singleton + 3중 가드** (신규 파일)
  7. **tool_use 기본 활성화** (Step 2a.5 스파이크 결과): text-only 70% vs tool_use 100% 성공률. `USE_TOOL_USE=true` 기본값, text-only 는 env override 로 유지. 비용 2배는 M2+ prompt caching 으로 90%+ 절감 이월.

  **스코프 경계 — 의도적 이월 (2026-04-22 결정)**:

  - **M1.6 이월**: `log_validation_failure` 컬럼 확장 (`user_id` NOT NULL, `attempt_number`, `model_id`, `system_prompt_version`, `user_query_hash`). 이유: 어차피 M1.6 auth 도입 시 `user_id` 추가 migration 이 필요하므로 그때 일괄 확장하는 것이 migration 비용·timing 모두 경제적. Step 2 에서는 기존 5 컬럼으로 충분 (dev 본인만 접근).
  - **M2+ 이월**: 부분 성공 허용 (카드별 pre-flight safeParse). 이유: Haiku 4.5 의 JSON 준수력이 높아 "10 장 중 일부만 invalid" 시나리오가 드물고, 실측 없이 선제 최적화하는 것은 YAGNI 위반. Step 2 전체 재시도 로직을 깨지 않고 추가 가능하므로 향후 실사용 데이터 관찰 후 도입. 도입 시 `OrchestrateResponseSchema` 구조 변경 없음 (runtime 분기만).
  - **Step 2a.5 스파이크 완료 (2026-04-22)**: **tool_use 기본 활성화** 결정. 실측 결과 text-only 7/10 (70%) vs tool_use 10/10 (100%) + tool_use 가 오히려 438ms 빠름. 실패 원인은 Haiku 의 스키마 필드명 drift (`market_type`/`filter` 등 camelCase/단복수 혼동) 로 input_schema 가 원천 차단. tool_use 로 `dataService` 메서드 노출은 Step 2 범위 밖 — M2+ 확장 루프에서 결정. M2+ **prompt caching** 이월 (tool_use input_schema cache_control 로 5분 TTL 캐싱 → 입력 비용 90%+ 절감).
  - **M2+ 이월 (Step 1 에서 기 이월)**: Sonnet alias → snapshot id 교체 / refusal 블록 분기 (`stop_reason === "refusal"`) / Example JSON drift 방지 (registry id 동적 추출).

  **서브에이전트 분담**:
  - `@zod-schema-architect`: `formatZodError()` + top-level union schema
  - `@backend-infra-specialist`: `serviceRoleClient.ts` + RLS 재검증
  - `@ai-orchestrator-specialist`: route.ts 본체 + 재시도 루프 + 2a.5 스파이크
  - `@crypto-trader`: Step 2 완료 후 fallback 메시지 톤 자문 (advisory)

- [x] **Step 3 — ChatInputBar fetch 교체 + dummyChatParser 제거 + fallback 토스트** (예상: 1.5~2시간 / 실: ~2.5시간, 2026-04-22 완료)
  - 산출물: ✏️ `apps/web/components/chat/ChatInputBar.tsx` (handleSubmit 에서 `dummyChatParser` 호출 → `fetch('/api/orchestrate', ...)` 로 교체, 응답을 `dispatchOrchestrateResponse()` 에 전달), 🗑️ `apps/web/lib/dummyChatParser.ts` 삭제, ✏️ `apps/web/lib/actionDispatcher.ts` (top-level `OrchestrateApiResponseSchema` discriminated union 소비로 확장, reason 에 `"fallback"` 추가)
  - 실제 작업 결과 (2026-04-22):
    - **Sub-step 3a** — dispatcher 확장 (신규 fallback reason + invalid-shape 방어). 기존 5개 테스트 `{kind:"success", payload}` 래핑 + fallback/invalid shape 2개 신규 테스트 → **7/7 PASS**.
    - **Sub-step 3b** — ChatInputBar fetch + try/catch + Zod 안전 통합. dummyChatParser.ts 완전 삭제 (실행 참조 0건). 로딩 중 `disabled` + placeholder "AI 에게 물어보는 중..." UX.
    - **Sub-step 3c** — Playwright MCP 3종 시나리오 수동 증명 (스크린샷 3장): (1) BTCUSDT 가격 → TickerCard $75,332.00 정상 렌더, (2) 무의미 쿼리 → graceful empty + 기존 카드 보존, (3) 거래량 상위 5개 → CoinListCard 5 row 실데이터 + `updateMode:content`.
    - **작업 중 발견 scope 외 수정 2건**:
      - `@travis/data-service` 의 상대 경로 import `.js` 확장자 14건 제거 → Turbopack server-side 번들 resolve 실패 해결 (500 Internal Server Error 원인). `moduleResolution: "bundler"` 와 일치시킴.
      - `apps/web/lib/registerCards.ts` 의 componentId 네이밍 통일 (`"ticker"` → `"ticker-card"` 등 3건) → `cardComponentRegistry` 문서 계약 ("shared 와 동일 id") 이행. M1.4 때부터 잠복했던 drift 를 dummyChatParser 가 카멜케이스로 맞춰 써 숨기고 있던 것.
    - **code-reviewer 즉시 반영 3건**: W1 devInject 옛 id / W4 `as unknown as` 제거 후 명시 map / W5 500 응답 메시지 분기.
    - **code-reviewer 이월 5건 (C1/C2/W2/W3)**: `docs/deferred-task.md §2,3` 에 기록.
    - **crypto-trader 자문 3건 (Q1/Q2/Q3)**: 사용자 방침 "M1 완료 후 실사용 피드백 기반 재평가" 적용. 모두 `docs/deferred-task.md §4 [4-19]~[4-21]` 및 §9 [9-9] 에 기록.
  - 검증: (1) Playwright "BTCUSDT 가격 보여줘" → TickerCard 실렌더 + 실시간 갱신 ✅, (2) 무의미 쿼리 → graceful (크래시 없음, 기존 카드 보존) ✅, (3) `grep -r "dummyChatParser" apps/` 실행 참조 0건 ✅, (4) Playwright MCP 3종 시나리오 스크린샷 확보 ✅, (5) type-check / lint / **51/51 tests PASS** ✅
  - 스코프 경계: 로딩 스피너·취소 버튼·스트리밍 응답은 전부 M2+. Zod 고의 실패 → 재시도 → fallback 자동화는 Step 4 E2E. componentId/datasource enum 승격은 M1.6 `@zod-schema-architect` 자문.
  - task-record: `docs/task-record/M1.5-step3-chat-integration.md`

- [x] **Step 3d — Haiku `refusal` 블록 전용 fallback 분기** ✅ **2026-04-23 완료** (~40분)
  - 산출물: ✅ `packages/shared/src/schemas/orchestrateResponse.ts` 의 `OrchestrateFallbackReasonSchema` 에 `"refusal"` 추가 + JSDoc 업데이트. ✅ `apps/web/lib/ai/haikuClient.ts` 의 empty 체크 조건을 `stop_reason !== "refusal"` 로 좁혀 refusal 블록만 담긴 응답 통과 허용. ✅ `apps/web/app/api/orchestrate/route.ts` 에 `stopReason === "refusal"` early return 분기(retryable=false) + `messageForReason()` 에 `"해당 요청은 처리할 수 없어요. 다른 방식으로 질문해 주세요."` 매핑 + query 프리픽스 200자 `console.warn` (code-reviewer W2 즉시 반영). ✅ `actionDispatcher.test.ts` (h) refusal variant 테스트 1건 추가 (7→8).
  - 검증 결과: ✅ type-check 4 workspace (@travis/shared, @travis/web, @travis/data-service, @travis/worker) 전부 **0 errors**. ✅ lint **0 warnings / 0 errors**. ✅ test **52/52 PASS** (Step 3 의 51 → Step 3d 52). ✅ `messageForReason` switch exhaustiveness 로 refusal 누락 시 컴파일 에러로 자동 가드 확인.
  - 서브에이전트 자문: **@code-reviewer**: Critical 0 / Warning 2(W1 extract stage 세분화 → `[3-8]` 이월, W2 console.warn → 즉시 반영) / Praise 3 (enum exhaustiveness, haikuClient 의미적 정확, early return 위치). **@crypto-trader**: ship-ready, Q1(토스트 문구) / Q2(refusal 사유 로그) + O1-O3 모두 [9-9] M1 완료 후 피드백 원칙으로 이월 (`[4-22]~[4-24]`).
  - 사용자 결정 (Q1~Q3, 2026-04-23): Q1=(B) 토스트 문구 | Q2=(A) refusal 블록 본문 수집 생략 | Q3=(A) actionDispatcher 테스트 1건만 추가. + Auto Mode 중간 결정 — code-reviewer W2 console.warn 즉시 반영.
  - task-record: `docs/task-record/M1.5-step3d-refusal-branch.md`
  - 이월: W1 fallbackReason 세분화 (`deferred [3-8]`), orchestrateOnce 단위 테스트 (`[3-9]`), crypto-trader Q1/Q2/O1-O3 (`[4-22]~[4-24]`).

- [x] **Step 4 — E2E 통합 검증 (완료 기준 10개 일괄 체크)** ✅ **2026-04-23 완료** (~5h)

  **Sub-step 분해** (사용자 승인 Q1=C / Q2=A / Q3=B, 2026-04-23):
  - [x] **4a — Playwright 설치 + 5 시나리오 spec** ✅
    - 산출물: `@playwright/test` devDep, `playwright.config.ts` (chromium only / workers=1 / reuseExistingServer=true), `tests/e2e/m1.5-orchestrate.spec.ts` (ticker / list / kline / 동일쿼리 2회 / force-invalid), `CardContainer.tsx` 에 `data-card-type/id/update-mode` test-friendly attrs.
  - [x] **4a′ — English-only 정렬 + registry 누락 결함 근본 해결** ✅ (중간 발견 후 삽입)
    - 산출물: `defaults.ts` 영어 재작성 + coin-list-card/kline-chart-card/kline datasource 신규 등록 (이전에는 ticker-card 만 등록되고 나머지는 Haiku 가 id 환각으로 매칭 중이었음). `buildSystemPrompt.ts` 영어 only. `actionDispatcher.ts` `resolveUniqueId` + `layoutSlot` seedOffset (결함 2 구조적 해결).
    - 사용자 확정 원칙: TRAVIS = 글로벌 English-only + "X 쿼리 → Y 컴포넌트" 하드코딩 금지 (CLAUDE.md 반영).
  - [x] **4b — dev-only `FORCE_INVALID_RESPONSE` flag** ✅
    - `route.ts` 에 `NODE_ENV !== 'production'` 가드 + `buildForcedInvalidFailure()`. (B) 시나리오 1/1 PASS (fallback 토스트 + 크래시 0).
  - [x] **4c — grep 2종 + `log_validation_failure` SELECT** ✅
    - `scripts/query-log-validation.ts` + `smoke:query-log` script. (C) 4 rows 확인 (그 중 3건이 방금 쌓인 "Show BTCUSDT price"). (D) 외부 API URL / 직접 HTTP 0건.
  - [x] **4d — ChatInputBar vitest + RTL 3종 테스트** ✅ (`deferred [2-7]` 회수)
    - `vitest.config.ts` jsdom 전환 + esbuild.jsx:automatic. `vitest.setup.ts` + `components/chat/__tests__/ChatInputBar.test.tsx`. 52 → **55/55 PASS**.
  - [x] **4e — `docs/task-record/M1.5-complete.md` 작성** ✅
  - [x] **4f — 서브에이전트 자문 + 문서 일괄 정리** ✅
    - @code-reviewer: PASS (Critical 0 / Warning 5 / Suggestion 4 / Praise 6). 즉시 반영 3건(W2 registry description 가이드라인 CLAUDE.md 반영 / W3 test describe rename / W5 `e2e:offline`·`e2e:force-invalid` npm scripts + `cross-env`). M1.6 이월 2건(W1 dataService 프론트 레이어 / W4 RTL mock shape assertion). M2+ 이월 1건(S4 data-card-id 유일성 assertion).
    - @crypto-trader: Critical blocker 없음. 3 페르소나 회고 + 5 관찰 포인트 전부 [9-9] M1 완료 후 피드백 원칙 편입.
    - deferred-task.md: [2-1]~[2-5]/[2-7] 회수 / [3-10]/[3-11]/[4-25]/[9-10] 신규 이월.

  **완료 기준 10개 매핑** (sub-step ↔ 기준):
    - (A) 실데이터 3종 시나리오 ↔ 4a (ticker / list / kline 각각 1 카드 + 실시간 갱신 스크린샷 3장)
    - (B) Zod 고의 실패 → 재시도 → fallback UI, 크래시 없음 ↔ 4b
    - (C) `log_validation_failure` SELECT ≥1건 ↔ 4c
    - (D) grep 2건 (`api.binance.com`/`coinmarketcap.com` 하드코딩 0, Supabase client 외 HTTP 호출 0) ↔ 4c
    - (E) 동일 쿼리 2회 → 카드 타입 동일성 ↔ 4a
    - (F) updateMode value/content 출력 ↔ 4a (응답 JSON 저장 후 확인)
    - (G) content 모드 DB 변경 → 목록 동적 갱신 (M1.4 Step 4 증명, 여기선 AI 출력 확인만) ↔ 4a

  **스코프 경계 (6 sub-step 공통)**:
    - 성능 테스트·부하 테스트·비용 모니터링은 M2+
    - "평균 응답 시간 몇 초" 같은 수치 목표 설정하지 않음 (사용자 체감 통과로 충분)
    - 로그인 사용자별 격리 검증은 M1.6
    - Playwright CI 자동화는 M1.6 (인증 gate 와 함께)
    - stale closure / handleSubmit 분리 는 [2-6]/[2-8] 로 M1.6 이월

**총 예상**: 10~14시간 (2~3일)

**비전공자 설명**
이 단계가 끝나면 **"말로 화면을 조립한다"는 TRAVIS의 원래 비전이 최초로 증명**됩니다.
아직 사용자 로그인은 없고, 데이터는 Binance만, 컴포넌트는 3종뿐입니다. 그러나 **확장성은 이미 레지스트리 패턴으로 보장**되어 있으므로, 나머지는 "메뉴판에 항목 추가" 반복 작업입니다.

---

### M1.6 — 인증 + 사용자 로그

**목표**
이메일 로그인 동작. 사용자별 채팅/행동 로그가 Supabase에 저장되고, RLS로 본인 것만 접근 가능.

**산출물**

- Supabase Auth (이메일 로그인)
- `apps/web`에 로그인/로그아웃 UI (shadcn/UI)
- 로그 테이블 생성 (이름/컬럼은 구현 중 확정, 카테고리 고정):
  - `log_chat` — 채팅 로그 (쿼리, AI 응답 JSON, 타임스탬프)
  - `log_behavior` — 행동 로그 (카드 클릭/드래그/삭제/저장 등 주요 이벤트)
  - 각각 RLS 정책 `auth.uid() = user_id` 필수
- 기존 `log_validation_failure` **확장** (M1.5 Step 2 에서 이월, 2026-04-22 결정):
  - RLS 추가 (service role → user 기반, `auth.uid() = user_id` 정책 신설)
  - 컬럼 확장 migration:
    - `user_id UUID REFERENCES auth.users(id) NOT NULL` (auth 연동)
    - `attempt_number INT NOT NULL DEFAULT 1` (1차/2차 실패 구분, 재시도 통계)
    - `model_id VARCHAR(50)` (haiku/sonnet 모델별 실패율 추적 근거)
    - `system_prompt_version VARCHAR(40)` (git commit SHA — 프롬프트 버전별 교정율 분석)
    - `user_query_hash VARCHAR(64)` (sha256, PII 격리하면서도 동일 쿼리 클러스터링 가능)
  - migration 타이밍: user_id 추가 migration 과 함께 일괄 ALTER — 별도 migration 불필요
  - 이월 이유: M1.5 단계는 dev 1명 규모라 기존 5 컬럼(query_text/ai_response/error_type/error_message/created_at) 만으로 디버깅 충분. M1.6 auth 도입 시 user_id 가 필수이므로 그 시점이 비용·구조 양쪽에서 최적
- 채팅 전송 시 `log_chat` 자동 기록
- 카드 상호작용 시 `log_behavior` 자동 기록 (구체 이벤트 목록은 구현 중 결정)
- CI 검증 스크립트: `user_*`, `log_*` 테이블 중 RLS 없는 테이블 존재 시 빌드 실패 (간단한 SQL 스크립트로 충분)

**완료 기준**

- [ ] 이메일 가입 → 확인 메일 → 로그인 → 대시보드 접근
- [ ] 비로그인 상태에서 `/api/orchestrate` 호출 시 401 거부
- [ ] 테스트용 2번째 계정으로 다른 사용자의 로그 접근 시도 → RLS가 차단
- [ ] CI RLS 검증 스크립트가 일부러 RLS 없는 테이블 생성 시 빌드 실패하는지 고의 테스트
- [ ] `log_chat` / `log_behavior`에 실제 기록이 쌓이는 것 Supabase Studio에서 확인

**의존성**: M1.5 완료 ✅ (2026-04-23)

#### Steps (2026-04-23 분해)

> **이월 항목 상세는 `docs/deferred-task.md` 를 단일 진실 원천으로 참조.** 아래 Sub-step 의
> `회수: [X-Y]` 번호는 deferred-task.md 의 해당 항목 id. ROADMAP 에는 "뭘 할지 + 어디를
> 참조할지" 만 둔다 — 구현 힌트/사유/출처는 ROADMAP 에 복붙하지 않음.

| Step | 내용 (한 줄) | 회수 | 예상 |
|---|---|---|---|
| **Step 0.1** ✅ | 긴급 수정 — datasource id(`ticker_spot`/`ticker_futures`) ↔ 테이블명(`now_spot_ticker`/`now_futures_ticker`) 통일 + 카드 제목 가이드라인 editorial → clarity 전환 (사용자 테스트 세션 3증상 근본 해결, 2026-04-24 완료) | `[1-3]`, `[3-7]` 부분 | ~2h |
| **Step 0** ✅ | 사전 인프라 — `@security-auditor` 서브에이전트 생성(`@genagent` 경유, 6 duty/MCP 2종/9개 경계 명시) + `@supabase/ssr` 설치 + shadcn `form`/`label` 추가 (2026-04-24 완료) | — | ~45m |
| **Step 1** ✅ | Supabase Auth 이메일+비밀번호 로그인/회원가입 (shadcn form + zodResolver) + `(auth)` Route Group + `middleware.ts` matcher `/api/orchestrate/:path*` + route.ts 두 겹 auth + UserMenu 우상단 fixed. code-reviewer C1/C2/W1/W2 즉시 수정. 4건 이월 ([3-12]~[3-15]). (2026-04-24 완료) | `[3-5]` (이메일 부분), `[3-6]` | ~4h |
| **Step 2** ✅ | `log_chat` (13 컬럼) / `log_behavior` (5 컬럼 자유 `event_type`) 신규 + `log_validation_failure` 컬럼 5개 확장 + RLS 정책 `auth.uid()=user_id` 일괄 + `(user_id, created_at DESC)` 인덱스 + route.ts 9 Edit (logChat 4곳 + system_prompt_version env). `@security-auditor` 0 Critical / 5 Warnings 이월. `@code-reviewer` 0 Critical / 4 Warnings 이월. (2026-04-25 완료) | `[3-1]`, `[3-2]`, `[3-3]` | ~2.5h |
| **Step 3** ✅ | dataService 프론트 레이어 (옵션 Z 단일 channel + dispatch table) + sessionFlusher 4중 가드 + logger factory + ChatInputBar 리팩터 + user_query_hash. `[3-33]` 자연 해소 + 카드 마이그레이션 + 레거시 6 파일 삭제. 자문 발견 즉시 수정 4건 + deferred 5건 신규. (2026-04-26 완료, **사용자 수동 검증 23/23 sub-items 통과 2026-04-27** — id 51 `"visibility"` + id 54 `"pagehide"` + id 57 `"idle"`(session_ms=330010) 4중 가드 산 데이터 + idle skip 정공법 + nonce suffix 보너스 자동 검증) | `[3-10]` (부분), `[2-6]`, `[2-8]`, `[3-33]`, `[3-15]`, `[3-17]`, `[3-27]` | 7h |
| **Step 3.5 hotfix** ✅ | M1.3 Step 5b 잠복 버그 회수 — `!miniTicker@arr` (6필드) → `!ticker@arr` (17필드) 전환. `price_change_pct` (priceChangePercent) 매초 적재 — 사용자가 본 Binance 사이트와 데이터 불일치 (BTCUSDT 사이트 +0.80% / DB -0.282%) 해결. **CLAUDE.md / PRD / Architecture 에 "사이트=DB 일치" 도메인 원칙 명문화**. crypto-domain-expert 자문. (2026-04-27 완료) | `[3-39]` 신규 | 2.5h |
| **Step 4** ✅ | registry-derived id refinement (componentId/datasource/targetComponentId — `superRefine` + 빈 registry 가드 + 등록 목록 dump) + queryableFields 일괄 확장 (9 datasource, 18 신규 필드 + `COMMON_QUERYABLE_FIELDS` 머지) + `AiCardConfigSchema` cross-field `superRefine` (filters/sort.field) + fallbackReason 2분할 (`parse_error` / `schema_drift`). zod-schema-architect + crypto-domain-expert 사전 자문 + code-reviewer + crypto-trader 사후 자문. crypto-trader Q3 권고로 `[3-48]` 단위 변환을 M1.7 Step 6 블록킹 승격. (2026-04-28 완료) | `[3-7]`, `[3-8]`, `[3-32]`, `[3-49]` | ~5h |
| **Step 5** ✅ | `pnpm rls-check` npm script (pg + redact + RLS_OFF/RLS_ON_NO_POLICY 분리, baseline 13 테이블 모두 OK) + `orchestrateOnce.test.ts` 8 시나리오 (vi.mock @/lib/ai importOriginal 패턴, MissingKey/InvalidResponse/correction 추가) + ChatInputBar (d-1)(d-2) dispatcher shape assertion + auth 폼 RTL 14 시나리오 (Login 5 / Signup 5 / UserMenu 4) + UserMenu loading flicker fix (`[3-12]` 흡수) + vitest.setup act() warning 승격 (D6). code-reviewer 0 Critical / 6 Warning + 즉시 수정 3건. 잠복 버그 `[3-61]` 발견 (LoginForm/SignupForm submittingRef 미도입). (2026-05-03 완료) | `[3-4]`, `[3-9]`, `[3-11]`, `[3-12]`, `[3-13]` | ~5h |
| **Step 6** ✅ | 4 sub-step 일괄: (6a) `[3-14]` 503/Retry-After + `[3-16]` proxy.ts rename + `[3-63]` _userId 정리 / (6b) M1.6 완료 기준 5개 PASS (Playwright + Supabase MCP) / (6c) `@security-auditor` 0C/2W/22P + `@code-reviewer` 0C/5W/5S/5P + sanitize 12 벡터 + Hetzner Memory 평탄화 +0.9 MB/h + dataService bypass 1건 회수 (CoinListCard/TickerCard → `initialFetch` helper) / (6d) M1-complete.md + 본 ROADMAP `[9-9]`/`[9-10]` 활성화. **M1 전체 완료 선언** (2026-05-04). | `[3-14]`, `[3-16]`, `[3-63]`, `[5-6]`, `[3.5-10]` | ~5h (예상 3~4h, 6c W-1 dataService 마이그레이션 추가) |

> **⚠️ 실행 순서 우선순위 변경 (2026-04-29 사용자 결정)**: M1.6 Step 5/6 보다 **M1.7 Step 0 (Hetzner 이전)** 을 먼저 수행. 이유: Windows 환경 USDM `fstream.binance.com` selective stuck 등 기존 사고가 Linux 데이터센터 환경에서 자연 해소될 가능성 매우 높음 — Step 5/6 검증 자체가 worker 데이터 stale 영향을 받음. **순서**: M1.7 Step 0 → M1.6 Step 5 → M1.6 Step 6 → M1.7 Step 1~6. M1.7 Step 0 은 워커 인프라 단독 작업이라 M1.6 Step 5 (CI RLS SQL / `orchestrateOnce` unit test / RTL mock) 와 **코드 의존성 0** — 둘 사이 직접 충돌 없음.

##### Step 2 Substep 분해 (2026-04-25)

| Substep | 내용 (한 줄) | 예상 |
|---|---|---|
| **2a** ✅ | SQL migration 1개 작성 — `log_validation_failure` 5 row DELETE + ALTER (5 컬럼 추가, `user_id` ON DELETE SET NULL · NULL 허용) + `log_chat` (13 컬럼 + RLS + `(user_id, created_at DESC)` 인덱스) + `log_behavior` (5 컬럼 자유 `event_type` + RLS + 인덱스) | 45m |
| **2b** ✅ | Supabase MCP 적용 (사용자 Dashboard SQL Editor 직접 RUN — MCP read-only 모드) + `generate_typescript_types` → `database.generated.ts` 덮어쓰기 + `tables.ts` 별칭 추가 (`ChatLogRow`/`Insert`, `BehaviorLogRow`/`Insert`) | 20m |
| **2c** ✅ | `IDataService` 메서드 추가 (`insertChatLog`, `insertBehaviorLog`, `insertValidationFailure` 시그니처 확장) + `SupabaseDataService` 구현 + `logValidationFailure.ts` 호출부 동기화 + `logChat.ts` 신규 wrapper | 30m |
| **2d** ✅ | `route.ts` 9 Edit — import / `SYSTEM_PROMPT_VERSION` 상수 / `aggregateTokens` helper (1 query=1 row 옵션 B) / `startTime` / `void _userId` 제거 / `logChat()` 4곳 (success-1차/fallback-1차/success-2차/fallback-2차) + `logValidationFailure` 새 시그니처 | 25m |
| **2e** ✅ | 검증 — type-check 0 / lint 0 / test 55/55 / `pg_policies` 정책 3개 + roles=authenticated + qual=`auth.uid()=user_id` 확인 / `@security-auditor` + `@code-reviewer` 자문 | 30m |

총 예상 ~2.5h (ROADMAP 기존 추정 2~3h 일치).

> **Step 2 핵심 의사결정 (2026-04-25 사용자 컨펌)**:
> 1. **`log_validation_failure` 5 row DELETE** — M1.5 dev 디버깅 메모, 운영 가치 0. 새 schema 깔끔.
> 2. **`user_id ON DELETE SET NULL` + NULL 허용** (CASCADE 대신) — 비즈니스 분석 / 회계 trail / fraud 탐지 보존. GDPR "잊혀질 권리" 명시 요청은 admin tool 의 `query_text` 마스킹 절차로 별도 대응 (`[3-23]` 참조).
> 3. **`log_chat` 풀세트 13 컬럼** (M1.7 dashboard 일괄 대비) — `model_id` / `input_tokens` / `output_tokens` / `latency_ms` / `attempt_number` / `system_prompt_version` / `user_query_hash` 미리 추가. M1.7 ALTER 1회 절약.
> 4. **`log_behavior` 자유 문자열 `event_type`** (enum 박제 X) — Step 3 hook 인스트루멘트 시 enum 자연 발견. CHECK 제약은 Step 3 마지막에 추가.
> 5. **이메일 비정규화 안 함** (UUID 만 저장, `auth.users` JOIN 으로 admin 조회) — PII 격리 / DRY / 이메일 변경 자동 동기화.

##### Step 3 Substep 분해 (2026-04-26)

| Substep | 내용 (한 줄) | 예상 |
|---|---|---|
| **3a** ✅ | `apps/web/lib/dataService/` 7 파일 신설 (types/supabaseAdapter/payload/throttler/channelManager/hooks/index) + 16 신규 tests. 옵션 Z (단일 channel + dispatch table + 1초 grace period) — `[3-33]` 자연 해소. useSyncExternalStore 패턴 (React 19 호환). | 1.5h |
| **3b** ✅ | 카드 3종 (`TickerCard`/`CoinListCard`/`KlineChartCard`) `supabase.from()` → dataService 호출 마이그레이션 + 옛 hook 3 파일 + `apps/web/lib/supabase.ts` + `data.ts` (dead code) + 옛 테스트 1 파일 = **레거시 6 파일 삭제**. (`[3-10]` 부분 / `[3-15]` / `[3-17]` 회수) | 1h |
| **3c** ✅ | `apps/web/lib/logging/createLogger.ts` factory 신설 + `ensurePayloadSize` 5KB 가드. `logChat`/`logValidationFailure` 리팩터 + `logBehavior` 신규. boilerplate 90% 감소. (`[3-27]` 회수) | 30m |
| **3d** ✅ | `sessionFlusher.ts` 4중 flush 가드 (5min idle / visibilitychange / pagehide+sendBeacon / unmount + idle skip) + `/api/log-behavior` endpoint (두 겹 auth + Zod 검증) + middleware matcher 확장 + 인스트루멘트 hook 4종 (`chat_submit`/`card_added`/`card_deleted`/`card_layout_summary`). | 1.5h |
| **3e** ✅ | `ChatInputBar` 재작성 — `submitOrchestrate.ts` 순수 함수 추출 (`[2-8]` 회수) + `submittingRef` 동기 race guard (`[2-6]` 회수) + `sha256Hex` Web Crypto + `chat_submit` logBehavior 통합. `route.ts` `query_hash` schema + 5 logger 호출에 `userQueryHash` 전달. | 1h |
| **3f** ✅ | type-check 0 / lint 0 / test 9 files / 62 PASS. `@code-reviewer` 2 Critical / 5 Warning + `@security-auditor` 0 Critical / 5 Warning + `@crypto-trader`. 즉시 수정 4건 (English-only / userQueryHash 누락 / listener leak / channel null 가드) + deferred 5건 신규 (`[3-34]`~`[3-38]`). task-record + docs 동기화. (Playwright 자동화는 Step 5 deferred) | 1.5h |

총 예상 ~7h (당초 ROADMAP 추정 3~4h + dataService 프론트 레이어 신설 + sendBeacon 인프라 +3h). **실소요 ~7h — 추정 정확.**

> **Step 3 핵심 의사결정 (2026-04-26 사용자 컨펌)**:
> 1. **옵션 B-improved 채택** — `sessionFlusher` 4중 flush 가드 (5min idle timer / `visibilitychange` / `pagehide`+`sendBeacon` / unmount) + idle skip. 이유: 1 event = 1 row INSERT 는 비용 폭증, batch flush 는 unmount/탭 종료 누락 위험 — 4중 가드로 양쪽 해소.
> 2. **`log_behavior` payload 5KB 상한 가드** — 카드 N개 layout summary 폭주 시 row 비대화 방지. 초과 시 클라이언트에서 truncate + 경고 로그.
> 3. **dataService 프론트 레이어 위치** = `apps/web/lib/dataService/` (apps/web 내부, 워커 `packages/data-service/` 와 분리). 이유: 프론트 카드 shape 은 워커 task shape 과 다르고, RLS 통과 anon client 사용. 워커 service_role 과 격리.
> 4. **`useRealtimeRow`/`useRealtimeTable` hook 폐기** → dataService 내부 channel manager 로 흡수. M1.4 잠복 버그 `[3-33]` (동일 channel 중복 subscribe) 자연 해소.
> 5. **`event_type` 시작 4종 고정** (`chat_submit` / `card_added` / `card_deleted` / `card_layout_summary`) — drag/resize 는 카운터로 집계 후 1 row 만. CHECK 제약은 Step 3 마지막에 추가 검토 (자유 문자열 정책 유지).
> 6. **`user_query_hash` 계산 위치** = `ChatInputBar` 클라이언트 (Web Crypto `crypto.subtle.digest('SHA-256')`). 이유: 서버 송신 전 계산하면 동일 query 식별 일관성 + route.ts 가 받기만 하면 됨.
> 7. **Playwright 자동화 Step 5 deferred** — Step 3 는 사용자 수동 검증 우선 (1 query 끝까지 → Supabase Dashboard 에서 log_chat/log_behavior row 직접 확인).

##### Step 6 Substep 분해 (2026-05-03)

> M1.7 Step 0 (Hetzner 이전) ✅ 완료 후 자연 진입. **Step 6 = M1 마무리 scope 한정** — Magic link / `/admin` / rate-limit / canonical metrics 등 M1.7 영역은 절대 흡수하지 않음. (사용자 컨펌 D1=A / D2=추천 / D3=A / D4=A, 2026-05-03)

| Substep | 내용 (한 줄) | 회수 | 검증 기준 (1줄) | 예상 |
|---|---|---|---|---|
| **6a** | 작은 정리 묶음 — `[3-14]` middleware env 누락 응답 500→503 + 본문 최소화(`{ error: "service_unavailable" }`) + `[3-16]` `apps/web/middleware.ts` → `apps/web/proxy.ts` rename (Next.js 16.2.x deprecation) + `[3-63]` `route.ts` `_userId` → `userId` underscore 컨벤션 정리 | `[3-14]`, `[3-16]`, `[3-63]` | type-check 0 / lint 0 / test green / `pnpm dev` 기동 시 middleware deprecation 경고 사라짐 + env 일부러 제거 시 503 응답 본문이 `service_unavailable` 인 것 확인 | ~30m |
| **6b** | M1.6 완료 기준 5개 일괄 검증 — (1) 가입 → 로그인 → 대시보드 진입, (2) 비로그인 시 `/api/orchestrate` 401, (3) 2번째 계정으로 다른 사용자 log 접근 시도 → RLS 차단, (4) 일부러 RLS 없는 테이블 생성 → `pnpm rls-check` exit 1, (5) `log_chat`/`log_behavior` 실제 row 적재 (Supabase Studio 확인). Playwright MCP + Supabase MCP 활용 | — | 5개 시나리오 모두 PASS 스크린샷 또는 row dump 가 task-record 에 첨부됨 + Step 6b 종료 시 모든 RLS 정책이 `auth.uid() = user_id` qualifier 보존 | ~1h |
| **6c** | `@security-auditor` 종합 감사 (M1.6 인증/RLS/log 인프라 전반) + `[5-6]` `sanitizeTitle` XSS 재검증 (M1.4 자체 구현 8 테스트 → 전문가 추가 벡터 검증) + `[3.5-10]` Hetzner worker Memory 평탄화 검증 (8 dump 일괄 SSH read → cache buildup vs 누수 확정) | `[5-6]`, `[3.5-10]` | security-auditor Critical 0 / Warning 정리 + sanitize 추가 벡터 0 또는 정공 픽스 + Memory 8 dump 결과가 366~400 MB 평탄화 또는 추세 데이터로 후속 deferred 명시 | ~1.5h |
| **6d** | `task-record/M1-complete.md` 작성 + ROADMAP 의 `M1.6 Step 6 ✅` + **M1 전체 완료 선언** + `[9-9]`/`[9-10]` UX 피드백 체크리스트 활성화 + `docs/deferred-task.md` 동기화 (회수 5건 ✅ 처리, 신규 deferred 등록) + commit | (선언) | M1-complete.md 가 ROADMAP §M1 6 마일스톤 전부 ✅ 인용 + deferred-task.md §1 (🔴) 0건 + commit 메시지에 `feat(m1-complete)` prefix 적용 | ~30m |

총 예상 ~3~4h (ROADMAP 기존 추정 2h + 회수 4건 + Hetzner Memory 검증 1h 추가).

> **Step 6 핵심 의사결정 (2026-05-03 사용자 컨펌)**:
> 1. **D1 — 4 sub-step 분해 채택** (단일 2h step 거부) — 회수 deferred 5건 + Hetzner Memory 검증 + security 감사 + M1 선언이 한 호흡에 섞이면 검증 누락 위험. 4 단계로 쪼개 각 단계 완료 후 commit.
> 2. **D2 — Confirm email OFF 전제 유지** — 메일 단계는 M1.7 Step 5 (`[3.5-5]`) 로 위임. Step 6 에서는 이메일 verification 흐름 작업 없음.
> 3. **D3 — `[3-16]` middleware → proxy rename 을 6a 에 포함** — 매 dev 기동 경고를 M1 선언 전에 제거. Next.js 16.2.x 호환성 보강은 환경 위생 작업이지 새 기능 아님 (scope creep ❌).
> 4. **D4 — `[3.5-10]` Hetzner Memory 검증을 6c 에 포함** — 코드 작업 0 + SSH 1번 + 외삽 그래프 분석. 6c 의 "운영 안정성 일괄 점검" 성격에 자연 매칭. 메모리 곡선이 평탄화 안 하면 별도 deferred 신설로 후속 처리.
> 5. **scope 경계 강제** — Magic link / `/admin` Tier1+2 / rate-limit / English UI 고지 / `[3-48]` funding 단위 / canonical metrics docs 는 **전부 M1.7 영역**, 6c 의 security 감사가 발견하더라도 즉시 deferred 등록 후 본 Step 에서는 손대지 않음.

**총 예상**: 15~21h (3~4일). M1.5 와 비슷한 호흡.

**스코프 경계 (M1.6 공통)**:
- 소셜 로그인 (Google/GitHub) — Launch Readiness `§L.4` 이월. 이메일 1개만 필수.
- 상세 설명 금지 — 각 Step 완료 시 `task-record/M1.6-stepN-*.md` 가 상세 맡음. ROADMAP 은 링크만.

**비전공자 설명**
"집에 출입증 시스템을 다는 단계". 이 단계 이후부터는 누가 무엇을 했는지 블랙박스에 남습니다.
이 로그는 이후 확장 루프에서 "복잡한 쿼리일 때 Sonnet을 호출할지 말지" 판단 기준 데이터로 쓰입니다. **M1에서 쌓아두지 않으면 나중에 못 쓰는 데이터**이므로 지금 넣어둡니다.

---

### M1 완료 선언 조건 — ✅ **2026-05-04 달성**

M1.1 ~ M1.6 의 모든 완료 기준을 충족한 시점에 M1 완료. **2026-05-04 M1.6 Step 6 마무리로 모든 조건 충족 — M1 공식 완료 선언**:

- ✅ "말로 화면을 조립한다"는 핵심 비전이 **로컬 환경에서 엔드투엔드**로 증명됨 (실서버 이전은 Launch 단계). M1.5 Step 4 Playwright 5/5 PASS + M1.6 Step 6 가입→로그인→`top gainers` 쿼리→CoinListCard 20 row 정상 렌더 종단 검증.
- ✅ 4개 레지스트리 패턴이 실제로 작동 (Binance USDM/COINM/SPOT 4개 거래소 path + ticker/coin-list/kline-chart 3 컴포넌트 + 9 datasource + spawn 인터랙션 1종).
- ✅ `dataService` 추상화 레이어가 모든 데이터 접근을 통제 (M1.6 Step 3 도입 + Step 6c W-1 회수로 `initialFetch` helper 단일 choke point 복원, supabase.from() 직접 호출 0건).
- ✅ 로깅·인증·RLS·CI 검증 모두 동작 (log_chat 13 컬럼 / log_behavior 5 컬럼 / log_validation_failure 확장 / RLS 13 테이블 100% / `pnpm rls-check` baseline 13 OK / Supabase Auth 이메일+비밀번호 / proxy.ts 두 겹 방어).
- ✅ Hetzner 24/7 Linux 워커 (M1.7 Step 0) 130h+ 무재부팅 + Memory 평탄화 +0.9 MB/h (1개월 외삽 33% 사용 = OOM risk 0%).

**M1 완료 후 활성화된 후속 흐름** (갱신: 2026-05-18 사용자 결정, `docs/M2-plan.md`):
1. **`[9-9]`/`[9-10]` 사용자 직접 실사용 피드백 단계** — 사용자(바이낸스 선물 3년차 트레이더) 가 본인 트레이딩 워크플로우에 TRAVIS 끼워 사용. crypto-trader 자문이 advisory 로 모아둔 8개 관찰 (카드 타이틀 톤 / Top N 필터 / empty UX / 로딩 피드백 / volume 모호성 / 톤 일관성 등) + Q1~Q3 + Step 0.1 관찰 6~8 — **실데이터 기반 우선순위 판단**. 자세한 항목 목록은 `docs/deferred-task.md §9 [9-9]/[9-10]` 참조.
2. **Launch Readiness Checklist 인지** — `docs/ROADMAP.md §L` (L.1~L.4) 훑어보기. 아직 Launch 시점이 아니더라도 체크리스트 존재 자체를 확인하면 확장 루프에서 무엇을 챙겨야 할지 가시화.
3. **다음 마일스톤 = M2 확장 루프** (2026-05-18 사용자 결정으로 M1.7 Step 1~6 건너뛰고 직행, `docs/M2-plan.md`). **선행 fix 1건**: `[3.5-7]`(`[3-48]`) funding/OI 단위 변환 — misread 차단 목적. **M1.7 Step 1~6 보류**: auth allowlist / admin Tier 1+2 / rate-limit / Magic link / security audit 는 외부 베타 손님 받기 결정 시점에 활성화 (`docs/ROADMAP.md §M1.7` 본문 보존).

**M1 통계**:
- **소요 기간**: 2026-04 (~M1.1 시작) ~ 2026-05-04 (M1 완료) — 약 3주
- **총 commit ~50건 + Step 27개** (M1.1~M1.7 Step 0 포함)
- **테스트 커버리지**: vitest 98 (apps/web) + 25 (packages/shared) = **123 통과**
- **회수 deferred 65건+ / 신규 잔여 81건** (M2+ 25 / Launch 22 / 미결정 10 / M1.7 8 / M1.6 잔여 16)
- **자문 횟수**: zod / nextjs / backend / crypto-domain / ai-orchestrator / security / code-reviewer / crypto-trader / roadmap-mm / genagent — 10 서브에이전트 누적 100+ 호출

**M1 종료 직후 권장 작업**: 
- `docs/task-record/M1-complete.md` 한 번 통독 (M1 핵심 의사결정 + 산출물 + 미완료 deferred 관리)
- `docs/ROADMAP.md §L` Launch Readiness Checklist 훑어보기

### M1 완료 후 사용자 실사용 피드백 원칙 (2026-04-22 사용자 방침 신설)

**원칙**: M1 완료 후 사용자(바이낸스 선물 3년차 트레이더)가 **직접 TRAVIS 를 본인 트레이딩 워크플로우에 끼워 넣어 사용** 하면서 수집한 실피드백을 기반으로 제품 UX 판단을 재평가합니다. 선제 튜닝 금지.

**적용 대상 (M1 중 의도적 유보)**:
- 카드 타이틀 톤 (Haiku 자연어 생성 vs 트레이더 친숙 표기)
- CoinListCard Top N 기본 필터 스코프 (USDT-only vs 전체 진실) — 현재 "전체 진실 유지" (crypto-trader Q1 / `docs/deferred-task.md [4-19]`)
- empty 응답 UX 힌트 강도 — 조용한 실패 vs 한국어 가이드 (crypto-trader Q2 / `[4-20]`)
- 로딩 중 시각 피드백 수준 — disabled only vs dot 3개 (crypto-trader Q3 / `[4-21]`)
- 응답 지연 4초대 체감 수용 가능 여부
- 레이아웃 기본값, 카드 크기, 색 대비 등 디자인 디테일
- 좌측 "My Views" / 우측 "세션 채팅 기록" 패널 우선순위 (PRD §5 기반)

**왜 M1 중 하지 않나**: M1 은 "자연어 → AI → 실데이터 카드" 수직 슬라이스 증명이 목적. 제품 UX 튜닝은 **실사용 데이터가 있어야만 유효한 판단** 가능 (YAGNI). crypto-trader 서브에이전트 자문은 "가설 제안" 수준이고, 사용자 본인 트레이딩 상황에서의 실체감이 궁극 기준.

**실행 방식**: M1 종료 시 `docs/task-record/M1-complete.md` 에 "UX 피드백 체크리스트" 를 모아 두고, 사용자가 실사용 중 느낀 점을 항목별로 기록. 축적된 피드백을 기반으로 확장 루프 카테고리 / 우선순위 판단. 자세한 이월 항목 목록은 `docs/deferred-task.md §9 [9-9]` 참조.

**CLAUDE.md 정합**: "제품 판단은 내 의견 존중해줘" 원칙의 M1 이후 구체화.

---

### M1.7 — Closed Beta Ops (2026-04-25 신설)

> **🚨 사용자 결정 (2026-05-18, `docs/M2-plan.md` §선행 의사결정)**: M1.7 Step 1~6 **보류, M2 직행**. 본인 단독 실사용 단계에선 베타 게이트 (allowlist / admin / rate-limit) 불필요. 외부 베타 손님을 받을 시점에 본 §M1.7 Step 1~6 활성화. Step 0 (Hetzner 이전) 은 환경 사고 차단 목적으로 이미 ✅ 완료 (2026-05-03). 단, `[3.5-7]` funding/OI 단위 변환은 misread 차단 차원에서 **M2 진입 전 선행 처리** (`docs/M2-plan.md §Step 1`).
>
> **상태**: Step 0 ✅ 완료 (2026-05-03) / Step 1~6 📋 보류 (외부 베타 진입 시 활성화).
>
> **본 §M1.7 본문 유지 이유**: 산출물 / 완료 기준 / Step 표 / Substep / 영어 정책 / 비전공자 설명 / 문서 일괄 정리 방침은 외부 베타 진입 시 그대로 활용해야 하므로 보존. 본 박스 외 본문은 미변경.

**목표**
클로즈드 베타 운영에 필수적인 3가지 — **게이트(allowlist) + 운영 도구(admin page) + 비용 상한(rate limit + UI 고지)** — 을 확보한다. M1 에서 만든 로그인은 dev 내부용이라 공개 가입이 열려있고 admin 부재 → 실사용자를 받는 순간 Anthropic 비용/운영 무방비 상태.

**선행**: M1.7 Step 0 만 M1 직전 환경 사고 차단 차원에서 진행됨 (2026-05-03 ✅). Step 1~6 은 외부 베타 진입 트리거 시 활성화 — 사용자 결정 (2026-05-18, `docs/M2-plan.md`).

**🚨 진행 순서 예외 (옵션 A 확정, 2026-05-02 사용자 재결정)**: 환경 사고 (Windows USDM fstream stuck + 사용자 컴퓨터 종료 시 DB stale) 로 **M1.7 Step 0 (Hetzner 24/7 이전) 만 M1.6 Step 5/6 보다 먼저 진행**. 나머지 Step 1~6 (auth/admin/rate-limit/Magic link/security audit/funding 단위) 은 본 마일스톤 원칙대로 M1 완료 선언 이후. 전체 순서:

```
M1.7 Step 0 (Hetzner 이전) ─── ✅ 완료 (2026-05-03, Substep 0.6 시나리오 B mini 유지 채택)
   ↓
Step 0 한정 docs 반영 (task-record/ROADMAP/deferred 진행 표기, 청소는 X) ─── ✅ 완료 (2026-05-03)
   ↓
M1.6 Step 5 (CI RLS + orchestrateOnce + RTL mock) → Step 6 (M1 완료 선언) ─── 다음 진행
   ↓
M1.7 Step 1~6 (auth/admin/rate-limit/Magic link/security audit/funding 단위)
   ↓
M1.7 전체 완료 후 docs 일괄 청소 (Phase A/B/C, 본 섹션 §line 785~795)
```

→ 옵션 A 의 핵심: "Step 0 wall clock 동안 M1.6 병행 안 함". 사용자 명시 결정 (2026-04-29 Q9 + 2026-05-02 옵션 A 재확인) — 한 번에 하나의 작업 원칙 + Step 6 의 M1 완료 선언이 Step 0 의 24h 데이터 + Phase A 평가에 부분 의존하므로 분리 유지가 깔끔. 상세: `docs/task-record/M1.7-step0-hetzner-migration.md` §📅 전체 진행 순서.

> **후속 결정 (2026-05-18, `docs/M2-plan.md`)**: 위 시나리오는 M1.6 완료까지 적용됐고 (Step 6 commit 77f6ec3, 2026-05-04), 이후 사용자가 "M1.7 Step 1~6 건너뛰고 M2 직행" 으로 결정. 따라서:
> - `M1.7 Step 1~6` 박스 → **"외부 베타 진입 시 활성화"** 로 보류
> - `M1.7 전체 완료 후 docs 일괄 청소` 박스 → **"M2 진입 직전 docs 정리"** 로 시점 이동 (`docs/M2-plan.md §Step 4`)
> - `[3.5-7]` funding/OI 단위 변환은 선행 fix (`docs/M2-plan.md §Step 1`)

**산출물**

- `user_allowlist` 테이블 + signup 직전 게이팅 (이메일 화이트리스트, service_role 경유 server action)
- `auth.users.app_metadata.role` 기반 admin 권한 (service_role 만 수정 가능 → 권한 상승 공격 원천 차단, JWT claim 에 embed → middleware/RLS 가 DB round-trip 0회로 즉시 판정)
- `/admin` Next.js route — 7개 기능 (Tier 1 필수 5 + Tier 2 동시 착수 2)
  - **Tier 1 (필수 5)**: 유저 목록 (email / 가입일 / 마지막 활동 / 7d 쿼리수 / status) / Allowlist CRUD / 오늘의 요약 대시보드 (신규가입·활동유저·Haiku 호출수·실패율·예상비용) / Kill switch (유저별 Disable 토글) / 월 Haiku 예산 progress bar (80% 시 경고)
  - **Tier 2 (동시 2)**: 유저 상세 페이지 (최근 10 쿼리 + 카드 분포 + 재시도·refusal 카운트) / Validation failure feed (최근 20건 + 원본 쿼리 + Zod 에러 — 개발자 디버그용)
- `/api/orchestrate` 유저별 일 rate limit — `DAILY_HAIKU_LIMIT_PER_USER` env 로 조절 (**구체 한도는 단계별로 차등 운영**, 실사용 데이터를 바탕으로 단계마다 다르게 결정. 초기 예시값 ~100 call / day / user 수준이나 확정값 아님), admin role 은 `DAILY_HAIKU_LIMIT_ADMIN` env (사실상 무제한). **비용 직관 (초기 예시 기준)**: 단가 ~$0.0035/call × 100 call/day/user = 일 $0.35, 베타 10명 × 30일 = 월 $105 상한.
- **UI 사용량 고지 2종 (English-only, `project_english_only_global` 정책 엄수)**:
  - (a) ChatInputBar 상단 또는 UserMenu 영역에 `"42 / {daily_limit} queries today"` 상시 표기 — 실시간 갱신
  - (b) 429 도달 시 토스트 `"You've reached today's query limit ({daily_limit}/day). It resets at 00:00 UTC."`
- Supabase `Confirm email` ON (Dashboard 토글) + Magic link 병행 — 비밀번호 분실 회복 경로 (`signInWithOtp`)
- `@security-auditor` 종합 감사 — closed beta 신규 개방면 (`/admin` + allowlist API + JWT admin claim + rate limit + Magic link) 전수

**완료 기준**

- [ ] 미초대 이메일로 signup 시도 → `"Not invited to the beta yet."` 영어 에러
- [ ] 비-admin 유저가 `/admin` 접근 → 404/403
- [ ] rate limit 초과 유저가 호출 → 429 + 영어 토스트 `"You've reached today's query limit ({daily_limit}/day). It resets at 00:00 UTC."`
- [ ] 정상 유저 UI 에 남은 쿼리 수 영어 고지 실시간 표시 (`"42 / {daily_limit} queries today"`)
- [ ] admin 페이지에서 오늘 총 Haiku 호출 수 + 실패율 + 월 예산 소진율 한눈에 확인
- [ ] admin 이 특정 유저 `Disable` 토글 → 그 유저의 다음 `/api/orchestrate` 호출 즉시 401
- [ ] 가입 시 Supabase confirm email 링크 수신 → 클릭 후 활성화
- [ ] Magic link 요청 → 이메일 링크 클릭으로 비밀번호 없이 로그인 성공
- [ ] funding_rate 카드 표시가 거래소 사이트 % 와 일치 (raw decimal × 100, 예: 0.0001 → `"0.0100%"`)
- [ ] open_interest USDM/COINM 단위가 카드 헤더에 명시 (`BTC` / `contracts`)
- [ ] crypto-trader 3 persona 검증 통과 (단위 misread 우려 0)
- [ ] Hetzner Linux worker 24/7 가동 — 1주일 staleness 5초 이내 일관 유지 (`[3.5-8]` 회수)
- [ ] USDM `!ticker@arr` (full 17필드) 복귀 — Windows 환경 특수 사고 (`fstream.binance.com` selective stuck) Linux 에서 자연 해결 검증 (`[3-50]` 회수)

**Steps (M1.6 완료 후 분해 예정)**

| Step | 내용 (한 줄) | 예상 |
|---|---|---|
| **Step 0** ✅ | **Hetzner Linux worker 24/7 이전** (`[3.5-8]` 회수) — **2026-05-03 완료** (CPX22 / Nuremberg / 83h 무재부팅 가동 입증). Substep 0.1~0.5 ✅ + 0.6 시나리오 B mini 유지 채택 (skip). **24h 누적 6 dump (May 1 18 ~ May 3 06 UTC)**: 사용자 카드 staleness **0~2초 [OK]** (사이트=DB 1초 일치 ✅, 6 dump 일관) + NRestarts 0 + Memory 11.9% + CPU 5.3%. USDM stale events ~453회/6h = 시간대 무관 ±0.66% 일관 → **Binance fstream server-side ping 가설 confidence 95%+** 도달 = 클라이언트 변경으로 해결 불가능. **deferred 처리**: `[3.5-8]`/`[3-51]`/`[3-52]` ✅ 회수 + `[3-50]` (full 17필드 복귀) M2+ 이월 (server-side 문제이므로 client mini→full 전환 의미 없음). 베타 가용성 확보 — M1.6 Step 5/6 진행 가능 | 7h 활성 + 83h wall clock |
| **Step 1** | `user_allowlist` 테이블 + signup 직전 게이팅 (Edge Function 또는 server action) | 2~3h |
| **Step 2** | `app_metadata.role="admin"` 주입 + `/admin` route 보호 (middleware matcher 확장 + JWT claim 판정) | 1~2h |
| **Step 3** | `/admin` 페이지 구현 — Tier 1 5개 + Tier 2 (#6 유저 상세 / #10 failure feed) 총 7개 기능 | 5~7h |
| **Step 4** | `/api/orchestrate` 유저별 일 rate limit + UI 고지 2종 (English-only) | 2~3h |
| **Step 5** | `Confirm email` ON + Magic link 활성화 + `@security-auditor` 종합 감사 | 2~3h |
| **Step 6** | **funding_rate / open_interest 카드 단위 변환** (raw decimal → % / USDM·COINM 단위 분기 명시) + crypto-trader 3 persona 검증 — `[3-48]` / `[3.5-7]` 회수 (2026-04-28 crypto-trader Q3 권고로 우선순위 승격) | 2~3h |

##### Step 0 Substep 분해 (2026-04-29 사용자 결정 확정)

> **목적**: Windows 환경 USDM `fstream.binance.com` selective stuck 등 기존 사고 근본 차단 (베타 배포 자체는 사용자가 나중에 직접 진행). 사용자(비전공자, Hetzner 처음) 가 직접 해야 하는 외부 액션 (계정/결제/SSH) 과 Claude 가 진행할 코드/문서 작업을 명확히 분리.

> **🎯 사용자 확정 결정 (2026-04-29 → 2026-04-30 라인업 갱신 반영)**:
> - **Plan**: **CPX22** (2 vCPU AMD shared / 4GB RAM / 80GB NVMe SSD / 20TB 트래픽) — **$9.49/월 (서버) + $1.90 (Backup) + $0.60 (IPv4) = $11.99/월 + VAT 19%** (≈ $14.27/월). Hetzner 2026-04-30 라인업 갱신으로 CPX21 (3 vCPU / €11.99) → CPX22 (2 vCPU / $9.49) 자연 대체. 베타 100명 이하 가성비 최적 — Node single-threaded 라 2 vCPU 충분 (Binance WS + Supabase upsert + REST 폴링 모두 비동기 I/O).
> - **위치**: **Nuremberg DE** — 2026-04-30 인스턴스 생성 시점 Falkenstein 일시 수요 포화로 **같은 eu-central 의 Nuremberg 자연 대체** (약 200km 거리, latency < 3ms, 동일 가격/트래픽/Backup 호환성). 해외 타겟 글로벌 평균 latency 최저 + 20TB 트래픽 안전 원칙 그대로 충족.
> - **Backup**: **ON** (+$1.90/월 = 20% 추가) — 자동 일일 백업 7일 보관.
> - **OS**: **Ubuntu 24.04 LTS** (2026 시점 최신 LTS, Node 22 호환).
> - **합계**: **$11.99/월 + VAT 19%** (≈ $14.27/월) ≈ ₩19,500/월. 연간 ~$171 (+VAT) ≈ ₩235,000.
> - **승급 트리거** (베타 100명 이후): CPU 평균 >60% 또는 RAM >75% 또는 WS event loop lag >50ms 시 **CPX32** (4 vCPU AMD $16.49/월) 또는 **CCX13** dedicated 로 마이그레이션.

| Substep | 내용 (한 줄) | 책임 | 예상 |
|---|---|---|---|
| **0.1** | **사전 계획 + Hetzner 계정·결제 카드·SSH 키페어 준비** — 사용자 가이드 (Hetzner Cloud 가입 → 결제 카드 등록 → Windows PowerShell `ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\travis_hetzner` → 공개키 `travis_hetzner.pub` 내용 Hetzner Console **Security → SSH Keys** 에 업로드). Claude 는 Plan 비교표 (CPX22 vs CPX32 vs CCX13 vs CAX22) + 가격 조정 반영 + 가성비 분석 작성. **검증**: 사용자가 Hetzner Console 에서 SSH 키 등록 완료 화면 + Project 생성 (예: `travis-prod`) | 사용자 (계정/결제/키 생성/Project) + Claude (Plan 비교표) | 30~45m |
| **0.2** | **Hetzner Cloud 인스턴스 프로비저닝 + 초기 hardening** — 사용자가 Hetzner Console 에서 **CPX22 + Ubuntu 24.04 + Nuremberg + SSH 키 선택 + Backup ON** 으로 인스턴스 생성 (2026-04-30 라인업 갱신: CPX21→CPX22, Falkenstein 일시 포화→Nuremberg 자연 대체). Claude 는 **초기 설정 스크립트 1개** 작성 (`apps/worker/deploy/hetzner-bootstrap.sh`) — `apt update && apt upgrade -y` + `ufw default deny incoming + allow 22/tcp + enable` + `unattended-upgrades` + `fail2ban` + non-root user `travis` (sudo 그룹) + SSH 키 복사. 사용자가 PowerShell 에서 `ssh -i ~/.ssh/travis_hetzner root@<IP>` 접속 후 스크립트 1회 실행. **검증**: `ssh -i ~/.ssh/travis_hetzner travis@<IP>` 비밀번호 없이 접속 성공 + `sudo ufw status` 가 `22/tcp ALLOW` 만 표시 + `sudo systemctl status fail2ban` active | 사용자 (인스턴스 생성·SSH 접속·스크립트 실행) + Claude (스크립트 작성) | 45~60m |
| **0.3** | **Node 22 LTS + pnpm + Git 설치 + repo clone + 환경변수 분리** — Claude 가 `hetzner-runtime-setup.sh` 작성 (`curl -fsSL https://deb.nodesource.com/setup_22.x \| bash -` + `apt install -y nodejs build-essential` + `npm install -g pnpm@9` + `git clone <repo> /opt/travis` + `pnpm install --frozen-lockfile`). 사용자가 GitHub Deploy Key 발급 (Claude 가 절차 가이드 — `Settings → Deploy keys` 클릭 경로, repo 한정 read 권한). `/etc/travis/worker.env` 신규 파일 — `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `ANTHROPIC_API_KEY` 등을 사용자가 PowerShell `scp` 로 업로드 (root:travis 0640 권한 — journald 로그 노출 차단, `.gitignore` 사전 확인). **검증**: `cd /opt/travis/apps/worker && pnpm build` 성공 + `node --version` v22 + `pnpm --version` v9 + `ls -la /etc/travis/worker.env` 가 `0640 root:travis` | 사용자 (Deploy Key 발급·.env scp) + Claude (스크립트·.gitignore 가드) | 1~1.5h |
| **0.4** | **systemd `travis-worker.service` 등록 + 자동 재시작 + 로그 회전** — Claude 가 `apps/worker/deploy/travis-worker.service` 작성 (`Type=simple` + `Restart=always` + `RestartSec=5` + `User=travis` / `Group=travis` + `WorkingDirectory=/opt/travis/apps/worker` + `EnvironmentFile=/etc/travis/worker.env` + `ExecStart=/usr/bin/pnpm exec tsx src/index.ts` + `MemoryMax=3G` + `LimitNOFILE=65536` + `StartLimitIntervalSec=300` / `StartLimitBurst=10`) + journald rotate 설정 (`/etc/systemd/journald.conf` `SystemMaxUse=500M`). 사용자가 `sudo systemctl daemon-reload && sudo systemctl enable --now travis-worker` 실행. **검증**: `sudo systemctl status travis-worker` 가 `active (running)` + `journalctl -u travis-worker -n 50` 에 Binance WS connected + Supabase upsert 로그 정상 흐름 | 사용자 (systemctl 명령 실행) + Claude (.service 파일 + journald 설정) | 1~1.5h |
| **0.5** | **첫 24h 모니터링 (수동) + Windows 로컬 worker 정지 + DNS 미변경 확인** — Hetzner worker 만 단독 가동 시작. 사용자가 Windows 로컬 worker 프로세스 종료 (베타 배포는 나중이므로 Vercel `apps/web` 의 Supabase URL 변경은 **불필요** — Hetzner worker 도 같은 Supabase 에 쓰므로 자동 일치). 24h 동안 매 6h 마다 (a) `journalctl -u worker --since "6h ago" | grep -i error` (b) Supabase Dashboard `now_*` 테이블 `updated_at = now() - 5초 이내` 확인 (c) Hetzner `htop` 으로 CPU/RAM 확인. Claude 는 모니터링 SQL 4개 + 체크리스트 작성. **검증**: 24h 후 (a) USDM staleness `MAX(now() - updated_at) < 10s` (b) error 로그 0~소수 (c) 재시작 횟수 0 | 사용자 (24h 6h 간격 수동 점검) + Claude (체크리스트·SQL) | 1~2h (실제 24h 경과는 wall clock) |
| **0.6** | **`!ticker@arr` (full 17필드) 복귀 시도 + 검증 + ticker24hrBatchTask 제거 + perMessageDeflate 환경별 검증 기록** (`[3-50]` / `[3-51]` 회수) — Claude 가 `tickerWsHandler.ts` `canHandle` 를 mini → full 로 1줄 전환 PR + `ticker24hrBatchTask.ts` 삭제 + 사용자 컨펌 후 Hetzner 에 `git pull && pnpm build && sudo systemctl restart worker`. 24h 재모니터링 — SPOT 1408 + USDM 608 stall 재발 여부. 정상 시 `task-record/M1.7-step0-hetzner-migration.md` 에 환경별 비교표 (Windows mini stale 1분 / Hetzner full 1초 일치) 기록 + Architecture.md §데이터 경로 A 에 "Binance WS 는 perMessageDeflate=false 가 표준" 명문화. 실패 시 mini 유지 + ticker24hrBatchTask 복원 + deferred 사유 기록. **검증**: BTCUSDT 사이트 +X.XX% = DB `price_change_pct` 일치 (도메인 검증) + USDM 608 심볼 stall 0 | Claude (코드·docs) + 사용자 (Hetzner 재시작 명령·24h 후 사이트 비교) | 1.5~2h (재모니터링 24h wall clock) |

**총 예상**: 6~8.5h 작업 시간 + 24h × 2회 wall clock 모니터링. 당초 ROADMAP 추정 4~6h 보다 1.5~2.5h 상향 — 사용자 Hetzner 첫 사용 학습 곡선 + .env scp 절차 + 24h × 2회 검증 윈도우 반영.

> **Step 0 스코프 경계 (절대 섞지 말 것)**:
> 1. **다음 Step 으로 미루기**: allowlist 게이트 (Step 1) / admin role JWT (Step 2) / `/admin` UI (Step 3) / rate limit (Step 4) / Magic link + security audit (Step 5) / funding 단위 변환 (Step 6) — Step 0 안에서 절대 손대지 않음.
> 2. **DNS 도메인 연결 안 함**: 베타 배포는 사용자가 나중에 직접. Hetzner worker 는 Supabase 에 push 만 하므로 외부 도메인 불필요. `apps/web` (Vercel) 의 NEXT_PUBLIC_SUPABASE_URL 도 변경 없음.
> 3. **Vercel `apps/web` 환경 변경 안 함**: 같은 Supabase 인스턴스에 worker 만 위치 이동 — 프론트는 무관. 변경 시도 = scope creep.
> 4. **Step 0.6 실패 시 mini 유지가 정상 경로**: full ticker 복귀가 Step 0 완료 조건 아님. Hetzner 24/7 가동 자체가 본 Step 의 핵심. full 복귀는 환경 자연 해소 시 보너스.



**의존성**: M1.6 완료 (auth + `log_chat` + RLS).

**스코프 경계**
- 결제/구독 없음 (invite 로만 접근 제어)
- 소셜 로그인 없음 (Launch §L.1 유지)
- Tier 3 고도 기능 (Slack/이메일 알림 / A/B 플래그 per user / CSV export / 시간대 활동 히트맵 / in-app 피드백 인박스) 전부 M2+ 확장 루프로 이월

**영어 정책 재확인 (중요)**
M1.7 이 도입하는 모든 신규 UI 문자열(allowlist 거부 메시지 / rate limit 토스트 / 남은 쿼리 고지 / admin 페이지 전체 / Magic link UI) 은 `project_english_only_global` 정책상 **영어 only**. 한국어 표기 금지. 코드 내 주석은 기존 원칙대로 한국어 유지.

**비전공자 설명**
"집에 사람들을 초대하기 전에 **(0) 우리집 데이터 공급 라인을 24시간 안정 가동되는 사무실 빌딩으로 이전** (1) 초대장 관리대장 (2) 내 방 자물쇠 (3) CCTV (4) 수도계량기 (5) 수도꼭지 단위 라벨 — 6가지를 먼저 다는 단계". M1 이 '집이 제대로 지어졌는지' 증명이라면 M1.7 은 '손님 맞을 준비'. (0번 신규, 2026-04-28 M1.6 Step 4 hotfix 발견) 우리집 (사용자 Windows 컴퓨터) 에서 worker 돌리면 컴퓨터 끄는 순간 손님이 사용 중에 데이터 멈춤 + 일부 거래소 데이터 (USDM 선물 ticker) 가 우리집 ISP 환경에서만 selective 차단 — 데이터센터 (Hetzner Linux 24/7) 로 이전이 근본 해결. 손님 한 명이 실수로 수도꼭지를 계속 틀어놔도 전체 수도세 폭탄이 안 맞도록 사전 설계 + (5번 신규, 2026-04-28 crypto-trader 권고) 수도꼭지에 "0.0001L" 인지 "0.01%" 인지 표시 라벨이 없으면 손님이 자기도 모르게 잘못 읽어 펀딩비 0.05% 를 0.0005% 로 오해 → 일수익 1% 트레이더의 15% 잠식. 베타 손님 신뢰는 첫 misread 한 번에 무너지므로 미리 단위 라벨링.

**M1.7 완료 후 문서 일괄 정리 방침** (2026-04-25 사용자 결정)

M1.7 완료 직후 **별도 commit 1회** 로 문서 정리 수행. M2 착수는 이 정리 이후.

- **Phase A — 청소 (1~2h)**: `docs/deferred-task.md` 에서 `✅ 회수 완료` 표기된 항목 전부 통째 삭제 (git log 가 증거 역할). §0 한 줄 요약 + §1 🔴 블록킹 섹션 최신화.
- **Phase B — 선별 반영**: 여러 항목이 한 Step 에 뭉쳐 "작업 단위" 성격이 바뀐 블록은 ROADMAP 해당 Step 본문으로 승격. 이번 `[3.5-1]`~`[3.5-6]` 이 M1.7 본문으로 녹아든 것이 표준 사례. 개별 구현 힌트·디버그 메모는 ROADMAP 으로 옮기지 않음 (ROADMAP 을 지저분하게 만드는 주원인).
- **Phase C — 원칙 강화**: deferred-task.md 는 "완료 시 즉시 제거" 살아있는 문서 원칙 재확인. ROADMAP 각 Step 표의 `회수: [X-Y]` 링크 형식 유지로 역추적성 확보.

**왜 "반영" 이 아니라 "정리" 인가**: ROADMAP (언제·무엇을) 과 deferred-task (연기된 개별 작업의 상세) 는 성격이 다른 별도 축. 기계적으로 합치면 더 지저분해짐. 지저분함의 진짜 원인은 "두 문서가 섞여서" 가 아니라 **"회수 완료 항목이 deferred-task 에 `✅` 로 계속 남아있어서"**. git history 가 이미 reverse 증거 역할을 하므로 완료 항목은 **삭제** 가 정답.

**왜 M1.7 직후 타이밍인가**: M1.7 이 새 `[3.5-x]` 블록을 추가하는 동안 기존 `[3-12]`~`[3-17]` 등은 M1.6 내에서 회수될 예정. M1.7 완료 시점이 가장 자연스러운 "clean slate" 경계 — M2 확장 루프는 이 정리된 상태에서 시작해야 7단계 확장 루프가 **"지금 미완료된 것만 보면 되는"** 얇은 대장으로 유지됨.

---

### M1.8 — 선물 데이터 카탈로그 완성 + 사이트=DB 진실 일치 강화 (2026-05-24 신설)

> **상태 (2026-05-28)**: ✅ **M1.8 완료 선언** — 종단 게이트 G1~G5 전부 통과. Step 0/1/2a/4/5 + 8.3a + 8.3b ✅ + D20-D22 ✅ + 8.4-e spot full ticker fix ✅ + **종단 게이트 FG-1~FG-8 ✅** (G1 13셀 site=DB 사용자 육안 검증 + NULL 비율 + PHAROSUSDT 4h 식별 ∥ G2 자동게이트 **216 test PASS** + dry-run 6항목 → G3 3 자문 **0 Critical** → G4 deferred 묘비 일관성 → G5 M1.8-complete.md). 8.3c ⏭️ **M1.8.5 이월** (`[8-15]`). 63셀 시계열 검증도 M1.8.5 이관. **단일 진실: `docs/task-record/M1.8-complete.md`** + `docs/task-record/M1.8-final-gate.md`.
>
> **세션 재개 단일 진실 원천**: **`docs/task-record/M1.8-RESUME-PLAN.md`** — `/clear` 후 가장 먼저 Read.
>
> **선행**: M1 ✅ (2026-05-04) / M1.7 Step 0 ✅ (2026-05-03) / M2-plan §Step 0 docs 정리 ✅ (2026-05-20). **M2-plan §Step 1 (funding/OI 단위 hotfix) 는 본 §M1.8 §8.5 로 흡수 처리** — M2-plan 본문 deprecation 박스 + 보존.
>
> **사용자 결정 D1~D14 (2026-05-23 ~ 2026-05-24)**: 모두 권장안 채택 (D12 만 보류 → deferred `[8-2]` 등재). 자세한 의사결정 근거는 `docs/task-record/M1.8-step0-pre-infra.md §4`.
>
> **사용자 결정 D20/D21/D22 (2026-05-27)**: D20=**(C) 마일스톤 종료 후 별도 사이클** / D21=**(B) 6 metric (Basis 포함)** / D22=**(A) interval VARCHAR(5) 컬럼 ADD + PK 재구성** — 모두 권장안 채택. deferred `[8-12]/[8-13]/[8-14]` 묘비 처리. 자세한 근거는 `docs/task-record/M1.8-RESUME-PLAN.md §5`.
>
> **8.3c (β) 이월 확정 (2026-05-27)**: 8.3c 전체 (schema migration + fetcher 6종 + normalize + loop + 실 backfill ~2.97h ~25M row) 가 본 마일스톤 안에서 진행되지 않고 **"M1.8.5 history backfill"** 별도 사이클로 이월. 본 마일스톤 = 종단 게이트로 직행. deferred `[8-15]` 신규 등재. 단일 진실 원천: `docs/task-record/M1.8-step3-history-backfill.md §5.4`.
>
> **본 마일스톤 핵심 단서 (2026-05-24 사용자 실측)**: (a) Binance USDM 사이트 우상단 박스 "funding(4h) / Countdown" 의 큰 숫자가 **실시간 변동** — predicted next funding rate 인 것을 docs + WS 거동 검증으로 확정. (b) PHAROSUSDT 가 4h funding 코인 실측 케이스 — `/fapi/v1/fundingInfo` endpoint 로 `fundingIntervalHours: 4` 식별 가능.

**목표**

Binance USDM/COINM 사이트가 보여주는 **모든 선물 지표 (7종) × 모든 인터벌 (9종) = 63 셀** 을 DB 와 표시 헬퍼에 정확 동일 정밀도로 노출. SPOT now_spot_ticker 60% NULL stale row 정리 + `docs/canonical-metrics.md` 신설 + funding rate predicted/realized 컬럼 분리. CLAUDE.md §위생 #9 "사이트 = DB 진실 일치 원칙" 의 **첫 마일스톤급 적용**.

**산출물**

- **Schema migration (4 ALTER)** — `now_futures_indicator` `last_funding_rate` → `predicted_funding_rate` rename + `last_settled_funding_rate` / `last_settled_funding_time` / `basis` / `basis_rate` / `annualized_basis_rate` ADD + `symbols.funding_interval_hours` ADD + `history_futures_indicator` 동일 정합
- **worker 3 fetcher 신설** — `fetchTopLongShortPositionBatch` / `fetchGlobalLongShortAccountBatch` / `fetchBasisBatch` + `fetchFundingInfo` (24h 캐싱) + `perSymbolTask` 통합
- **`historyBackfillTask`** — 8.3a ✅ dry-run mode 신설 (실 호출 X, 시뮬레이션만) + 8.3b ✅ worker bootstrap 등록 + Hetzner 실 가동 검증 (06:47:47 UTC since, 5분당 1회 시뮬레이션 출력). 실 backfill 진입 (D20=C + D21=B 채택으로 608 × 9 interval × **6 metric** ≈ **33K REST**, 14일 lookback, ~25M row, ~2.97h, ~2.5GB) 은 **M1.8.5 별도 사이클로 이월** (8.3c (β) 결정 2026-05-27).
- **SPOT stale cleanup** — `now_spot_ticker` non-TRADING 2185 행 DELETE + worker upsert TRADING 사전 필터
- **`apps/web/lib/format/marketUnits.ts`** — `formatPrice` (tick_size 기반 소수점) / `formatFundingRate` (raw → percent + interval 라벨) / `formatLSR` / `formatOI` (USDM=base/COINM=contracts) / `formatBasis` / `formatBasisRate` / `formatCountdown`
- **`docs/canonical-metrics.md`** 신설 — 7 metric × 9 interval × 단위 × 정밀도 × 사이트 URL 매트릭스 + PHAROSUSDT 4h smoke case
- **docs cross-link 일괄 갱신** — PRD §6/§8 / Architecture §2/§6/§7 / DB_SCHEMA / M2-plan §Step 1 흡수 / deferred-task / future.md
- **`@crypto-domain-expert` description 강화** — "canonical metrics definition (predicted vs realized funding / Basis formula / LSR Accounts vs Positions vs Global)" 명문 추가 + 메모리 신설 (D5 권장안)

**완료 기준 (종단 게이트)** — 2026-05-28 재서술 (8.3c (β) M1.8.5 이월 정합 / `@roadmap-milestone-manager` + `@crypto-domain-expert` 교차 자문)

- [x] **G1 — 13 셀 사이트=DB 일치 (현재 스냅샷)** ✅ (2026-05-28 FG-1, 사용자 육안 검증 통과) — Binance USDM BTCUSDT `canonical-metrics.md §5` 13 행 일치 확인. 1회 스냅샷 검증 (지속 검증은 실사용 M2-plan §Step 2 + `[8-1]` 자동 probe M2+). **전체 63 셀 (7 metric × 9 interval 시계열) 검증은 history backfill 과 함께 M1.8.5 (`[8-15]`) 로 이관** — `history_futures_indicator` 9-인터벌 데이터가 M1.8 시점 미존재. `M1.8-final-gate.md §FG-1`
- [x] **G1 — PHAROSUSDT 4h funding 자동 식별 smoke** ✅ (2026-05-28 FG-2) — PHAROSUSDT 는 symbols 미등재(`[]`, 24h reload fallback 적용, 비블록킹) 이나 **4h 자동 식별 메커니즘 입증**: USDM 712 중 4h=429/8h=158/null=123 (canonical 예상치 초과). `M1.8-final-gate.md §FG-2`
- [x] **G1 — NULL 비율** ✅ (2026-05-28 FG-2) — `now_futures_indicator` (TRADING 608): top_ls_pos 0.3% / global_lsr 0.7% / basis 5.3% / basis_rate 5.3% (모두 <20%) + `now_spot_ticker` (1408) price_change_pct 0.0% (<5%, §8.4-e 효과). `M1.8-final-gate.md §FG-2`
- [x] **G2 — dry-run 시뮬레이션 6 항목 100% 일치** ✅ (8.3b-2 검증 완료 + 2026-05-28 FG-4 worker 건강 DB 신선도 간접 재확인 — 608 심볼 / 27,360 REST / 20.5M row / 2.28h / 1.91GB / 10MB). live journal 재조회는 프로덕션 SSH auto-mode 차단으로 사용자 위임 (비블록킹). **실 backfill `rows > 50K` 검증은 M1.8.5 (`[8-15]`) 로 이관**. `M1.8-final-gate.md §FG-4`
- [x] **G2 — 자동 게이트** ✅ (2026-05-28 FG-3) — rls-check 13/13 OK (로컬 `.env.scripts` 누락 → Supabase MCP 동등 쿼리) / type-check 4 패키지 / lint web+worker / test **216 PASS** (web 128 + shared 25 + worker 63). `M1.8-final-gate.md §FG-3`
- [x] **G3 — 0 Critical** ✅ (2026-05-28 FG-5) — `@code-reviewer` **0 Critical** / `@security-auditor` **0 Critical** (read-only·secrets·RLS·dataService 4대 PASS) / `@crypto-trader` **단위 misread 우려 0** (13셀 도메인 정합). 비블록킹 발견 → deferred `[3-50]`/`[8-5]` 노트 추가 + `[8-16]`/`[8-17]` 신규. `M1.8-final-gate.md §FG-5`
- [x] **G4 — deferred 묘비 일관성 검증 (신규 회수 0건)** ✅ (2026-05-28 FG-6) — `[3-43]`/`[3-48]`/`[3.5-7]`/`[3-53]`/`[3-54]`/`[3-55]` §8.4/§8.5 묘비 ✓ + `[8-12~14]` D20-D22 묘비 ✓ + `[8-15]` 이월 entry ✓ + `[3-62]`(route.ts 분할) M1.8 미회수 ✓. **`[3-50]` 정합**: §8.4-e(G1 버그 fix 부산물)로 **spot 부분 회수** / USDM·COINM M2+ 이월 (FG-6 자체 신규 회수 0건 유지). `M1.8-final-gate.md §FG-6`
- [x] **G5 — 마일스톤 종료** ✅ (2026-05-28 FG-7/FG-8) — ROADMAP §M1.8 ✅ 마커 + PRD §6 + M2-plan §M1.8 흡수 이력 + `docs/task-record/M1.8-complete.md` 신설 + memory `project_m1_8_complete.md` 전환 + 7 docs 일관성. `M1.8-final-gate.md §FG-7/FG-8`

**의존성**: M1 ✅ / Hetzner 24/7 worker 안정 (M1.7 Step 0 ✅) / crypto-domain-expert 자문 ✅ (Step 0 완료)

#### Steps (2026-05-24 분해, `@roadmap-milestone-manager` 자문 채택)

| Substep | 내용 (한 줄) | 회수 deferred | 검증 기준 | 예상 |
|---|---|---|---|---|
| **8.0** ✅ | 사전 진단 (DB 5대 사실) + 3 자문 (genagent / roadmap-mm / crypto-domain-expert) + 실측 spike (Top LSR Pos / fundingInfo / PHAROSUSDT) + D5~D14 의사결정 + task-record 신설 + 본 ROADMAP §M1.8 적용 + crypto-domain-expert description 강화 | — | `docs/task-record/M1.8-step0-pre-infra.md` 신설 + 본 §M1.8 적용 + deferred 신규 6건 등재 | 1.75h ✅ |
| **8.1** | Schema migration — 4 ALTER (funding 분리 + basis ADD + funding_interval_hours + history 정합) + RLS 점검 | `[3-62]` (RLS check 확장 시 함께) | `list_tables` 신규 컬럼 확인 + `pnpm rls-check` 13 OK 유지 | 1~2h |
| **8.2a** ✅ | **2026-05-26 완료**. worker 신규 fetcher + fundingInfoTask (24h) + premiumIndexTask (30분) + perSymbolTask 통합 + unit test + rate-limit monitoring + 2 hotfix + Hetzner 3차 deploy + Supabase 검증. **8.2a-1 ✅** (worker 컬럼명 hotfix, `docs/task-record/M1.8-step1-hotfix-rename-funding.md`). **8.2a-2 ✅** (A~G + hotfix 2건 — `docs/task-record/M1.8-step2a-2-fetchers.md`). 검증: USDM 신규 9 컬럼 + symbols.funding_interval_hours 모두 데이터 흐름 활성화 (last_settled 100%, top_pos 99.7%, global 99.5%, basis 94.7%). BTCUSDT D15 역산 수학 정확 입증. 누적 commit 8건. | `[8-2]` annualizedBasisRate (보류 확정), `[8-10]` full rate-limit dispatcher (M2+), `[8-11]` partial update NOT NULL 함정 패턴 (상시 부채) | type-check + lint + test 63 PASS ✅ + Supabase 실측 검증 통과 + column does not exist 에러 0건 | 2~3h (실 ~3h) |
| **8.2b** | perSymbolTask 통합 + rate budget 24h 실측 (X-MBX-USED-WEIGHT-1M 모니터링) | — | `now_futures_indicator` basis/Top Pos LSR/Global LSR NULL 비율 < 20% + rate limit 위반 0건 + 안전 마진 ≥ 30% | 1~2h |
| **8.3a** ✅ | **2026-05-26 완료**. historyBackfillTask 신설 (~200줄) — 9 interval × 5 metric 상수 + dry-run mode (실 호출 X, 시뮬레이션만). worker bootstrap 등록은 8.3b 이월, 실 backfill 은 8.3c (사용자 결정 D20/D21/D22 후) — `docs/task-record/M1.8-step3-history-backfill.md` | — | type-check + lint PASS ✅ + dry-run 시뮬레이션 6 항목 (호출 수 / row 수 / 시간 / 용량 / 메모리 / 심볼 수) | 3~4h (실 ~1.5h) |
| **8.3b-1** ✅ | **2026-05-27 완료**. barrel re-export + worker bootstrap (`apps/worker/src/index.ts`) 에 historyBackfillTask 등록 (`dryRun: true` 안전 우회) + tradingSymbolsByMarket 공유 (§8.4-d 패턴) + type-check/lint PASS — `docs/task-record/M1.8-step3-history-backfill.md §5.2` | — | type-check + lint PASS ✅ + 5 task 등록 (perSymbol/ticker24hr/fundingInfo/premiumIndex/historyBackfill) | ~20분 |
| **8.3b-2** ✅ | **2026-05-27 완료**. git push + Hetzner git pull 12 commits Fast-forward (Hetzner 1.5 days deploy lag 해소) + systemctl restart (06:47:47 UTC) + journal 검증. 시뮬레이션 출력 6 항목 모두 **RESUME-PLAN 예측치 100% 일치** (608 symbols / 27,360 REST / 20,471,360 row / 2.28h / 1.91GB / 10MB). INTERVAL_MS=5분 정밀도 (300초 정확) + 다른 4 task 영향 0건 + dry-run 가드 (실 호출 0건) 모두 통과 — `docs/task-record/M1.8-step3-history-backfill.md §5.3` | — | 두 cycle 정상 출력 ✅ + 6 항목 예측치 100% ✅ + 다른 task 영향 0건 ✅ + 부팅 NRestarts 0 ✅ | ~30분 |
| **8.3c** ⏭️ **M1.8.5 이월** | **2026-05-27 사용자 결정 (β) 채택** — 8.3c 전체 (D22 schema migration + BinanceUsdmAdapter history fetcher 6종 [D21=B] + normalize 6종 + dryRun=false loop + 실 backfill ~2.97h ~25M row) 가 **"M1.8.5 history backfill"** 별도 사이클로 이월. M1.8 종단 게이트 후 진입 (D20=C). 본 마일스톤 중 historyBackfillTask 는 dry-run 5번째 task 영구 가동. 단일 진실 원천: `docs/task-record/M1.8-step3-history-backfill.md §5.4` + deferred `[8-15]` | `[8-15]` (M1.8.5 신규 entry) | — (본 마일스톤 범위 외) | M1.8.5 안에서 산정 (예상 ~7~9h) |
| **8.4** ✅ | **2026-05-26 완료**. SPOT stale row cleanup — non-TRADING DELETE + worker upsert TRADING 필터. **8.4-a ✅** ticker24hrBatchTask TRADING filter. **8.4-b ✅** Supabase Studio SQL Editor 로 3 테이블 non-TRADING DELETE (SPOT 3593→1408, futures_ticker 746→638, indicator 다시 638). **8.4-c ✅** Hetzner 4-5차 deploy. **8.4-d hotfix ✅** (markPriceWsHandler + premiumIndexTask 동일 함정 발견 후 fix — 시스템 전체 REST+WS allowlist 정합) — `docs/task-record/M1.8-step4-spot-cleanup.md`. | `[3-53]` ✅ 회수 (본 substep 가 직접 해결) | now_spot_ticker NULL 비율 100% 채움 ✅ + now_futures_indicator 638 유지 + ticker24hrBatchTask/markPriceWsHandler/premiumIndexTask 모두 TRADING 만 upsert | 1~2h (실 ~2h, 진단 + hotfix 포함) |
| **8.5** ✅ | **2026-05-26 완료**. 표시 단위 정공 — `marketUnits.ts` 8 헬퍼 + 카드 grep gate (raw toFixed 0건) + `docs/canonical-metrics.md` 신설 (~500줄, 9 섹션, 7 metric × 9 interval × 단위/정밀도 매트릭스) + docs cross-link 일괄 갱신. **8.5-a** marketUnits.ts 8 헬퍼 + test 30 case (commit `c11c335`). **8.5-b** TickerCard + CoinListCard 헬퍼 적용 + grep gate (동일 commit). **8.5-c** canonical-metrics.md 신설 (commit `e4e8082`). **8.5-d** docs cross-link + deferred 회수 5건 + 종단 (본 commit). | `[3-43]` ✅ / `[3-48]` ✅ / `[3.5-7]` ✅ / `[3-54]` 부분 ✅ / `[3-55]` ✅ 회수 5건 + `[3-50]` 보존 (server-side ping 가설 — M2+ 별개 영역) | unit test 30 case PASS + grep raw toFixed 0건 + canonical-metrics.md 7 metric × 9 interval 매트릭스 완성 + 5 deferred 묘비 처리 | 3~4h (실 ~3h) |
| **종단 게이트** | **G1** 13셀 현재스냅샷 수동검증(canonical §5)+PHAROSUSDT+NULL비율 ∥ **G2** rls-check/type-check/lint/test+dry-run 6항목 → **G3** code-reviewer/security-auditor/crypto-trader 0 Critical → **G4** deferred 묘비 일관성(신규 회수 0) → **G5** ROADMAP ✅+PRD §6+M1.8-complete.md+memory 전환 | (신규 회수 0건 — 묘비 검증만) | 본 §완료 기준 전체 ✅ + 7 docs 일관성 | ~4.5~6h |

**총 예상**: 14~22h (병렬 적용 시 critical path ~14h). Step 0 ✅ 완료로 잔여 ~13~20h.

> **Substep 핵심 의사결정 (2026-05-24 사용자 컨펌, D1~D14 묶음)**:
> 1. **D1 — M1.8 격상 채택** (M2-plan §Step 1 30m hotfix 대신 마일스톤급). 데이터 빈칸 3건 + SPOT cleanup + 표시 단위 표준화 + canonical docs 가 한 호흡 scope.
> 2. **D8 — funding 컬럼 2분리** (predicted_funding_rate + last_settled_funding_rate). M2 OKX/Bybit/Bitget 공통분모 확보 (OKX `/api/v5/public/funding-rate` 가 predicted + realized 동시 제공 등 거래소별 차이 흡수).
> 3. **D9 — funding_interval_hours 위치 = symbols 테이블** + worker in-memory Map dual write. instrument 마스터 속성으로 자연 분류 + frontend join 1회.
> 4. **D10 ✅ spike 완료** — Top LSR Positions 응답 필드명 = `longAccount` / `shortAccount` (Top LSR Accounts 와 **같은 필드명, 다른 의미**). DB 매핑은 endpoint 별로 다른 컬럼 (`top_long_position` vs `top_long_account`).
> 5. **D11 — estimated_settle_price USDM 카드 hide** (대부분 null, COINM 인도 직전 1h 한정 의미).
> 6. **D12 — annualizedBasisRate 카드 노출 보류** → deferred `[8-2]` 등재 (PERPETUAL 환경 정의 docs 침묵 — 사이트 비교 후 결정).
> 7. **D14 — PHAROSUSDT 종단 게이트 명시** (63 셀 매트릭스에 4h funding edge case 1 row 추가).

**스코프 경계 (M1.8 공통 — `@roadmap-milestone-manager` 3중 차단)**:

- ❌ **신규 카드 신설 금지** — `FundingCard` / `LSRCard` / `BasisCard` 등 별도 카드 신설은 M2 §Step 2 (카드 다양화). 본 마일스톤은 **데이터 + 표시 헬퍼 + canonical docs 만**. 기존 TickerCard 확장도 본 scope 외.
- ❌ **다거래소 확장 금지** — Binance USDM/COINM/SPOT 만. OKX/Bybit/Bitget 은 M2+. COINM dapi 매핑 confidence Low 영역은 deferred `[8-3]` 로 M1.9 또는 M2 분리.
- ❌ **자동 site-vs-db probe 금지** — 종단 게이트의 63 셀은 **수동 검증 + task-record 스크린샷** 1회. 자동화는 deferred `[8-1]` M2+ 이월.
- ❌ **M2-plan §Step 1.5 (transient_error 진단) 와 분리** — 운영 신뢰 게이트 vs 도메인 정확도 게이트는 별개 mental model. 본 마일스톤은 worker 데이터 정확도 영역.

**비전공자 설명**

"부엌 식자재 창고 점검 결과 — 진열대 절반 칸은 라벨만 붙고 비어 있고 (Top LSR Positions / Global LSR / Basis), 다른 절반은 일부 음식이 곰팡이 핀 상태 (SPOT 60% NULL stale). 본격 영업 (M2 카드 만들기) 전에 창고 정리 + 빠진 식자재 채워 넣기 + 거래소 간판이랑 식자재 라벨 일치시키기를 한 번에 끝내는 마일스톤. 펀딩비는 '실시간으로 변하는 예측값' (사이트 우상단 박스의 큰 숫자) 과 '4시간 또는 8시간 마다 정산된 확정값' 두 개가 있다는 걸 사용자가 직접 발견 — 이걸 두 컬럼으로 분리해 의미를 보존하는 게 본 마일스톤 핵심 결정 중 하나 (D8). PHAROSUSDT 같은 4h funding 코인이 1,100개 이상 존재 — `/fapi/v1/fundingInfo` 한 번 호출로 전부 자동 식별."

**M1.8 완료 후 활성화되는 흐름**:
- M2-plan §Step 1 (funding/OI fix) → M1.8 §8.5 흡수 ✅ 처리
- M2-plan §Step 2 (사용자 실사용 피드백 본격 진입) 진입 게이트 통과
- deferred 회수 6~7건 묘비 → `docs/deferred-task.md` 동기화
- M2 확장 루프 7단계 절차 진입 준비 완료 (실측 피드백 기반 우선순위 분해)

---

### M1.8.5 — history backfill ✅ **완료 (2026-06-01, 종단 게이트 G1~G5 전부 통과)**

> **단일 진실 원천**: **`docs/task-record/M1.8.5-RESUME-PLAN.md`** — `/clear` 후 가장 먼저 Read.
>
> **선행**: M1.8 ✅ (2026-05-28, 28 commit, 종단 게이트 G1~G5 전부 통과) — `docs/task-record/M1.8-complete.md`. 8.3c (β) 결정 (2026-05-27) 으로 본 마일스톤 이월.
>
> **D23 채택 (2026-05-31)**: `@roadmap-milestone-manager` 6-step 분해 채택. CTO 7-step 안 대비 -1h, Step 1·2·3 묶음 분리로 commit boundary 명확화.

**목표**

`now_futures_indicator` 의 현재 시점 8 metric 영역 (M1.8 ✅ 완료) 에 더해, `history_futures_indicator` 의 **7 metric × 9 interval = 63 셀 시계열** 영역을 1차 backfill 로 채우고 사이트=DB 진실 일치 확장. `historyBackfillTask` 가 이미 Hetzner 에 dry-run 영구 가동 중 (since 2026-05-27 06:47:47 UTC) → `dryRun:false` 1줄 + schema migration + fetcher 6종 + normalize + 실 backfill 1회 + 종단 게이트.

**산출물**

- **Schema migration (D22=A) ✅ Step 2 완료** — `history_futures_indicator.interval VARCHAR(5)` ADD + 자연 키 5축 UNIQUE INDEX **신설** (PK 재구성 X — surrogate `id` PK + 4축 lookup INDEX 와 공존, fact-table 패턴 완성) + DROP DEFAULT. 마이그레이션 파일 `supabase/migrations/20260531000001_m1_8_5_step2_history_interval.sql` (git 추적) + Dashboard 수동 실행
- **BinanceUsdmAdapter history fetcher 6종 (D21=B)** — `fetchOpenInterestHistory` / `fetchTopLongShortAccountHistory` / `fetchTopLongShortPositionHistory` / `fetchGlobalLongShortHistory` / `fetchTakerLongShortHistory` / `fetchBasisHistory` + normalize 6종 + vitest 12
- **`runHistoryBackfillTask` 실 호출 path** — 9 interval × 608 symbol loop + IP quota 모니터링 + progress journal 5분당 1회 + worker bootstrap 1줄 `dryRun:false` 전환
- **1차 실 backfill** — **57~72K REST** (5m page 분할 9회 포함) / 25M row / **~5.7~6.1h @ 150 req/min** (D-Q1 채택 2026-05-31) / ~2.5GB Supabase. 자문 결과 (@backend-infra-specialist / @crypto-domain-expert 2026-05-31) 로 분량 갱신 — 사용자 추산 33K/2.97h 는 페이지네이션 미반영. /futures/data/* quota 마진 30% 확보로 perSymbolTask 동시 가동 안전
- **sliding window archive 정책 결정** — D26 선택지 (A/B/C). 권장 (C) 보류 → `[8-18]` 신규 deferred 등재 (구현은 본 마일스톤 밖)
- **docs sync** — DB_SCHEMA.md / canonical-metrics.md §5 63셀 / M1.8.5-step{2,3,4,5}-*.md 4 신설 + M1.8.5-complete.md

**완료 기준 (종단 게이트 G1~G5)**

- [x] **G1 — 사이트=DB 검증** ✅ (2026-06-01) — BTC/ETH × OI/LSR × 1h DB값 ↔ Binance Trading Data 사용자 트레이더 육안 검증 ("대충 맞아"). BTC OI ~105K BTC/LSR ~1.5, ETH OI ~2.2M ETH/LSR ~3.1 단위·규모·방향 일치
- [x] **G2 — 자동 게이트** ✅ — RLS 무이상(get_advisors security: M1.8.5 무관 기존 WARN 3건, RLS-비활성 0) + `type-check`(worker+data-service) + `lint` + `test` **77 PASS** + backfill 5 검증 쿼리 PASS (4,098,247 distinct row[정정: 20~28M=upsert] / interval 9 / symbol 608 / 용량 1.5GB / 6 metric 97~98% dense)
- [x] **G3 — 0 Critical 자문** ✅ — `@code-reviewer`(Step3 C1 recorded_at 타입강제 + Step4 C1 윈도잉/W1) + `@backend-infra-specialist`(quota/메모리) + `@crypto-domain-expert`(quota 충돌 해소=조건부 GO) + `@crypto-trader`(advisory). 잔여 Critical 0
- [x] **G4 — deferred 일관성** ✅ — `[8-15]` 묘비 + `[8-18]`(sliding window D26=C) + `[8-26]`(forward-fill) + `[8-21]` 회수. 신규 회수 0건 외 정합
- [x] **G5 — 마일스톤 종료** ✅ — `M1.8.5-complete.md` + ROADMAP/PRD/RESUME/M2-plan/canonical ✅ 마커 + memory `project_m1_8_5_complete.md` 전환 + 7 docs 일관성

**의존성**: M1.8 ✅ / Hetzner 24/7 worker 안정 / D20=C / D21=B / D22=A 사용자 결정 (모두 확정)

#### Steps (2026-05-31 분해, `@roadmap-milestone-manager` 자문 채택)

| Step | 작업 | 검증 | 사용자 결정 | 예상 |
|---|---|---|---|---|
| **1** ✅ | 세션 진입 + RESUME-PLAN + 본 §M1.8.5 + `[8-15]` 마커 + memory | RESUME-PLAN 8섹션 + G1~G5 정의 + `[8-15]` 갱신 + memory 인덱스 | **D23** ✅ 채택 | ~30분 (commit `134d4d7`) |
| **2** ✅ | Schema migration (D22=A SQL 3단, **자연 키 UNIQUE INDEX 신설** — PK 재구성 X) + DB_SCHEMA.md + M1.8.5-step2 task-record + 마이그레이션 파일 (Dashboard 수동 실행) | ✅ interval VARCHAR(5) NOT NULL + DROP DEFAULT 정확 + 3 INDEX 공존 (pkey/natural_pk/lookup) + row 0 재확인 | 없음 | ~45분 |
| **3** ✅ | fetcher 6종 + normalize 6종 + dataService upsertHistoryFuturesIndicator + vitest 14 + live smoke + M1.8.5-step3 task-record | ✅ type-check(worker+data-service) + lint + **test 77 PASS** + live smoke **6/6 200 OK** + sanity guard test + ON CONFLICT defaultToNull:false + recorded_at 폐기 타입 강제(C1) | **D-Q1**=150 / **D-Q3**=별도 row / **D-Q4**=분리 X ✅ / **D-Q2**=9페이지 ✅ 실측 (2026-05-31) | 3~4h |
| **4** ✅ | runHistoryBackfillTask 실 호출 path (loop+윈도잉+state machine+count+throttle) + M1.8.5-step4 | ✅ **코드 완료 + 3 자문 통과 + dryRun:false 활성화 commit** (type-check+lint+77 test, C1 윈도잉/retry, RLS #7 실측, quota 조건부 GO). **사용자 SSH 배포(git pull+restart) 대기** | **D25**=C / **D-Q5**=B (같은 IP+100req/min) ✅ 채택 | 1~1.5h |
| **5** ✅ | 1차 실 backfill (로컬 one-shot 13.6h) + 5 검증 쿼리 + sliding window 결정 + M1.8.5-step5 | ✅ **4,098,247 distinct row** (정정: 20~28M=upsert 횟수 → ~4M=distinct) + 9 interval + 608 symbol + 용량 1.5GB + 6 metric 97~98% dense + 값 sanity | **D26**=C 보류 → `[8-18]` ✅ | ~3h |
| **6** | 종단 게이트 G1~G5 + M1.8.5-complete.md + 7 docs sync + memory 전환 | 본 §완료 기준 5종 전부 ✅ + 7 docs 일관성 | 없음 (자동) | 1.5~2h |

**총 예상**: 9~12h (CTO 7-step 안 대비 -1h)

> **Substep 핵심 의사결정 (D23 채택 2026-05-31)**:
> 1. **D23 — 6-step 분해 채택**. CTO 7-step → @roadmap-milestone-manager 6-step 압축 (Step 1·2·3 묶음 분리 + Step 6 의 sliding window 구현 분리 → 결정만, 구현 deferred).
> 2. **D24 (Step 3 진입 시 결정)** — backfill 중 perSymbol+ticker24hr 동시 가동. 권장 (A) 동시 — Binance `/futures/data/*` quota 마진 ≥30% 검증됨.
> 3. **D25 (Step 4 진입 시 결정)** — 1차 backfill 가동 시간대. 권장 (C) fire-and-forget 2.97h — 5min quota 의 ~4% 소비, 야간 cron 복잡도 불필요.
> 4. **D26 (Step 5 진입 시 결정)** — 14일 sliding window archive 정책. 권장 (C) 보류 → `[8-18]` deferred 등재 — 운영 1주 데이터 없이 결정 시 CLAUDE.md "deferred decision" 원칙 위반.

#### scope creep 차단 리스트 (절대 진입 금지)

본 마일스톤은 **`history_futures_indicator` USDM 단일 시장만** 다룸. 아래는 **전부 본 마일스톤 외부**:
- 🔴 COINM history backfill 동시 진행 → M2 Step 0 또는 `[8-19]` 신규 등재
- 🔴 새 카드 컴포넌트 (예: "OI 14일 sliding chart card") → M2-plan §Step 2 (실사용 자연 발생)
- 🟠 canonical-metrics.md COINM 행 신설 → M1.8 USDM 단일 일관성 유지
- 🟠 sliding window 즉시 구현 (D26=A/B 채택 시 유혹) → **결정만**, 구현은 `[8-18]` deferred
- 🟡 fetcher 시그니처 일반화 (4 거래소 추상화) → M2 OKX 추가 시 자연 발생

**비전공자 설명**
"식자재 창고에 과거 14일치 식자재 (선물 7 지표 × 9 인터벌 시계열) 한 번에 채우는 작업. 도구는 이미 시운전 (dry-run) 으로 가동 중이라 '실제로 채우기' 스위치 1줄만 ON + 식자재 가져오는 함수 6 종만 만들면 끝. 9~12 시간 한 호흡. 식자재 오래된 거 버릴지는 1주 영업해보고 결정 (CLAUDE.md '운영 데이터 없이 결정 금지' 원칙)."

---

### M1.9 — history 시계열 지속성 (forward-fill) + COINM 확장 ✅ **완료 (2026-06-06)** — 종단 게이트 G1~G5 통과, 단일 진실 `docs/task-record/M1.9-complete.md`

> **단일 진실 원천**: `docs/task-record/M1.9-complete.md` (종단 게이트 G1~G5 통과). `/clear` 후 가장 먼저 Read. **M1.9 ✅ 완료 + COINM 24~48h 안정성 PASS(2026-06-07, 롤아웃+22h: NRestarts=0·same-IP ban 0·DB 무구멍) + `[8-34]` 회수.** 후속 모니터링 상세 = `docs/task-record/M1.9-coinm-stability.md`. **▶ 다음 = M2-plan §Step 2 실사용 피드백 수집.** (Step별 이력: `M1.9-step0/step1/step2-forward-fill/step3-rollout.md`.)
> **선행**: M1.8.5 ✅ (2026-06-01) — USDM history 과거 14일 1회 backfill 완료. 본 마일스톤 = 그 history 를 **미래로 계속 자라게** + COINM(dapi) 확장.
> **결정 출처**: 사용자 + CTO + `@backend-infra-specialist` + `@zod-schema-architect` 자문 (2026-06-01). 공식 문서 3종 확인(Hetzner/Supabase/Binance).

**목표**
M1.8.5 가 채운 과거 14일 history 가 backfill 시점(05-31)에서 **정지**한 문제(`[8-26]`)를 해소. 별도 Hetzner worker(별도 IP)로 forward-fill 을 24/7 가동해 새 봉을 자동 누적 + COINM 확장. 외부 베타테스터(~1달 후 예정) 진입 시점에 USDM+COINM history 가 살아있는 상태 확보.

**핵심 결정 (2026-06-01)**
1. **forward-fill 방식 = 별도 Hetzner worker (방식 A 주기적 증분 backfill)**. production worker 와 같은 IP 로는 `/futures/data/*` 1000 req/5min 가 이미 포화 → same-IP `-1003` ban 확정 (M1.8.5 실측). 두 번째 Hetzner 서버(~$12/월, 자체 Primary IPv4 — Hetzner 공식 문서 확인)로 IP 격리. `[8-20]` 회수. (사용자 근거: "베타테스터 모집하면 어차피 필요.")
2. **COINM 과거 backfill 불필요 — forward-fill 로 시간이 대체**. 베타 진입까지 ~1달 여유 → 지금 forward-fill 을 켜면 30일 누적 → "최근 14일" 충분 커버. COINM 1회 대량 backfill(spike) 생략. **단 COINM fetcher/normalize 신규 코드는 필요** (dapi URL, Taker 응답 스키마 상이, OI=contract 단위). `[8-3]` 회수.
3. **구현은 USDM+COINM 함께(market_type 일반화), 롤아웃은 순차** — USDM forward-fill 먼저 2~3일 검증 → 정상 시 COINM ON. 디버깅 시 어느 축이 ban/에러인지 분리 가능.
4. **별도 worker = 범용 collector 골격, 코드는 forward-fill task 1개만** (YAGNI). `packages/exchange-collectors` 추출 + `apps/collector-history`. 미래 OKX backfill / 뉴스 폴링 task 를 등록만으로 추가할 수 있는 골격은 갖추되 실제 구현은 안 함.
5. **저장 = native range partition by `recorded_at` 계획** (TimescaleDB 는 Postgres 17 에서 deprecated — Supabase 공식 문서 확인). 단 즉시 파티션 X (현재 1.5GB, "성능 저하 보기 전 도입 말라" 원칙). forward-fill 로 수십 GB 도달 시 `[8-18]`.

**Step 분해 (4-Step, `@roadmap-milestone-manager` 자문)**
- **Step 0 — `[3-68]` transient_error 진단 보강** ✅ **완료 (2026-06-02)**: auth(401/403)/quota(402/429)/transient(그 외) 3분류. `classifyTransportStatus` 순수 헬퍼 + `AnthropicTransportError.status` (SDK 결합 haikuClient 격리). DB 마이그레이션 불필요(CHECK 부재 실측). 208 test PASS + code-reviewer 0 Critical + crypto-trader quota 문구 정직화. `[3-68]` 회수. 단일 진실: `docs/task-record/M1.9-step0-transient-error-diagnostics.md`.
- **Step 1 — 별도 collector worker 인프라 + forward-fill 설계** ✅ **완료 (2026-06-02)**: `packages/exchange-collectors` 추출(client 싱글톤·history fetcher·`executeHistoryBackfill` 코어) + `@travis/shared` TierPoller/IPoller/PollTask 승격 + 신규 `apps/collector-history` 골격(forwardFill stub) + deploy 자산 + marketType 파라미터화. 순수 추출 = worker 77 test 회귀 0 + collector dry-boot. forward-fill 방식 lock-in(증분 startMs 주입·interval 그룹 스케줄·getMaxRecordedAt freshness). `[8-20]` 회수 / `[8-28]` 신규. code-reviewer 0 Critical. 단일 진실: `docs/task-record/M1.9-step1-collector-infra.md`. (서버 결제·배포 실행 = Step 3.)
- **Step 2 — forward-fill 구현** (USDM+COINM 일반화, `[8-26]`+`[8-3]` 회수): `historyBackfillCore` 재사용 + 짧은 lookback 증분 + COINM fetcher/normalize 3종 신규 (OI contract 단위 `@crypto-domain-expert` 검증).
- **Step 3 — 순차 롤아웃 + 검증** ✅ **완료 (2026-06-06)** (단일 진실 `docs/task-record/M1.9-step3-rollout.md` + `M1.9-complete.md`):
  - **Phase A** ✅: 배포 자산 검증 + `DEPLOY-RUNBOOK.md`(3-A) + G1 검증 SQL·site 프로토콜 골격(3-B).
  - **Phase B(부분)** ✅: 2번째 서버(49.13.138.121 Falkenstein, **별도 IP 확정**) USDM-only 배포(bootstrap→runtime-setup→collector.env→systemd) + **G1 라이브 실증**(05-31 정지→06-04 11:25 채워짐, 5m 381K row). **라이브 실측 이슈 3건 적발·규명**: ① freshness 25초 statement timeout → 전용 인덱스(`20260604000001`, 25→5.9ms 해소) ② basis -1003 ban(별도 fapi weight 풀 2400/min, crypto-domain 확정) ③ shutdown 90초 SIGKILL. ②③ → **즉효 fix 3종**(staggered start / basis 2400ms floor / `TimeoutStopSec=180`, code-reviewer 0 Critical·회귀 0). 근본 fix(shared limiter+AbortSignal+per-metric)는 `[8-31]`.
  - **Step 1 후속** ✅ **(2026-06-05)**: 라이브 재진단(collector 생존 ✅ / 단기봉 lag 2~3h = 폴링 cycle 구조 하한, **사용자 lag 1~3h 허용 결정** / kline 0 = scope 밖 정상) + **`[8-31]`ⓒ per-metric throttle 회수**(`PerMetricThrottle`, basis cycle 팽창 제거 = lag ~14% 개선, 정직성 주석) + **`[8-33]` 금속/주식 basis -4104 제외 회수**(reactive 학습 캐시 — 라이브 실측으로 자문 underlyingType 가정 정정: 진짜 기준 contractType=TRADIFI_PERPETUAL 75종, INDEX 2종 false positive 회피). worker **110 test 회귀 0** + code-reviewer 0 Critical + crypto-domain COINM 17심볼 합산 안전 확인(통계 150/min+basis 30/min).
  - **Step 2 후속** ✅ **(2026-06-05)**: **`[8-31]`ⓐ 프로세스 전역(opt-in) `/futures/data` token-bucket 회수** — `FuturesDataRateLimiter`(통계 150/min + basis 30/min 별도 버킷, path 구분). **★ opt-in 설계**: client.ts 공유 코어라 worker now-poller(~1200 req/min)는 `rateLimiterGroup` 미지정으로 무영향, collector fetcher 12개만 opt-in(W1 fetch-mock 테스트가 직접 단언). S1(basis USDM·COINM 합산) 자동 해소. worker **122 test 회귀 0** + code-reviewer 0 Critical(W1/W2/W3/S1 반영). **ⓐⓒ 완료 = COINM 롤아웃 전제 충족**.
  - **Step 후속 ⓑ** ✅ **(2026-06-05)**: **`[8-31]`ⓑ AbortSignal 협조적 취소 회수** — `abortableSleep` + `acquire(signal?)` + 3경계 graceful return(부분 결과) + collector `AbortController`(`poller.stop()` 전 abort) + `.service TimeoutStopSec 180→30`. 라이브 재배포 #1(07:01)의 SIGKILL `Failed` 해소 목적. signal optional→worker 무영향. worker **130 test 회귀 0** + code-reviewer 0 Critical(S1 관찰: upsert retry abort 미인지). **ⓐⓑⓒ 완료 = COINM 롤아웃 전제 충족, 잔여 ⓓ circuit breaker(📋, 차단 아님)**.
  - **라이브 재배포 #1** ✅ **(07:01, ⓐⓒ/[8-33])**: 5m·1h lag 2.5~3h→**3분** 극적 개선(15m/30m 과도기). SIGKILL 실측→ⓑ 트리거.
  - **라이브 재배포 #2** ✅ **(07:36, 35ff502=ⓑ)**: ⓑ 프로세스 가동.
  - **✅ COINM 롤아웃 + 종단 검증 완료 (2026-06-06)**: **ⓑ 깔끔 종료 2회 검증**(restart stop 1초 graceful, `Deactivated successfully`, SIGKILL 0) + **COINM 롤아웃**(`markets=[usdm,coinm] tasks=6`, 17 `_PERP`) + **G2 site=DB**(USDM ~50셀 + COINM 24셀 소수점 일치, OI=contract 단위) + **basis -1003 규명**(Binance LB 노드 weight 풀 혼잡, basis weight 0, 우리 무관 — backoff 흡수) → **G1~G5 게이트 전부 통과, M1.9 완료.** 단일 진실 `task-record/M1.9-complete.md`.
  - **✅ COINM 24~48h 안정성 체크 (2026-06-07, 롤아웃+22h) PASS**: collector `NRestarts=0`/22h 무중단 + same-IP ban 0(우리 공인 IP 로그 0회, -1003 676회/27h 전부 내부 LB IP `10.119.x`) + DB 20심볼×9interval 무구멍 누적·멱등 0·채움률 ~100%. 점검 중 `[8-34]` LSR guard false positive(로그 ~40%) 실측·동시 회수(`maxRatio` USDM 10/COINM 20, worker 134 test). 단일 진실 `docs/task-record/M1.9-coinm-stability.md`. (형식상 48h 재확인은 06-08 선택.)
  - **▶ 다음 = M2-plan §Step 2 실사용 피드백 수집 진입.** 잔여 `[8-31]`ⓓ circuit breaker·`[8-22]` warn 폭발 집계는 📋/🟡(차단 아님, 관련 작업 시 회수).
- **→ 이후 M2-plan §Step 2** (베타테스터 + 본인 실사용 피드백).

**Step 2 sub-step 분해 (착수 2026-06-04, `@roadmap-milestone-manager` 5-분해 + 사용자 승인)**
> 데이터 흐름 순서(freshness → 증분 startMs → 채우기)로 아래에서 위로 적층. USDM end-to-end 완성·검증 후 COINM 적층 (§핵심결정 #3). DB 실측(2026-06-04): history 9 interval 전부 `max=2026-05-31` 정지 + `futures_coin` row 0개 확인.
- [x] **2-A — 기반 배관** ✅ (2026-06-04, commit `5793436`): `IDataService.getMaxRecordedAt` 신규 + `executeHistoryBackfill` `startMsOverride?` 주입. 검증: 라이브 MCP `getMaxRecordedAt`→2026-05-31(USDM)·null(COINM) / worker 77 test 회귀 0 / type-check 6패키지. 회수: 부채1(S2) 코어측 · `[8-25]`(freshness) 토대.
- [x] **2-B — USDM forward-fill 본구현** ✅ 코드 완성 (2026-06-04): `forwardFillTask.ts` STUB 제거 → interval 그룹별 3 PollTask(단기~10분/중기~1h/장기~12h) + interval당 freshness anchor 기반 증분 윈도잉(`computeForwardFillStartMs` 순수함수) + graceful try/catch. 검증: type-check / worker 82 test(+5 신규) / lint. ⚠️ **라이브 INSERT 검증은 Step 3**(실 fetch/DB write라 dry-boot 불가). 회수: 부채1(S2) 완결 · **`[8-26]`** 코드 차원 해소.
- [x] **2-C — COINM fetcher/normalize (dapi)** ✅ (2026-06-04): crypto-domain-expert 공식문서 spec → backend-infra 구현(fetcher 6+normalize 6+타입 6+helper 추출+test 15) → code-reviewer 0 Critical → **★라이브 dapi 실측 교정**(자문 오독 2건: account 키=pair / OI phantom symbol). symbol 규약=pair+"_PERP"(site=DB). market_type="futures_coinm". 검증: type-check / worker 97 test / lint / 라이브 6 GET. 회수: **`[8-3]`** · 부채2(S3). 신규 `[8-29]`(자문 memory 정정)/`[8-30]`(W2·W4·S2).
- [x] **2-D — COINM 통합** ✅ (2026-06-04): `getMetricFetchers(marketType)` USDM/COINM dispatch + COINM `coinmSymbolToPair` 변환 + `symbolFilter`(COINM `_PERP`) + forward-fill market별 별도 cycle(mixed-batch 구조 보장) + `loadTradingSymbols(marketType)` 일반화 + `FORWARD_FILL_COINM` env 토글(순차 롤아웃). 검증: type-check / worker 105 test(+8) / lint. 회수: 부채2(S3 basis) · 부채3(S5). 라이브 INSERT는 Step 3.
- [x] **2-E — 종합·자문·docs** ✅ (2026-06-04): code-reviewer(2-C·2-D) 0 Critical + crypto-trader advisory + W2(동시 task IP 예산 분배) 반영 + docs sync. 신규 `[8-30]`/`[8-31]`/`[8-32]`.

> **★ Step 2 코드 완성 (2026-06-04)** — 5 sub-step 전부. **라이브 가동(신규 row INSERT)·site=DB 대조는 Step 3**(2번째 서버 배포·순차 롤아웃, 실 fetch/write 라 별도 IP 필요). 단일 진실: `docs/task-record/M1.9-step2-forward-fill.md`. 회수(코드): `[8-26]`·`[8-3]`·인계부채 S2/S3/S5. **Step 3 전 `[8-31]` COINM 합산 req/min 재확인 필수.**

**완료 기준 (종단 게이트)**
- [x] **G1** — USDM 9 interval 05-31→06-06 누적 지속(5.42M row, `NRestarts=0` 23h+) + COINM 06-06 INSERT 시작 + 멱등 중복 0 + **우리 공인 IP ban 0회**(basis -1003 의 `10.119.x.x`=Binance LB 사설 IP, 우리 IP 아님) ✅ (2026-06-06)
- [x] **G2** — site=DB: USDM BTC/ETH ~50셀 + COINM BTCUSD_PERP 18셀(OI=contract 단위)·SUIUSD 6셀 이 Binance 공식 REST(fapi/dapi)와 소수점 완전 일치 ✅ (2026-06-06)
- [x] **G3** — `[3-68]` auth/quota/transient 분리 테스트 (d1~d5: 401/429/502/402/403) PASS ✅ (2026-06-02)
- [x] **G4** — `[8-26]`/`[8-3]`/`[8-20]`/`[8-31]`ⓐⓑⓒ/`[8-33]` 묘비 + basis -1003 메커니즘 정정 + `[8-34]` 신규 등재 + `[8-27]` 가시화 유지 ✅ (2026-06-06)
- [x] **G5** — docs sync + 단일 진실 `M1.9-complete.md` 신설 ✅ (2026-06-06)

**scope creep 차단 리스트 (절대 진입 금지)**
- 🔴 확장성 빚 6건(`[8-27]`) 선제 리팩터링 → 거래소/소스 추가 Step 몫, M1.9 무관
- 🔴 OKX/Bybit/Bitget history → M2 거래소 다변화
- 🔴 뉴스/매크로/기본정보 데이터 소스 → `future.md §1` 트랙, 해당 소스 추가 Step
- 🟠 sliding window 즉시 구현 → `[8-18]` (forward-fill 로 수십 GB 도달 후)
- 🟠 promptInjection 계층화 / exchange enum registry-파생 → 거래소 2개째 진입 시 (`[8-27]`)

**비전공자 설명**
"M1.8.5 가 '지난 14일 사진'을 한 번 찍어 창고에 넣었는데, 그 사진이 5월 31일에 멈춰버렸습니다 (시간이 가도 새 데이터가 안 들어옴). M1.9 는 **두 번째 데이터 수집 직원 (별도 서버)** 을 고용해 24시간 새 데이터를 계속 창고에 넣게 합니다. 첫 번째 직원과 같은 출입증(IP) 을 쓰면 거래소가 '너무 자주 온다' 며 둘 다 막아버려서 (M1.8.5 때 실제로 당함), 별도 출입증을 가진 두 번째 직원이 필요합니다 (월 ~$12). COINM (코인마진 선물) 은 과거 데이터가 아예 없지만, 어차피 베타 오픈이 한 달 뒤라 지금부터 새로 쌓으면 그때는 한 달치가 차 있습니다 — 그래서 과거 데이터를 굳이 따로 안 파도 됩니다."

**공식 문서 근거 (위생 #8, 2026-06-01 확인)**
- **Hetzner**: 각 Cloud 서버는 자체 Primary IPv4 보유 (€0.50/월, 서버 off 시 변경 가능) — 별도 worker IP 격리 전제 검증. `docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/`
- **Supabase**: 대용량 시계열은 native range partition by date 권장(`pg_partman` 보다 native 우수), **TimescaleDB 는 PG17 deprecated**. Pro 8GB disk 자동 스케일 (90% 도달 시 +50%, max 60TB). `supabase.com/docs/guides/database/partitions`
- **Binance**: `/futures/data/*` 는 weight 0 이지만 **1000 req/5min 별도 IP 카운터** (X-MBX-USED-WEIGHT 로 안 잡힘) — M1.8.5 실측 + 메모리 `feedback_binance_futures_data_ip_quota`.

---

## M2 이후 — 확장 루프 (Extension Loop)

> **▶ 현재 위치 (2026-06-24) — 확장 루프 4회전 = 경로 A (WS 프론트 직결) ✅ 완료 = 🎉 PRD 3대 데이터 경로 전부 구현**: Step 4 Phase B 라이브 플립으로 ticker 가 경로 A 직결 가동(박동 소멸 사용자 실측 + site=DB 소수점 일치 + 토큰 통과). ★ 라이브 정정 = 이 Supabase 가 이미 ES256 비대칭 서명 → 워커 JWKS 공개키 검증 전환(Step 2 HS256 가정 정정, `feedback_external_api_live_smoke`). 커밋 `f074ce1`/`d1a0dae`/`ecdcaa4`/`3c05a37`/`3886334`. `[10-1]`(a)·`[10-53]` 묘비, 신규 `[10-60]`~`[10-67]`. **▶▶ 다음 (사용자 결정 `/clear` 후) = 경로 A fast-follow 3종 순차(① funding/마크 경로A → ② 청산 피드 → ③ trade+호가) → 그 후 새 테마.** 단일 진실 `docs/task-record/M2-pathA-ws-direct.md §3` + 본 §경로 A 테마 완결 블록. 메모리 `project_m2_pathA_complete`.
>
> **▶ 이전 위치 (2026-06-22) — 확장 루프 4회전 = 경로 A (WS 프론트 직결) 🔄 진행 중, 토대 완성**: PRD 3대 데이터 경로 중 **유일 미구현** 경로 A(WS→프론트 직결, Supabase 미경유)를 착수 — 사용자 실측 "박동"(`[10-1]`(a), 테마 A 완결 시 체감한 경로 B 500ms throttle 구조 하한)의 근본 해법 + liveness 나머지 절반. **★ 핵심 설계(사용자 결정)**: 불투명 토픽(운반층 미파싱·전역 규격 금지) + 자유 payload(소비자 Zod 엣지 검증) = 추후 뉴스/온체인/타 거래소가 토픽만 추가해 같은 파이프에 꽂히는 범용 파이프.
> - **Step 1 ✅ (`8bc171e`)** — 워커 WS 서버 셸 `apps/worker/src/ws-server/`(LiveBus 토픽 pub/sub + LiveWsServer + envelope) + tickerWsHandler `publish?` optional 가산(enriched 직후·upsert 전 방송, 경로 B 무중단). 로컬 전용(프로덕션 배포는 Step 2 인증 후). smoke 62ms(경로 B 500ms 대비 8배).
> - **Step 3a ✅ (`5b26143`)** — 레지스트리 계약: `DatasourceEntrySchema.transport`(default `realtime`=하위호환) + `liveTopicSpec`(데이터 선언) + `buildLiveTopic(ds,selector)→topic`(워커·프론트 단일 진실) + superRefine. AI 비노출(promptInjection 제외).
> - **Step 3b ✅ (`e367810`)** — 프론트 라우터(**휴면=화면 변화 0**): `transport.ts`/`liveConnection.ts`(지수 backoff 재연결)/`liveTopicManager.ts`(channelManager 쌍둥이) + useDataServiceRow ws_direct 분기 + `selector` 입력. ticker realtime 유지(transport.test 못박음) → production 경로 B만.
> - **★ 경계 조정(사용자 동의)**: 워커 배선은 토픽이 프론트와 일치해야 하는 "플립"과 한 몸 → **Step 4 로 합침**. Step 3 = 계약+프론트만 = 워커 무접촉. (구 3c→3b 승격, 구 3b 워커배선→Step 4.)
> - **검증**: 각 step type-check/lint green + **회귀 0**(worker 181 / shared 44 / web 284 test) + `@code-reviewer` **0 Critical ×3**(불변식 전부). 신규 deferred `[10-52]`(구독 cap)/`[10-53]`(플립 선결: 재연결 error 깜빡임 + seq).
> - **▶▶ 다음 세션 (사용자 결정 2026-06-22, `/clear` 후) = 도메인 확보 → Step 2 (wss Caddy TLS + JWT 인증, 서브도메인 1개 필요) → Step 4 (플립: 워커 buildLiveTopic 전환 + ticker `ws_direct` + TickerCard selector + 라이브 "박동 소멸" 검증).** 자문 nextjs+crypto-trader+backend-infra+security-auditor. **단일 진실 = `docs/task-record/M2-pathA-ws-direct.md`** (재개 가이드 포함), 메모리 `project_m2_pathA_step1`. 5-step 분해 = `agent-memory/roadmap-milestone-manager/project_m2_themeA_pathA_breakdown.md`.
>
> **▶ 이전 위치 (2026-06-18 #3)**: **🎉 테마 C Step 4 (자유 텍스트 Custom Instructions) ✅ 완결 = 테마 C 전 step 완료(완결 후보)**: ChatGPT 식 자유텍스트 1칸(enum 기각 = AI 의도추론 공간 보존) + 프롬프트 인젝션 5겹 방어. 5 sub-step(① `buildSystemPrompt` `<user_preferences>` 주입+방어①프레이밍②우선순위③sanitize `000aad2` → ② `route.ts` 배선 `loadCustomInstructions`(graceful, 인증 서버클라 RLS 본인 row, retry 양쪽 주입) `70251d9` → ③ `/api/preferences` GET/PUT 저장 API(user_id 인증값만=위장 3중 차단) `7837c3b` → ④ 좌패널 `CustomInstructions` 편집 UI(UIUX 4문 협업: My Views 아래·명시 Save(dirty)·접힘+1줄 프리뷰·placeholder+helper) `b531397` → ⑤ 라이브 G2+docs `fdc4563`). **★ 라이브 G2 4/4 PASS**(Vercel+사용자 실행+Supabase MCP): G2-A 악성 메모(규칙 무시) 무력화 / G2-B 마커위조+XSS **콘솔 alert 0** / G2-C 정상 메모 ETH 4h 반영(명시 쿼리 BTC/1m 우선) / G2-D raw 저장 site=DB(`has_raw_img_tag=true`·`has_escaped_lt=false`). **"저장은 원본, 정화는 출구마다"**(화면 React escape / AI sanitize / 출력 Zod 백스톱) 설계 검증. 자문 0 Critical(code-reviewer×2 / security-auditor×2 12 Pass / crypto-trader / genagent desc 보강 2건 / roadmap-mgr). 274 test PASS. 신규 deferred `[10-51]`(preferences JSONB 머지). **▶▶ 테마 C 완결 후보 — 사용자 선언 + 다음 테마/방향 선택 대기**(경로 A WS직결 / 테마 D 차트 / 세션 컨텍스트 / 혼합 응답 / multi-provider). 단일 진실 `docs/task-record/M2-themeC-ui-shell.md §5`.
>
> **▶ 이전 위치 (2026-06-18 #2)**: **🎉 Saved Views v2 (ChatGPT 식 "살아있는 뷰") ✅ 완결 (Sub-step 1~5 + 라이브 G2 7/7 통과)** — Sub-step 4(MyViews 개편: 헤더[+]New view / Save as view는 scratch만 / 행클릭=로드·더블클릭=rename / 활성행 강조 + ViewSaveIndicator, commit `d3ea4d9`) + Sub-step 5(라이브 G2 + 보강 2건, `ef0a073`/`8b56c06`). **라이브 G2 (Vercel+Playwright+Supabase MCP, 콘솔 0)**: create→save(card_count=1)→**자동저장(card_count 1→2 site=DB)**→New view(★순서 불변식 라이브: 빈 캔버스가 기존 뷰 안 덮어씀, updated_at 불변)→복원→rename→**새로고침 자동 복원**. **라이브 발견 2건 사용자 결정 보강**: ① 새로고침 자동 복원(Sub4까진 미구현=docs 가정 vs 실제 / §4.7 #2 함정 적중: `ActiveViewStoreProvider` 마운트 self-wipe 제거 + 신규 `ActiveViewRestorer`(localStorage→GET 재검증→hydrate→loadNodes→setActive) → 거짓 PATCH 0=seed 멱등) ② 상시 "Saved" 인디케이터(페이드 후 공백 → 상시 잔류 + 저장시각 hover). 추가 fix: tooltip `toLocaleTimeString()`→`'en-US'`(English-only). 217 test×commit 회귀0. `[10-49]`① ✅회수(잔여 Q2/W1/W3)/`[10-50]`. **▶ 다음 = 테마 C Step 4 (자유 텍스트 Custom Instructions, enum 기각 + 인젝션 5겹 방어).** 단일 진실 = `docs/task-record/M2-themeC-ui-shell.md §4.10`.
>
> **▶ 이전 위치 (2026-06-18)**: **Saved Views v2 Sub-step 1·2·3 ✅** — Sub1 PATCH API(`2837d93`) + Sub2 activeViewStore+Provider(`e9c73b8`) + **Sub3 자동 저장 훅(`ead9485`)**: 활성 뷰에 들어가 카드 추가/삭제/드래그하면 1.5초 debounce 후 `PATCH /api/views` 자동 저장(scratch=저장 안 함). 신규 `autoSaveController`(프레임워크 비의존 순수 엔진: debounce/해시 멱등/seeding/in-flight 가드/조용한 재시도/flush 안전망) + `useAutoSaveActiveView`(canvasStore·activeViewStore 비반응 구독=리렌더 0 + keepalive flush) + activeViewStore `saveState` 추가 + MyViews 최소 setActive. 검증 type-check/lint + **217 test(+12) 회귀 0**. 자문 3종(code-reviewer 0 Critical / nextjs-frontend 🔴2 즉시반영=dirtyNotified 가드·disposed 좀비 가드·keepalive debounce off·종료flush만 on / backend 0 블록킹). 라이브 G2 = **Sub-step 5 통합**(사용자 결정 — 인디케이터 UI 가 Sub-step 4 에서 나온 뒤). 신규 deferred `[10-46]`동시탭 LWW/`[10-47]`keepalive 64KB/`[10-48]`z-order. **▶ 다음 = Sub-step 4 (MyViews 개편 — New view/rename/활성 강조/저장 인디케이터[saveState 소비, crypto-trader: "Saved ✓" 페이드 + Error 잔류], ★UIUX 사용자 협업 필수) → Sub-step 5 라이브 G2 → Step 4 자유 텍스트 Custom Instructions.** 단일 진실 = `docs/task-record/M2-themeC-ui-shell.md §4.8`, 메모리 `project_m2_themeC_viewsV2`.
>
> **▶ 이전 위치 (2026-06-16)**: **테마 C Step 1 (`user_preferences`) ✅ + 셸 트림(우측 패널 폐기) ✅ + Step 2 (`saved_views` 영속화 + 계정 위젯 좌측 이전) ✅ 완료 (라이브 G2 통과)**. Step 2 = 6 sub-step(0 계정 이전·commit B `a466c6b` → 1 saved_views 테이블+RLS 4정책 `90af032` → 2 직렬화+save-view/views API `ee437de` → 3 My Views UI `d8f5e5a` → 4 inert(0 흡수) → 5 라이브 G2+docs). **★ 라이브 G2 (Vercel+Playwright+Supabase MCP)**: 카드 생성 → 저장(DB site=DB 일치) → 새로고침(0개) → 복원 + **라이브 데이터 재연결**($66,420→$66,412, PRD §5 정확) → 삭제(DB 0). 자문: backend/security-auditor(RLS 4정책·IDOR 이중 차단 0 Critical)/code-reviewer(0 Critical, 서버/클라 분리·우편함 viewport 패턴). 신규 deferred `[10-44]`(window.confirm→인라인 톤)/`[10-45]`(fetch 헬퍼 추출), `[10-40]` 회수(inert). **둘째 user-owned-write 테이블** + 첫 영속화 워크플로(탭 닫아도 뷰 보존). **▶▶ 다음 세션 첫 작업 (사용자 결정 2026-06-16, `/clear` 후) = Saved Views v2 (ChatGPT 식 "살아있는 뷰" — 활성뷰+자동저장+new/rename/delete, Step 2 스냅샷 모델의 진화. roadmap-mgr 5 sub-step ~15h: PATCH API→activeViewStore→자동저장 훅→MyViews 개편→G2) → 그 다음 Step 4 (자유 텍스트 Custom Instructions 주입, enum 아님 + 인젝션 5겹 방어).** 단일 진실 = `docs/task-record/M2-themeC-ui-shell.md §4(Views v2)·§5(Step 4)`.
>
> **▶ 이전 위치 (2026-06-15)**: `[10-33]` "모든 코인 보기" ✅ (06-14) → **`[10-39]` phantom 'U' 심볼 ✅ 종결 (결함 아님)**. 'U'=Binance 실재 달러 스테이블 quote(라이브 exchangeInfo + 사용자 실거래소 확인 "유지" + 가격 정합), 파싱/stale 아님 → **코드 수정 0**. crypto-domain over-conservative 오판을 사용자 실측이 정정 + `@genagent` 로 3 에이전트에 "사이트=데이터 일치 + 답변 전 실사이트 직접 확인 + 미확정 시 제외 단정 금지" 원칙 강화. 단일 진실 `docs/task-record/M2-[10-39]-phantom-quote.md`. **▶ 확장 루프 3회전 = 테마 C (UI 셸 + 유저 프리퍼런스) 🔄 진행 중 — Step 0 (셸 골격) ✅ 완료 (2026-06-15)**: flex Push 셸(좌 My Views/우 Session Log = 가장자리 rail + 슬라이드 패널, 기본 둘 다 닫힘) + `uiShellStore`(Zustand vanilla) + Theme/User/Chat `fixed→absolute` 캔버스 편입. 검증 = type-check/lint/190 test + code-reviewer 0 Critical + 라이브 Playwright 정량(Push 캔버스 정확 축소 1384→1128→840, 채팅바 캔버스중앙 추종, ReactFlow 정확히 채움). 저사양 stutter 차단 = 폭 즉시변경+안쪽 translateX 슬라이드. 신규 deferred `[10-40]`(🟠 닫힘 패널 포커스 트랩 Step 2 회수)/`[10-41]`(🟡 ESC·단일패널·rail 발견성 nudge). **후속(사용자 라이브 피드백): 닫힘 애니메이션 대칭화**(폭 collapse 에 delay → 패널이 먼저 슬라이드 아웃, 열림의 거울, `0287d9c`, 사용자 OK). commit `c35c256`+`0287d9c`. **▶ 다음 = Step 1 (`user_preferences` 테이블+RLS)**. 단일 진실 = `docs/task-record/M2-themeC-ui-shell.md`, 6-step 계획서 = `~/.claude/plans/steady-petting-hellman.md`. ★ Phase 1 UIUX 는 사용자 협업 진행(자율 확정 금지).

> **▶ 확장 루프 1회전 (2026-06-11 갱신)**: **테마 A (카드 표현력 확장) ✅ 완결** (2026-06-09~11, 사용자 선언). Step 0~5 + 라이브 G2 통과: IndicatorCard(단일 심볼 지표) + **IndicatorListCard(정렬 랭킹)** 신설 → 컴포넌트 3→5종, datasource 9→10종(basis). 부수 확보: dataShapes 결합 schema 검증 + allowlist→registry 파생 가드(2중 방어 단일 진실) + 리스트 liveness(flash+FLIP) + initialFetch order. **사고 3건 동반 해소**: Step 2.5 `[10-11]` @arr stall(Binance 4/23 레거시 WS 폐지→`/market`) / Phase 0 Supabase Disk IO 고갈(Nano→Small) / `[10-22]` symbols 마스터 2달 stale(syncSymbolsTask 신설 — 위생 #3 이행). **단일 진실 = `docs/task-record/M2-themeA-card-expressiveness.md`** + incident docs 2건. 아래 7단계 표준 절차를 테마 단위로 반복.

> **▶ 확장 루프 2회전 (2026-06-12 갱신) — 테마 B (데이터 정합/quote_asset) ✅ 완결 (사용자 선언)**: quote_asset 컬럼(now ticker 2테이블 = spot/USDM/COINM 3시장) + backfill NULL 0 + worker lookup 적재 + registry queryableField + AI filters 서버 pushdown. 자문 2종 Critical 0. **남은 게이트 3 전부 통과 (06-12)**: ① 운영 관측 PASS (26.6h 무재시작, `[10-11]`/`[3-50]`/`[10-13]` 묘비 + `[10-23]` 1단계 syncSymbols 24h→1h 동반) → ② 워커 배포 (`454b8ab`, warnQuoteMiss 0) → ③ 라이브 G2 5종 PASS (오염 0 + Binance 수치 3종 일치 + log_chat 실측) → `[10-2]` 묘비. ★ Q1 결정: 기본 quote 스코프 = 테마 C 프리퍼런스 영역 (description 단서 = 소프트 하드코딩 기각). **단일 진실 = `docs/task-record/M2-themeB-quote-asset.md`**. 신규 deferred `[10-24]`~`[10-34]`. **▶ 다음 = `[10-33]` "모든 코인 보기" 표현력 (1+2단계 통합, 사용자 결정 06-12)** — 차순위: `[10-15]`+`[8-18]`+`[10-34]` retention 묶음 (시한 ~4주).

> **🎯 M2 진입 직전 단계** (2026-05-20 현재): 본 §M2 본문은 "확장 루프 7단계 표준 절차" + "가이드 우선순위" 의 **불변 패턴** 만 정의합니다. **실제 M2 Step 분해 (Step 1, Step 2, ...) 는 `docs/M2-plan.md` 에서 단일 진실 원천으로 관리** — 사용자 실사용 피드백 누적 후 우선순위 재배치 (M2-plan §Step 3) 를 거쳐 Step 분해 확정. 본 §M2 의 "예상 카테고리와 우선순위" 표는 가이드일 뿐 강제 순서가 아님.

M2부터는 **고정된 마일스톤이 아니라 반복 패턴**으로 개발이 진행됩니다.
이유: 어떤 거래소·데이터소스·컴포넌트·인터랙션을 언제 추가할지는 "그때의 필요"가 결정하므로, 미리 못박아두면 현실과 맞지 않습니다.

### 확장 루프의 7단계 표준 절차

어떤 항목을 추가하든 **이 7단계**를 순서대로 밟습니다:

1. **결정** — 추가할 항목을 정함 (예: OKX spot, CoinGecko fear&greed, Heatmap 컴포넌트, Drill-down 인터랙션)
2. **스키마 설계** — 해당 카테고리(`_now_*`, `_history_*`, `user_*`, `log_*`, `exchange_*`)에 필요한 테이블 추가. 컬럼·인덱스는 이때 결정. 필요 시 RLS 적용.
3. **수집기 구현** — Hetzner 워커에 어댑터/폴러/WS 핸들러 추가. **배치 API 원칙** + **tier 폴링 원칙** 준수.
4. **`dataService` 메서드 추가** — 새 데이터 조회 메서드 추가. **인터페이스 먼저 정의 → Supabase 구현**.
5. **레지스트리 등록** — 새 항목을 해당 레지스트리에 등록. 여기서 **오케스트레이터 코드는 한 줄도 건드리지 않음**.
6. **AI 동작 검증** — 관련 자연어 쿼리로 AI가 자동 선택하는지 확인. 시스템 프롬프트에 자동 주입됐는지 확인.
7. **E2E 테스트 + 로그 확인** — 엔드투엔드 쿼리 테스트, `log_chat`/`log_validation_failure` 확인.

이 7단계를 **오케스트레이터 코드 변경 없이** 완료해야 합니다.
만약 중간에 "AI 프롬프트를 수정해야 한다"거나 "새 컴포넌트만을 위한 if문을 넣어야 한다"는 유혹이 온다면 → **패턴 위반이므로 재설계 필요**.

### 확장 루프에서 예상되는 카테고리와 우선순위 (가이드)

| 우선 | 카테고리             | 예상 항목                                                                       | 루프 반복 횟수 (예상) |
| ---- | -------------------- | ------------------------------------------------------------------------------- | --------------------- |
| 1    | 거래소               | OKX, Bybit, Bitget (각 spot + futures)                                          | 3~6                   |
| 2    | 컴포넌트             | Heatmap, PnL 요약, 청산 피드, 오더북, 펀딩레이트 테이블 등                      | 5~10                  |
| 3    | 데이터소스           | CoinGecko, CoinMarketCap, CoinGlass, 뉴스, 온체인 등                            | 5~8                   |
| 4    | 인터랙션             | Drill-down (back-navigation 스택 포함), Linked Selection, Hover Preview 등      | 2~4                   |
| 5    | 사용자 기능          | 뷰 저장/불러오기, 뷰 공유, 좌측 "My Views" 패널, 우측 세션 로그 패널            | 3~5                   |
| 6    | 사용자 거래소 API 키 | Binance/OKX/Bybit/Bitget 개인 키 암호화 저장 (Edge Functions) + 포지션/PnL 카드 | 4                     |
| 7    | 뉴스 & 검색          | 뉴스 피드, Tavily 웹 검색 폴백 (~5% 희귀 쿼리), TradingView/YouTube 임베드      | 2~3                   |
| 8    | 공유 기능            | LiveView Links (공유 가능 URL)                                                  | 1~2                   |
| 9    | 모바일·UX 폴리시     | 반응형 레이아웃, 터치 드래그, 핀치 줌, 성능 최적화                              | 3~5                   |
| 10   | 어드민 고도화         | 기본 admin 은 **M1.7 에서 완료** (§M1.7 참조). M2+ 는 고도화만 — 실시간 Slack/이메일 알림, A/B 플래그 per user, CSV export, 시간대 활동 히트맵, in-app 피드백 인박스 | 1~2                   |

**각 루프의 실제 타이밍은 "지금 무엇이 가장 필요한가"가 결정합니다.** 이 표는 참고용 가이드일 뿐 강제 순서가 아닙니다.

### 확장 루프 예시: OKX spot 추가

1. 결정: OKX spot 어댑터 추가
2. 스키마 설계: 기존 `_now_*`, `exchange_*` 테이블에 `exchange` 컬럼 값만 추가되면 OK (테이블 추가 불필요). 필요 시 `exchange_symbols`에 OKX용 엔트리 추가.
3. 수집기 구현: `apps/worker/adapters/okx.ts` 신규 작성, 배치 API 사용, Binance 어댑터와 동일한 공통 인터페이스 구현
4. `dataService` 메서드: 이미 정의된 메서드가 `exchange` 파라미터를 받도록 설계되어 있어야 (M1.3에서 이미 대비). 새 메서드 추가 불필요.
5. 레지스트리 등록: `exchangeRegistry.register(okxAdapter)` 한 줄
6. AI 동작 검증: `"OKX의 거래량 상위 10개"` 쿼리 → AI가 OKX 데이터로 `CoinListCard` 조립
7. E2E + 로그: 기록 확인

**오케스트레이터 코드는 단 한 줄도 변경하지 않음** — 이게 확장 루프가 올바르게 돌아가고 있다는 증거.

---

### 확장 루프 4회전 — 테마 "경로 A (WS 프론트 직결)" ✅ 완료 (2026-06-24)

> **▶ 진행 상태 (2026-06-23 갱신)**: Step 1(워커 WS 서버 셸) ✅ + Step 3a/3b(레지스트리 transport 계약 + 프론트 라우터, 휴면) ✅ + Step 2 Phase 1(서버 측 JWT 인증 코드) ✅ (`7824148`) + **Step 2 Phase 2(wss 인프라 라이브 배포) ✅ (2026-06-23)** — `wss://ws.use-travis.com` 외부 노출(워커 `178.105.38.94` git pull + jose + JWT secret + 재시작 → `127.0.0.1:8081` 인증 활성) + Caddy LE 인증서(tls-alpn-01) + 무토큰 거부(401) + `@security-auditor` 노출-직후 재감사 **0 Critical/4W/9P**. 도메인 `use-travis.com` 확보. **단일 진실 = `docs/task-record/M2-pathA-ws-direct.md` §2.6.5** (아래 Step 체크리스트는 원본 분해 — 실제 실행은 Step 3 을 Step 2 보다 먼저, Step 2 를 Phase 1 코드/Phase 2 인프라로 분할). **▶ Step 4 ✅ 완료 (2026-06-24)** — 라이브 박동 소멸 + ES256 인증 정정(아래 "✅ 경로 A 테마 완결" 블록 + `M2-pathA-ws-direct.md §3`).
>
> **▶ 결정 (2026-06-22, 사용자/CTO 합의)**: PRD 3대 데이터 경로 중 **유일 미구현 아키텍처 갭**. 거래소 WS → Hetzner 워커 → (워커가 띄운 WS 서버) → 프론트 **직결**. 경로 B(Supabase Realtime 경유 500ms throttle)의 "박동"(`[10-1]`(a) 실측)을 우회. **MVP 범위 = 단일 ticker(last/markPrice)를 기존 TickerCard에 경로 A로 적용해 "박동 소멸"을 사용자가 직접 실측**(신규 카드 0). fast-follow(②청산 ③trade+bookTicker ④타 거래소)는 **본 테마 scope 밖 — 별도 테마**.
>
> **확장성 원칙 (사용자 양보 불가)**: 경로 A를 "바이낸스 ticker 전용"으로 짓지 않는다. 워커 WS 서버 = **토픽 단위 범용 fan-out**, 프론트 훅 = **transport-agnostic**, dataService가 레지스트리의 **transport 메타**를 보고 경로 A/B 자동 선택. 새 데이터 = "레지스트리 등록 + 어댑터" 로 끝(오케스트레이터 0줄).

#### Steps (2026-06-22 분해)

- [x] **Step 1 — 워커 프론트向 WS 서버 (토픽 fan-out 셸, 인증 없는 in-memory) + broadcast sink 병행 추가** ✅ (2026-06-22, `8bc171e` — tickerWsHandler publish? 가산, LiveBus/LiveWsServer/envelope, smoke 62ms)
  - 목표: Hetzner 워커가 별도 포트에 WS 서버를 띄우고, 클라이언트가 "토픽"을 subscribe/unsubscribe 하면 해당 토픽 메시지만 받는 **범용 fan-out** 허브를 만든다. 기존 `StreamRouter` 가 Supabase upsert 로 종착하던 자리에 **broadcast sink 를 병행 추가**(upsert 유지 = 경로 B 무중단).
  - 산출물: ➕ `apps/worker/src/ws-server/{WsServer.ts(토픽 구독 레지스트리+fan-out),topicTypes.ts(토픽 키 규약: `exchange:market:stream:symbol` 류 범용),index.ts}`, ✏️ `apps/worker/src/streams/StreamRouter.ts`(dispatch 버스 → upsert + broadcast 2-sink 분기), ✏️ `apps/worker/src/index.ts`(WS 서버 bootstrap + graceful shutdown 편입), ➕ smoke 스크립트(로컬 `ws://` 테스트 클라이언트 1개 접속→토픽 구독→tick 수신)
  - 검증: 로컬에서 워커 실행 → smoke 클라이언트가 `binance:futures_usdm:ticker:BTCUSDT` 토픽 구독 → BTCUSDT tick 이 1초 내 도착(콘솔 로그) + **경로 B 무중단 회귀**(now_* upsert freshness 그대로, 기존 worker 테스트 전건 green) + unsubscribe 후 메시지 중단 + 구독 0인 토픽은 fan-out 안 함(낭비 차단)
  - 회수 deferred: `[10-12]`(BaseWsConnection 추출 — WS 코드 손대는 김에 **수신부 곁다리 회수 후보**, 단 본 step 은 서버=송신부라 우선순위 낮음. 무리하면 Step 분리)
  - 순서 근거: 토대의 토대. 송신 허브가 없으면 인증·프론트 훅·카드 전환이 전부 붙을 곳이 없다. **인증은 Step 2로 분리**(셸과 보안을 한 번에 = scope 폭발).

- [x] **Step 2 — wss:// (TLS) + JWT 인증/인가 (Supabase 토큰 재사용)** ✅ — **Phase 1(서버 측 JWT 인증 코드) ✅ (2026-06-22, `7824148`) + Phase 2(wss 인프라 라이브 배포) ✅ (2026-06-23)**: `wss://ws.use-travis.com` 외부 노출 + Caddy LE 인증서(tls-alpn-01) + ufw 8081/2019 차단 + 무토큰 `wscat`→401 라이브 + security-auditor 노출-직후 재감사 0 Critical/4W/9P. 위조/유효 토큰 라이브는 wscat subprotocol 한계로 Step 4(브라우저 WebSocket) 이동. 상세 = task-record §2.6.5.
  - 목표: 프론트(HTTPS)가 직결하려면 `wss://` 필수 → TLS 적용 + **handshake 시 Supabase JWT 검증**(경로 B는 RLS 가 인가했지만 직결 WS 는 보안 0 → 직접 게이트). 인증 실패 시 graceful close.
  - 산출물: ✏️ `apps/worker/src/ws-server/WsServer.ts`(upgrade 시 토큰 검증 미들웨어), ➕ `apps/worker/src/ws-server/auth.ts`(Supabase JWT 검증 — service 키로 토큰 verify, 만료/위조 거부), (Hetzner 운영) TLS 종단 결정 = **reverse proxy(Caddy/Nginx) wss 종단 vs 워커 내장** 중 구현 중 택1(deferred), ✏️ docs/ARCHITECTURE.md(경로 A 보안 모델 1절)
  - 검증: 유효 JWT 클라이언트만 접속 성공 / 무토큰·만료·위조 토큰 = 1006/4001 류 close 로 거부(smoke 4 케이스) + `wss://` 로 실제 핸드셰이크(로컬 자체서명 or Hetzner staging) + 인증 실패가 워커 crash 0(graceful) + 기존 worker 테스트 green
  - 회수 deferred: 없음(신규 보안 경계)
  - 순서 근거: 프론트 훅(Step 3)이 붙기 전에 보안 경계가 서 있어야 한다. 인증 없는 직결 WS 를 잠깐이라도 프론트에 노출하면 안 됨. TLS+JWT 는 한 보안 묶음이라 함께.

- [x] **Step 3 — 프론트 transport-agnostic WS 클라이언트/훅 + 레지스트리 transport 메타 + dataService 경로 자동 선택** ✅ (2026-06-22, 3a `5b26143` 레지스트리 계약 + 3b `e367810` 프론트 라우터, 휴면=화면 변화 0. 프론트 토큰 첨부만 Step 4 로 이동) (예상: 1일 / 8~12시간)
  - 목표: 프론트에 WS 클라이언트(재연결·구독 관리)를 만들고, **기존 `useDataServiceRow` 와 인터페이스 호환**되는 경로 A 훅을 제공. datasourceRegistry 에 **transport 칸**(`realtime`(경로 B) | `ws_direct`(경로 A))을 추가하고, dataService 가 그 메타를 읽어 경로를 **자동 선택**. 카드 코드는 transport 를 모른 채 동일 훅만 쓴다.
  - 산출물: ➕ `apps/web/lib/dataService/wsClient.ts`(단일 WS 연결 멀티플렉싱+재연결+JWT 첨부), ➕ `apps/web/lib/dataService/usePathADirectRow.ts`(내부), ✏️ `apps/web/lib/dataService/useDataServiceRow.ts`(transport 메타 보고 경로 A/B 분기 — **호출부 시그니처 불변**), ✏️ `packages/shared/src/registries/datasourceRegistry.ts`(`transport` 필드 + Zod), ✏️ datasource 등록부(ticker 엔트리에 `ws_direct` 명시)
  - 검증: `transport` 미지정 datasource = 기존 경로 B 그대로(회귀 0) + ticker datasource 만 경로 A 로 분기 + 훅 반환 shape 가 경로 B 와 동일(카드 코드 변경 0 증명) + WS 끊김 시 자동 재연결 + 컴포넌트 unmount 시 구독 해제(누수 0) + `pnpm -r type-check`·`lint`·test green
  - 회수 deferred: `[8-27]`#1 부분 회수(datasource id=테이블명 강결합 → **transport 표현 부재** 해소. fetchKind 까지는 무리 — transport 칸만)
  - 순서 근거: 서버+보안(Step 1·2)이 서야 프론트가 붙을 대상이 생긴다. transport 자동 선택을 여기서 세워야 Step 4 가 "카드에 한 줄"로 끝남(확장성 핵심).

- [x] **Step 4 — 단일 ticker 를 TickerCard 에 경로 A 적용 (MVP) + 저사양 렌더 throttle** ✅ **완료 (2026-06-24)** — Phase A(휴면 코드, `89e0a36`) + Phase B(라이브 플립). 별도 throttle 훅 불필요(워커 StreamCoalescer 1초 합산이 저빈도 보장). 상세 = 아래 ✅ 완결 블록.
  - 목표: 기존 TickerCard 가 쓰는 ticker datasource 를 경로 A 로 전환(레지스트리 transport=`ws_direct` 한 줄 + Step 3 자동 선택으로 끝). **신규 카드 0**. UHD620 저사양 보호 위해 고빈도 tick 을 rAF/시간 기반으로 렌더 throttle(값은 최신 유지, 페인트만 솎음).
  - 산출물: ✏️ ticker datasource 등록부(transport 전환 — 대부분 Step 3 에서 완료, 잔여 배선), ➕ `apps/web/lib/dataService/useThrottledTick.ts` 또는 훅 내부 throttle(rAF coalesce), (필요 시)✏️ `TickerCard.tsx`(transport-agnostic 이라 변경 최소화가 목표)
  - 검증: TickerCard 가 경로 A 로 tick 수신(콘솔/네트워크 WS 프레임) + UHD620 에서 렌더 프레임 안정(jank 육안 0) + 값 정확성(최신 tick 반영, throttle 이 값 누락 아님) + 경로 B 카드(리스트/지표)는 그대로 DB 읽기 유지(공존 증명)
  - 회수 deferred: 없음(Step 5 G2 후 `[10-1]`(a) 묘비)
  - 순서 근거: 토대(1·2·3) 위에 MVP 를 얹는 마지막 배선. 카드 전환이 "한 줄"에 가까울수록 확장성 설계가 옳다는 증거.

- [x] **Step 5 — 라이브 G2 (박동 소멸 실측) + 안정성 관측 + docs/묘비** ✅ **완료 (2026-06-24)** — 라이브 G2 전부 PASS. 상세 = 아래 ✅ 완결 블록.
  - 목표: Vercel 배포 + Hetzner 워커 WS 서버 가동 상태에서 **"박동 소멸"을 Playwright 시간 샘플링으로 실측**(경로 A 의 tick 간격이 경로 B 의 ~500ms 뭉텅이보다 촘촘함을 정량) + **site=DB/거래소 사이트 값 일치**(경로 A 도 G2 의무) + WS 재연결/graceful 안정성 관측.
  - 산출물: ➕ Playwright 시간 샘플링 스크립트(tick 도착 간격 분포 = 경로 A vs 경로 B 비교), ✏️ `docs/task-record/M2-pathA-ws-direct.md`(단일 진실 신설), ✏️ `docs/deferred-task.md`(`[10-1]`(a) 묘비 + `[10-12]`/`[8-27]`#1 회수/잔여 정리), ✏️ ROADMAP 본 섹션(✅ 완결 선언)
  - 검증: **G2-A** 박동 소멸(경로 A tick 간격이 육안+정량으로 경로 B 보다 촘촘, 사용자 라이브 체감 "흐른다") + **G2-B** site=DB(경로 A 가격이 Binance USDM 사이트 last/markPrice 와 소수점 일치) + **G2-C** WS 끊김→자동 재연결 graceful(crash 0) + **G2-D** 경로 B 카드 무중단 공존 + 자문 0 Critical(code-reviewer/security-auditor/crypto-trader)
  - 회수 deferred: `[10-1]`(a) 묘비(경로 A 가 박동의 근본 해법임을 실증) + `[10-12]`/`[8-27]`#1 회수 또는 잔여 명시
  - 순서 근거: 실측 게이트는 항상 최후. "박동 소멸"은 이 테마의 존재 이유이자 완료 기준 그 자체.

**총 예상**: 27~42시간 (5~8일). 외부 불확실성(Hetzner TLS 종단/JWT 검증 라이브/저사양 tick throttle 실측)으로 폭 넓음.

#### ✅ 경로 A 테마 완결 (2026-06-24) — 🎉 PRD 3대 데이터 경로 전부 구현

라이브 세션(사용자 SSH 워커 재배포 + 브라우저 G2)으로 완결. 단일 진실 = `docs/task-record/M2-pathA-ws-direct.md §3 Phase B 라이브 완결`.
- **라이브 G2 PASS**: ① 박동 소멸(ticker transport ws_direct 플립 → 가격 ~1초 매끄러운 갱신, 사용자 실측) ② site=DB(`@crypto-domain` 24H low/high 소수점 일치·last≠mark≠index·24h rolling 정의 확인) ③ 토큰 통과 ④ 경로 B 카드 무중단 공존 ⑤ W3 과도기 경고 소멸.
- **★ 라이브 사고 = ES256/JWKS 인증 정정**: 플립 직후 WS 전량 `malformed` 거부 → 이 Supabase 프로젝트가 이미 **비대칭 ES256 서명**으로 마이그레이션(Step 2 "HS256 충분" 가정을 라이브가 정정, `feedback_external_api_live_smoke`). `createSupabaseTokenVerifier`(JWKS 공개키 ES256 검증, 공개키만 보유=위조 불가)로 수정. security-auditor 0C/3W/8P.
- 커밋: `f074ce1`(C1 updated_at) / `d1a0dae`(플립) / `ecdcaa4`(ES256) / `3c05a37`(English) / `3886334`(% flash+docs). 회수 `[10-1]`(a)·`[10-53]` 묘비. 신규 `[10-64]`~`[10-67]`.

**scope creep 차단 목록 (분해 시 못박음 — 본 테마는 단일 ticker MVP 까지로 지킴 ✅)**:
- ✅ 본 테마 = 단일 ticker MVP 까지. 아래 fast-follow 는 **별도 테마**로 분리 유지(scope 안 넘침).

#### ▶ 다음 = 경로 A fast-follow 3종 (사용자 결정 2026-06-24, 그 후 새 테마)

토대(불투명 토픽 + 자유 payload + transport-agnostic 훅)가 깔려, 각 항목 = "워커 핸들러에 `publish` 가산(tickerWsHandler 선례) + datasource `liveTopicSpec`+`transport:ws_direct` + (필요 시) 전용 카드". 착수 순서(사용자 우선순위):
1. **funding/마크가격 → 경로 A** — swing 가치, 이미 site=DB 검증된 metric = 가장 안전한 다음 수. 워커가 markPrice@1s 를 이미 WS 수신 중(현재 경로 B upsert) → publish 가산이 핵심.
2. **청산 피드 카드** — 스캘퍼 가치(실시간 이벤트). 워커가 forceOrder WS 수신 중. 신규 카드 필요.
3. **trade + 호가(bookTicker)** — 스캘퍼 최고 가치. ⚠️ 저사양(UHD620) 가상화·throttle 선결.

**★ 전체 실시간화 지도 (2026-06-25, Supabase MCP + 워커코드 교차검증)**: 위 3종 = "Binance WS 제공 + 우리 표시" 데이터 **전부**. 끝내면 실시간화 가능한 전부 완결. 나머지(OI/LSR/Taker/realized funding/basis)는 Binance WS **미제공** → REST 폴링 유일(OI 폴링단축 = 사용자 "안 함" 결정, 5분40초 OK). 전수 분류표 = task-record `M2-pathA-ws-direct.md §4.1`.

#### fast-follow #1 (funding/마크가격) Steps — 2026-06-25 분해, **IndicatorCard 개조** 방식 (전용 카드 X)
> ★ ticker 대비 유일한 신규 = **혼합 컬럼 partial-merge**(WS 컬럼만 1초 덮어쓰기 + REST 컬럼은 초기 seed 유지). 순서 엄수(병합 전 워커 방송 켜면 OI/펀딩 소실 사고). 단일 진실 = task-record §4.
- [x] **Step 1** ✅ (2026-06-26): IndicatorCard selector 배선(휴면) — type-check green + web 288 test(+1) + transport.test premium_index=realtime 휴면 단언 + code-reviewer 0C/0W. Suggestion #1(selector marketType 비대칭)→`[10-62]` Step 5 선결. 화면 변화 0 확인.
- [x] **Step 2** ✅ (2026-06-26): ★ partial-merge 데이터층 — `mergeMode` registry 칸(premium_index=partial, default replace) + `mergeRow` 순수함수 + `applyRow` 배선. shared 47 test(+3) + web 298 test(+10: mergeRow 6/resolveMergeMode 4) + code-reviewer 0C/0W. ★휴면 안전=Realtime new=full row 라 partial==replace(회귀0). S1→hooks 주석+`[10-62]`.
- [x] **Step 3** ✅ (2026-06-26): 워커 markPrice publish 가산 — markPriceWsHandler `publish?`+withBroadcastTimestamp(updated_at 방송만) + index.ts buildLiveTopic 배선 + defaults premium_index liveTopicSpec(transport 휴면). worker 212 test(+9) + W2 grep 토픽리터럴 0 + code-reviewer 0C/2W. W2→`[10-68]`(publish 헬퍼 추출, #2 전). **Phase A(1·2·3) 완결 = 화면 변화 0 휴면 토대 완비.**
- [x] **Step 4** ✅ (2026-06-26): B-1 워커 재배포(방송 먼저) — Hetzner `178.105.38.94` git pull `8575f7c` + restart, `[liveWsServer] listening` + 포트 8081 loopback 확인. 1h+ 무재시작 안정.
- [x] **Step 5** ✅ (2026-06-26): B-2 transport 플립 — defaults premium_index `ws_direct` + transport.test 뒤집기 + IndicatorCard 옵션C UI. code-reviewer 0C/1W. push→Vercel `d9116a5`.
- [x] **Step 6** ✅ (2026-06-26): B-3 라이브 G2 **5개 게이트 전부 통과** — 박동 소멸(부드러운 ~1s) + 혼합 무손실(last_settled 보존, partial-merge 라이브 증명) + site=DB(crypto-domain 실측 정합) + ES256 인증 + `[10-62]` 해소. ★ 라이브 사고: AI가 marketType 누락 → 토픽 frozen → **2겹 hotfix `54d7b98`**(hooks 경로B 폴백 + aiCardConfig superRefine marketType 필수, registry 파생). **= 경로 A fast-follow #1 완결.**

#### ▶▶ 다음 (사용자 방향 재확인 2026-06-27) = fast-follow #2 (청산 피드 카드)

**사용자 결정 (2026-06-27, 전체 docs 파악 세션)**: ① 경로 A fast-follow 트랙 **계속** — 다음 = **fast-follow #2 (청산 피드 카드)**. ② 그 후 `docs/task-record/M2-step2-usage-feedback.md` 대로 **실사용 병렬** — 불편 발견 시 백로그 흡수 후 하나씩 수정(M2 확장 루프 그대로).

**fast-follow #2 착수 전 선결 (커밋 `138e69f` 명시 순서)**:
1. ✅ **`[10-68]` 회수 완료 (2026-06-27)** — `makeTopicPublisher(liveBus, datasourceIdFor)` 헬퍼로 ticker/markPrice 동형 publish 배선 단일화(datasourceId 해석만 주입). worker 220 test(+8) + code-reviewer 0C/0W. #2·#3 가 datasourceIdFor 만 다르게 재사용.
2. `[10-69]` `/futures/data/basis` 418 ban 모니터 — Binance 내부 LB IP 혼잡(우리 공개 IP·경로 A 무관), basis 메트릭 stale 관측만.
3. `[10-67]` crypto-trader 옵션 C UX advisory 검토 — 재연결 타이밍 / freshness 비대칭 / % flash 재배치.

**fast-follow #2 = 청산 피드 카드**: 워커가 forceOrder WS 수신 중 → `publish` 가산 + datasource `liveTopicSpec`+`transport:ws_direct` + **신규 청산 피드 카드**(이벤트 스트림, `content` updateMode). 착수 시 `@roadmap-milestone-manager` 분해 + plan mode.

##### Steps (2026-06-27 분해) · Phase A(1~5 코드·휴면) / Phase B(6 라이브, 사용자 협업) — **진행 (2026-06-28): Step 1·3a·3b·2·4 ✅ + `[10-71]` 회수 (Phase A non-web 전부 + web 피드 훅, 화면 변화 0). 다음 = Step 5 (LiquidationFeedCard). 단일 진실 `docs/task-record/M2-pathA-ff2-liquidation.md`.**

- [x] **Step 1 — 청산 도메인·UX 설계 확정 (자문 게이트, 코드 0) ✅ (2026-06-27)** — crypto-domain-expert(필드/스트림) + crypto-trader(UX) + genagent(에이전트 보강) 자문 + **사용자 결정 4건 확정**:
  - ① **확정 사실(자문)**: `<symbol>@forceOrder`+`!forceOrder@arr` 둘 다 USDM·COINM(**spot 미지원**), 워커가 이미 한 핸들러로 수렴 수신 = 전체 tape·심볼별 모두 가능 / **side=SELL=롱 청산·BUY=숏 청산** / 표시가=`ap`(평균체결가) / notional USDM `z×ap`·COINM `q×contractSize`(라이브 1콜 실측) / **⚠️ under-report**(1초 1건 throttle → 일부만, "총 청산액" 금지·"sampled" 고지 필수) / **위생 갭**: forceOrderWsHandler TRADING allowlist 미체크 → Step 2 필터 삽입.
  - ② **스코프(사용자)**: **둘 다 — AI 자율 분기**(전체 tape + 심볼별). "비트 청산"→심볼별 / "청산 흐름"→전체 tape 를 AI 가 의도로 선택. → **★ 토픽 계약이 keystone**: selectorKeys 가 `[market_type]`(전체)·`[market_type,symbol]`(심볼별) 둘 다 필요 → buildLiveTopic 단일 spec 한계 → **Step 3(zod 레지스트리 계약 설계)를 keystone 으로 앞당김**.
  - ③ **임계값(사용자)**: 하드코딩 기본값 **X** → **AI 쿼리로 조절**("$100k+ 청산만" → AI 가 notional queryableField 필터 생성). 소프트 하드코딩 기각(테마 B Q1 선례 정합).
  - ④ **방향 색(사용자)**: **시장 영향 방향**(롱 청산=vermilion 하락압력 / 숏 청산=teal 상승압력) + **LONG/SHORT 텍스트 라벨 병기**(funding 오독 `[3-48]` 재발 방지).
  - 산출물: ➕ `docs/task-record/M2-pathA-ff2-liquidation.md`(단일 진실). crypto-domain-expert description 청산 의미론 보강 적용(genagent, 세션 재시작 시 활성). — **★ scope 정정**: ②"둘 다"+③"AI 필터"로 Step 2~5 재형성 → 토픽 계약(Step 3) 먼저 설계 후 워커 publish(Step 2).

- [x] **Step 2 — 워커 forceOrder publish 가산 (휴면) ✅ (2026-06-27, `359db77`)** — makeTopicPublisher `buildLiveTopics` fan-out + forceOrderWsHandler `publish?`+allowlist(방송만, insert 무회귀, insert await 전 저지연) + index.ts 배선. worker 231 test. code-reviewer 0C/1W(저지연 순서 테스트). [10-72](notional+COINM) Phase B 전 deferred. — 원목표: `forceOrderWsHandler` 에 `publish?` optional 콜백 가산(markPrice/ticker 선례 동형, 미주입 시 no-op = 회귀 0) + `makeTopicPublisher` 를 `datasourceIdFor` 만 청산용으로 바꿔 재사용([10-68] 토대). 단일 객체 → `[row]` 래핑은 기존 insert 경로 그대로. 방송 payload 에 trade_time/도착시각 포함(DB 우회라 freshness 컬럼 보강, markPrice `withBroadcastTimestamp` 선례). — 산출물: ✏️ `apps/worker/src/ws-relay/streams/forceOrderWsHandler.ts`, ✏️ `apps/worker/src/index.ts`(publish 배선 + datasourceIdFor), ✏️ worker `__tests__` — 검증: worker `pnpm -r type-check`·`lint`·test green(+테스트) + **구독자 0 → 토픽 계산조차 안 함(idle 무비용, 회귀 0)** + W2 grep 토픽 리터럴 0 + insert 경로(경로 B) 무변경 — 자문: **code-reviewer** — 예상: 1.5~2시간 (의존성: Step 1 ② 결정 = selectorKeys 가 datasourceIdFor·payload 모양 결정)

- [x] **Step 3 — 청산 datasource + 레지스트리 계약 ✅ (2026-06-27, 3a `3ba6fe1` + 3b `5d36ff3`)** — ★ "둘 다" 토픽 계약이 keystone → **Step 2 보다 먼저**. 3a=토픽 프리미티브(`optionalSelectorKeys`+`buildLiveTopics`, 단수=복수 마지막 원소 파생, 회귀0). 3b=★**liquidation datasource 이미 존재**(resolveDatasourceTable 테스트가 중복 적발) → "신설" 아닌 ff#1 식 플립: 기존 엔트리에 `liveTopicSpec` 추가(transport realtime 휴면). 컴포넌트 등록+refine 일반화는 Step 5(React 카드와 한 몸). — 원목표: 신규 청산 datasource 엔트리 등록 — `liveTopicSpec`(Step 1 ② selectorKeys) + queryableFields(side/price/quantity/trade_time 등) + `transport`(이 단계까진 `realtime` 유지 또는 ws_direct 명시하되 워커 미배포라 데이터 0 = 휴면). buildLiveTopic 이 워커·프론트 단일 진실(토픽 리터럴 금지). AI 비노출(promptInjection 제외). — 산출물: ✏️ `packages/shared/src/registries/defaults.ts`(datasource 엔트리), ✏️ `packages/shared/src/registries/__tests__` — 검증: shared registries test green + buildLiveTopic 왕복(워커 datasourceIdFor 와 동일 토픽 산출) + 기존 datasource 회귀 0 + AI 프롬프트에 청산 datasource 미노출 증명 — 자문: **zod**(엔트리 스키마) — 예상: 1.5시간 (의존성: Step 1 ②)

- [x] **Step 4 — 프론트 피드 훅 `useDataServiceFeed` (이벤트 누적, 휴면) ✅ (2026-06-28)** — `useDataServiceFeed.ts` 신규(append-only ring buffer, `content` updateMode 첫 실사용) + `FeedEvent{seq,arrivedAt,row}`/Options/Result 타입 + `toServiceStatus` export. 불변식 A~F(getSnapshot verbatim/ingestion cap O(limit)/훅 로컬 seq/재구독 clear/ws_direct 전용 휴면/★(F) selector 값기준 메모이즈+filter ref 라이브=불안정 참조 무한루프 차단). web type-check/lint clean + 310 test(+12) + code-reviewer 0C/3W(전부 반영). `[10-71]` 회수(web lint 첫 부팅 → 잠복 react-hooks/refs 22건 근본 수정). transport 휴면=화면 변화 0. 단일 진실 task-record §3. — 원목표: 기존 `useDataServiceRow`(단일 최신 row)·`useDataServiceTable`(스냅샷 목록)과 별개로, **이벤트가 들어오고 나가는 append-only ring buffer 훅** 신설. ws_direct 토픽 구독 → 도착 이벤트를 상한 N개 버퍼에 prepend, 초과분·노화분 제거. 이것이 PRD §3 `content` updateMode(항목 동적 추가/제거)의 **첫 실사용**. 미접속/데이터 0 시 빈 배열 graceful. — 산출물: ➕ `apps/web/lib/dataService/useDataServiceFeed.ts`, ✏️ `apps/web/lib/dataService/__tests__` — 검증: web type-check·lint·test green + 이벤트 append/노화/상한 동작 + **unmount 시 토픽 구독 해제(누수 0)** + ws 끊김→재연결 후 재구독 — 자문: **nextjs-frontend**(저사양 UHD620: append rerender 빈도 제어·rAF/throttle) — 예상: 2.5~3.5시간 (의존성: Step 3)

- [ ] **Step 5 — 신규 LiquidationFeedCard + config 스키마 + 레지스트리 등록 (Phase A 완결)** — 목표: 청산 피드 전용 카드(행이 위에서 흘러내리는 tape UI) — `useDataServiceFeed` 소비 + Step 1 ④ 표현(롱/숏 색·임계 강조·USD 정렬). 카드 config zod 스키마 + `updateMode:"content"`. `componentRegistry` + `registerCards` 양쪽 등록(파생 가드). **Phase A 완결 = 워커 미배포라 카드 생성해도 데이터 0 = 화면 변화 0**(휴면 검증). — 산출물: ➕ `apps/web/components/cards/LiquidationFeedCard.tsx`, ✏️ `componentRegistry.ts`, ✏️ `registerCards.ts`, ✏️ card config 스키마 — 검증: type-check·lint·test green + 빈 피드 graceful 렌더(crash 0) + registry 파생 가드(양쪽 등록) + 저사양 100+ 항목 가상화/throttle 안정 — 자문: **nextjs-frontend**(가상화), **zod**(config), **security-auditor**(청산 행에 free-text/심볼 등 사용자 표시 필드 escape) — 예상: 3~4시간 (의존성: Step 4)

- [ ] **Step 6 — Phase B 라이브 플립 + G2 (사용자 협업)** — 목표: 워커 재배포(Hetzner) → datasource `transport:ws_direct` 플립 → 라이브에서 청산 이벤트가 카드에 흐르는지 실측. **경로 A = DB 우회라 site=DB 불가 → site=방송 payload 교차검증**(Binance USDM 청산 발생 ↔ 카드 항목 side/price/qty 일치, `feedback_external_api_live_smoke`). — 산출물: ✏️ `docs/task-record/M2-pathA-ff2-liquidation.md`(✅ 완결), ✏️ `docs/deferred-task.md`, ✏️ ROADMAP 본 섹션 — 검증: **G2-A** 청산 이벤트 실시간 흐름(육안+간격 샘플링) + **G2-B** 카드 항목 = Binance 청산 데이터 교차일치 + **G2-C** WS 끊김→재연결 graceful(crash 0) + **G2-D** 기존 경로 A/B 카드 무중단 공존 + 자문 0 Critical — 자문: **crypto-trader**(최종 UX), **code-reviewer**, **security-auditor** — 예상: 2~3시간

> **scope 차단선 (이 fast-follow = 청산 피드 카드 하나)**: ❌ 호가(ff#3) 선행 ❌ 타 거래소(OKX/Bybit) ❌ 뉴스/온체인 ❌ `[10-12]` WS 수신부 3중복 리팩터 ❌ `[8-27]` 6건 전면 회수(transport 칸만). content updateMode 의 reactive 확장은 M2+ 별도.

- 각 항목은 착수 시 `@roadmap-milestone-manager` 분해 + plan mode. 그 후 새 테마(OKX 등 타 거래소 / 뉴스·온체인 / 차트 테마 D).
- ❌ 타 거래소(OKX/Bybit) WS 직결 = 토대 재사용 대상이나 **별도 테마**. 토픽 규약·transport 메타는 "거래소 무관 범용" 으로 이미 설계됨(확장성).
- ❌ 실시간 뉴스/온체인 어댑터 = 동일 토대 재사용 후보지만 **본 테마 scope 밖**.
- ❌ `[10-12]` BaseWsConnection 전면 리팩터 = 곁다리. WS 서버 송신부만 손대고, 수신부 3중복 추출까지 끌고 가면 Step 폭발 → Step 분리 또는 잔여 유지.
- ❌ `[8-27]` 6건 전면 회수 = transport 칸(#1 부분)만. fetchKind/나머지는 비-거래소 소스 추가 시.

**비전공자 설명**
경로 B(현재)는 "거래소 → 창고(DB) → 창고 알림 → 화면"인데, 창고 알림이 0.5초마다 뭉텅이로 와서 가격이 "툭툭" 끊겨 보입니다(박동). 경로 A는 "거래소 → 공장(Hetzner) → 화면 직행"으로 창고를 건너뛰어 물이 흐르듯 부드럽습니다.
이번 작업의 핵심은 **"바이낸스 ticker 전용 직행로"를 짓지 않는 것**입니다. Step 1·3 에서 "어떤 거래소·어떤 데이터든 꽂을 수 있는 범용 직행로 + 자동 분기 스위치"를 먼저 깔고(토대), Step 4 에서 그 위에 ticker 하나만 얹어 "박동 사라짐"을 직접 확인(증명)합니다. 그래야 다음에 청산·OKX·뉴스를 "스위치 하나"로 같은 직행로에 태울 수 있습니다.

---

## §L — Launch Readiness Checklist (웹 배포 및 운영 시작)

Launch는 **마일스톤이 아니라 체크리스트**입니다.
확장 루프를 돌리다가, 아래 체크리스트를 통과하면 언제든 배포 가능합니다.

### L.1 — 기능 최소 요건

- [ ] 4개 거래소(Binance, OKX, Bybit, Bitget) 중 **최소 2개**가 spot + futures 모두 연결 (경로 A + 경로 B)
- [ ] 최소 **5종 이상**의 컴포넌트가 `componentRegistry`에 등록됨
- [ ] 뷰 저장/불러오기 (좌측 "My Views" 패널) 동작
- [ ] Drill-down 인터랙션 사용 가능 (spawn은 M1부터 이미 있음)
- [ ] 이메일 + 최소 **1개 소셜 로그인** (예: Google)
- [ ] 뉴스 피드 1개 이상 통합
- [ ] Tavily 웹 검색 폴백 동작 (희귀 쿼리 대응)
- [ ] **(외부 베타 진입 시 M1.7 Step 1~6 에서 완료, 현재 보류 — `docs/M2-plan.md` 2026-05-18)** `user_allowlist` 기반 signup 게이팅 on/off 스위치 존재 (closed/open beta 전환 가능)
- [ ] **(외부 베타 진입 시 M1.7 Step 1~6 에서 완료, 현재 보류)** 유저별 `/api/orchestrate` 일 rate limit + UI 사용량 고지 (English) 동작
- [ ] **(외부 베타 진입 시 M1.7 Step 1~6 에서 완료, 현재 보류)** `/admin` 페이지 로그인 가능 + Tier 1 5개 기능 사용 가능

### L.2 — 안정성·보안

- [ ] Supabase RLS가 모든 `user_*`, `log_*` 테이블에 적용됨 (CI로 자동 검증)
- [ ] `dataService`를 경유하지 않는 Supabase 직접 호출이 어디에도 없음 (grep 검증)
- [ ] AI 오케스트레이터가 외부 API를 직접 호출하지 않음 (Tavily만 예외)
- [ ] Zod 검증 실패 시 크래시 없이 fallback UI 표시 (E2E 테스트)
- [ ] 환경 변수가 프론트엔드에 노출되지 않음 (`NEXT_PUBLIC_*` 이외 검증)
- [ ] 사용자 거래소 API 키는 Edge Functions에서만 복호화, **읽기 전용**
- [ ] **거래 실행 코드가 어디에도 존재하지 않음** (검색 검증) — TRAVIS는 compliance boundary로 read-only
- [ ] Haiku 재시도 로직 + 로깅 동작 확인

### L.3 — 관측·운영

- [ ] **Hetzner VPS 프로비저닝 + `apps/worker` 배포** (M1에선 로컬 실행, Launch 전에 실서버로 이전)
- [ ] Hetzner에서 워커가 24시간 무중단 동작 (pm2 재시작 카운트 0) — 기존 M1.3 완료 기준에서 이관
- [ ] Hetzner 워커 상태 모니터링 (최소: pm2 상태, 로그 파일 기반이라도 OK)
- [ ] Supabase DB 크기 + 쿼리 레이턴시 알림 (`ARCHITECTURE.md §10`의 하이브리드 전환 트리거 감지)
- [ ] AI 검증 실패율 알림 (임계치는 운영 중 튜닝)
- [ ] 거래소 WS 재연결 실패 알림
- [ ] Supabase Realtime 끊김 감지
- [ ] Vercel 배포 실패 Slack/이메일 알림 (선택)

### L.4 — 법적·정책

- [ ] 서비스 약관, 개인정보 처리방침
- [ ] 면책 조항 (TRAVIS는 거래 실행 안 함, 투자 조언 아님)
- [ ] GDPR/쿠키 고지 (글로벌 대상이므로 필수)
- [ ] 거래소 제휴(어필리에이트) 정책이 있다면 고지

**Launch 이후 작업**: 확장 루프 계속 + 운영 피드백 반영 + `ARCHITECTURE.md §10`의 Phase 2(하이브리드 스토리지) 트리거 모니터링.

---

## 스토리지 확장 (장기)

`docs/ARCHITECTURE.md §10`의 3단계 전환 전략을 따릅니다:

- **Phase 1** (초기): Supabase only
- **Phase 2** (임계점 도달 시): Supabase + TimescaleDB/ClickHouse 하이브리드 — **`dataService` 내부 구현만 교체**
- **Phase 3** (장기, 선택): S3/R2 Parquet + DuckDB/ClickHouse cold query (장기 archive)

`dataService`가 M1.1부터 존재하므로 AI와 프론트 코드는 **건드리지 않습니다**. 이것이 "deferred migration" 전략의 핵심.

---

## 비전공자를 위한 "로드맵 읽는 법" 요약

- **M1은 엔드투엔드 루프 하나를 뚫는 것**이 유일한 목표. 기능 욕심 금지.
- **M1.1 → M1.2 → M1.3 → M1.4 → M1.5 → M1.6** 순서를 바꾸면 막힙니다.
- **M2 이후는 "7단계 확장 루프"를 반복**하는 것이 전부. 새 기능 추가 시마다 이 7단계를 돌리세요.
- **Launch는 날짜가 아니라 체크리스트**. §L이 녹색이 되는 날이 Launch.
- **"구체적인 건 그때 결정"** 원칙을 M1에서도 지키세요. 컬럼·인덱스·폴링 수치를 지금 확정하지 마세요.
- **4개 레지스트리 패턴을 위반하는 순간 TRAVIS는 TRAVIS가 아님**. 오케스트레이터 코드 변경이 필요해지면 재설계 신호.

---

## 향후 결정 필요 사항 (Deferred Decisions)

이 로드맵은 의도적으로 아래 항목을 **현재 결정하지 않습니다**. 해당 단계 도달 시 그때 결정합니다:

- 구체적인 Supabase 테이블 이름·컬럼·인덱스 (M1.3부터 점진 결정)
- ~~폴링 tier별 구체 주기 (M1.3 구현 중 결정, 이후 튜닝)~~ → **M1.3 Step 4에서 확정 (2026-04-19)**: Tier 없이 ticker 3s / premium 30s / perSymbol 직선 순회 실질 주기 ~341s. kline은 Step 5 WS로 이관. 확장 루프에서 사용자 로그 기반 튜닝은 계속.
- `_history_*` 테이블의 보존·다운샘플링 정책, 인덱스 구성, 파티셔닝 단위, 저장 컬럼 범위 (확장 루프에서)
- Drill-down 인터랙션의 UI 형태 (확장 루프에서)
- 뷰 저장 포맷·공유 URL 스펙 (확장 루프에서)
- `_now` 사전 계산 대상 지표의 구체 목록 및 승격 기준 (사용자 로그 분석 후)
- `_history` 기반 카드의 기본 갱신 주기(refreshInterval) 및 사용자 조절 범위
- TradingView 임베드 vs 자체 차트 컴포넌트의 구체적 분기 기준
- TimescaleDB vs ClickHouse 선택 (실데이터 쿼리 패턴 관찰 후)
- Launch 시점 및 소셜 로그인 첫 제공자 선택 (확장 루프 진행 중 결정)
- Claude Code 워크플로우 부트스트랩(커스텀 agent/command) 도입 시점 (필요 시 M1 진행 중 추가 가능)
- ~~`volume_chg_5m` M1.4 UI 표기 정책~~ → **2026-04-20 결정: 옵션 A (근사 뱃지 + 툴팁)**. M1.4 카드에서 컬럼 노출 + "(근사)" 뱃지 + hover 툴팁. Step 5 WS 연결로 해석 B 전환 완료 시 뱃지 제거. 상세: `docs/task-record/M1.3-step4-polling-precompute.md` §volume_chg_5m M1.4 UI 표기 정책.
- **Hetzner VPS 배포 시점·스펙·지역**: 2026-04-19 결정으로 M1 이후(Launch Readiness §L.3)로 연기. 구체 스펙(권장 후보: CAX21 ARM 4vCPU/8GB/€7.21·월), 지역(권장 후보: Hillsboro OR 또는 Helsinki), 배포 방식(pm2 + SSH 또는 GitHub Action)은 M1 완료 후 결정.
- **Supabase Pro plan ($25/월) 업그레이드 결정**: 2026-04-20 Step 5 1시간 smoke 에서 Free tier compute sleep + cold-start + shared compute 리소스 한계로 인한 Cloudflare 522 간헐 발생 확인. 단기 처방(warm-up ping, 대시보드 keep-alive)으로 완화 가능하나 근본 해결은 Pro plan. **M1.4 카드 구현 중 Supabase 장애가 실제로 작업을 방해하는 시점에 결정** (실측 ROI 기반). 대안: Hetzner self-host Postgres — Launch Readiness §L.3 VPS 배포와 함께 검토 가능. 진단·처방 상세: `docs/task-record/M1.3-step5-ws-relay.md` §Supabase Free Tier 한계 진단.

이 목록은 살아있는 문서로, 결정이 확정될 때마다 해당 항목을 제거합니다.
