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

- [ ] **Step 5 — WS 릴레이 서버 (경로 A + kline 스트림)** (예상: 3~4시간)
  - 산출물: ➕ `apps/worker/src/ws-relay/{BinanceWsRelay,RelayServer,index}.ts`, ✏️ `apps/worker/src/index.ts`
  - 스트림: !ticker@arr, !miniTicker@arr (spot+futures), !markPrice@arr@1s, !forceOrder@arr (futures), **`!kline_{1m,5m,1h,1d}@arr` (Step 4에서 이관)**
  - 검증: 테스트 WS 클라이언트 → spot+usdm+coinm tick 수신 + 자동 재연결 + 청산 → DB 저장 + kline 스트림이 `history_*_kline` 테이블에 upsert
  - **Step 4 후속 전환 작업**:
    - `volume_chg_5m` 계산을 해석 A(24h rolling 차분) → **해석 B(kline 5m 실거래량 비교)**로 전환. preCompute.ts의 입력 소스만 1m kline 합으로 교체. 컬럼명 유지.
    - `tickerWindow` push 시점을 3초 REST가 아닌 1초 WS(`!miniTicker@arr`)로 전환 고려 (메모리 채움 속도는 RollingWindow의 sampleIntervalMs가 자동 throttle).

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
- 카드 컨테이너 공통 컴포넌트: 드래그/리사이즈/삭제/헤더
- 컴포넌트 3개 (각각 `componentRegistry`에 등록):
  - `TickerCard` — 단일 심볼 실시간 가격 (**경로 A**: Hetzner WS 직접 구독)
  - `CoinListCard` — 심볼 리스트 + 24h 변동률 정렬 (**경로 B**: Supabase Realtime 구독). **`content` 갱신 모드 지원** — 필터 조건이 주어지면 데이터 갱신 시마다 조건을 재평가하여 목록 항목을 동적으로 추가/제거.
  - `KlineChartCard` — 분봉 차트 (lightweight-charts 라이브러리, **경로 B**: Supabase Realtime)
- 3개 컴포넌트 등록 → `promptInjection()` 출력에 자동 포함되는지 확인
- 액션 디스패처 초기 구현 (spawn만 지원, drill-down은 확장 루프)
- 채팅 입력 바 (shadcn/UI, 아직 AI 연결 안 됨, 클릭 시 dummy 핸들러)
- Zustand 글로벌 상태: 캔버스 노드, 뷰포트, 채팅 상태 (Zustand hook은 client component에서만 사용)
- **갱신 모드 인프라**: 카드 컨테이너가 AI JSON의 `updateMode` 필드를 읽고 갱신 전략을 분기 (`value`: 값만 갱신, `content`: 필터 재평가로 항목 동적 추가/제거). `content` 모드 시 카드 내부에서 Supabase Realtime 이벤트 수신 → 필터 조건 재평가 → 목록 재구성.
- **각 카드가 독립적으로 구독 관리** — 중앙 집중식 구독 금지 (CLAUDE.md 규칙)

**완료 기준**

- [ ] localhost에서 캔버스가 렌더링되고, 줌/팬 동작
- [ ] 개발자 콘솔에서 JSON을 수동 주입하면 3종 카드가 모두 생성됨
- [ ] `TickerCard`는 Hetzner WS로 가격이 1초 이내 갱신
- [ ] `CoinListCard`는 Supabase Realtime 구독 → DB 변경 시 자동 갱신
- [ ] `KlineChartCard`는 과거 kline 로드 + 신규 봉 실시간 추가
- [ ] 카드를 드래그·리사이즈·삭제 가능
- [ ] `componentRegistry`에 3종이 등록됐고, AI 프롬프트 주입 테스트에 나타남
- [ ] `CoinListCard`에 필터 조건 JSON을 수동 주입 → 조건에 맞는 항목만 표시되고, DB 변경 시 목록이 동적으로 갱신되는 것 확인 (`content` 갱신 모드)

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

**완료 기준**

- [ ] `"BTCUSDT 가격 보여줘"` → `TickerCard` 1개 생성 + 실시간 갱신
- [ ] `"거래량 상위 10개 코인 보여줘"` → `CoinListCard` 1개 생성 + 자동 정렬
- [ ] `"BTCUSDT 1분봉 차트 보여줘"` → `KlineChartCard` 1개 생성
- [ ] Zod 검증 고의 실패 테스트 → 1회 재시도 → 여전히 실패 시 fallback UI 표시, **크래시 없음**
- [ ] `log_validation_failure`에 실패 기록 누적
- [ ] 코드 리뷰 + grep: AI 오케스트레이터가 외부 API(거래소 REST, CoinMarketCap 등)를 **직접** 호출하지 않음 (Tavily는 확장 루프에서 도입)
- [ ] 코드 리뷰 + grep: AI 오케스트레이터가 `dataService` 경유로만 데이터 접근
- [ ] 같은 쿼리를 두 번 보내도 레지스트리 내용에 변화 없으면 안정적으로 같은 결과 (카드 타입 수준에서)
- [ ] `"BTCUSDT 가격 보여줘"` → AI가 `updateMode: "value"` 출력, `"거래량 상위 코인"` → AI가 `updateMode: "content"` + `filters` 출력 확인
- [ ] `content` 모드 카드에서 DB 데이터 변경 시 필터 재평가로 목록 항목이 동적으로 추가/제거되는 것 E2E 확인

**의존성**: M1.2, M1.3, M1.4 완료

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
- 기존 `log_validation_failure`에 RLS 추가 (service role → user 기반)
- 채팅 전송 시 `log_chat` 자동 기록
- 카드 상호작용 시 `log_behavior` 자동 기록 (구체 이벤트 목록은 구현 중 결정)
- CI 검증 스크립트: `user_*`, `log_*` 테이블 중 RLS 없는 테이블 존재 시 빌드 실패 (간단한 SQL 스크립트로 충분)

**완료 기준**

- [ ] 이메일 가입 → 확인 메일 → 로그인 → 대시보드 접근
- [ ] 비로그인 상태에서 `/api/orchestrate` 호출 시 401 거부
- [ ] 테스트용 2번째 계정으로 다른 사용자의 로그 접근 시도 → RLS가 차단
- [ ] CI RLS 검증 스크립트가 일부러 RLS 없는 테이블 생성 시 빌드 실패하는지 고의 테스트
- [ ] `log_chat` / `log_behavior`에 실제 기록이 쌓이는 것 Supabase Studio에서 확인

**의존성**: M1.5 완료

**비전공자 설명**
"집에 출입증 시스템을 다는 단계". 이 단계 이후부터는 누가 무엇을 했는지 블랙박스에 남습니다.
이 로그는 이후 확장 루프에서 "복잡한 쿼리일 때 Sonnet을 호출할지 말지" 판단 기준 데이터로 쓰입니다. **M1에서 쌓아두지 않으면 나중에 못 쓰는 데이터**이므로 지금 넣어둡니다.

---

### M1 완료 선언 조건

M1.1 ~ M1.6의 모든 완료 기준을 충족한 시점에 M1 완료. 이때 TRAVIS는:

- "말로 화면을 조립한다"는 핵심 비전이 **로컬 환경에서 엔드투엔드**로 증명됨 (실서버 이전은 Launch 단계)
- 4개 레지스트리 패턴이 실제로 작동 (dummy가 아닌 Binance·3종 컴포넌트·실 데이터소스·spawn 인터랙션)
- `dataService` 추상화 레이어가 모든 데이터 접근을 통제
- 로깅·인증·RLS·CI 검증 모두 동작

**M1 종료 직후 권장 작업**: `docs/ROADMAP.md §L` Launch Readiness Checklist를 훑어보기. 아직 Launch 시점이 아니더라도, 체크리스트 존재 자체를 확인하면 확장 루프에서 무엇을 챙겨야 할지 가시화됩니다.

---

## M2 이후 — 확장 루프 (Extension Loop)

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
| 10   | 어드민               | 사용자 관리, 시스템 모니터링, 로그 분석 대시보드                                | 1~2                   |

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

이 목록은 살아있는 문서로, 결정이 확정될 때마다 해당 항목을 제거합니다.
