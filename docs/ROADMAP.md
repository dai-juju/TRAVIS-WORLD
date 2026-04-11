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

### 4) `dataService` 추상화 레이어

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
- `packages/dataService`: 추상화 레이어 인터페이스 (`IDataService`) + Supabase 구현 (`SupabaseDataService`) 스켈레톤
- `supabase/migrations/` 디렉터리 생성 (아직 실제 테이블 없음)
- Supabase 프로젝트 생성 + `apps/web`과 `apps/worker`에서 연결 확인
- Vercel 연동 (GitHub push → 자동 배포)
- ESLint + Prettier + `type-check` 스크립트 (`pnpm lint`, `pnpm type-check`)
- `.env.example` — Supabase URL/키, Claude API 키 자리 (실제 키는 `.env.local`, gitignore)

**완료 기준**
- [ ] 루트에서 `pnpm install` 성공
- [ ] `pnpm -F web dev` → `localhost:3000`에 빈 Next.js 페이지 표시
- [ ] `pnpm -F worker dev` → 워커가 로컬에서 "hello" 출력 후 정상 종료
- [ ] `pnpm lint` + `pnpm type-check` 모두 통과
- [ ] `IDataService` 인터페이스 파일 존재, `apps/web`에서 import 가능
- [ ] `main` 브랜치에 push 시 Vercel 자동 배포 성공

**의존성**: 없음 (첫 단계)

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
  - `datasourceRegistry.ts` — 데이터 소스 메타 스키마 (schema, refresh interval tier, query capabilities) + 등록 함수
  - `componentRegistry.ts` — 컴포넌트 메타 스키마 (필요한 데이터 shape, 지원 사이즈, 지원 인터랙션) + 등록 함수
  - `interactionRegistry.ts` — 인터랙션 타입 스키마 (spawn, drill-down 등) + 등록 함수
- 각 레지스트리의 Zod 스키마 (AI 시스템 프롬프트 주입용 직렬화 함수 포함)
- `packages/shared/registries/promptInjection.ts` — 4개 레지스트리 → AI 시스템 프롬프트 텍스트로 자동 변환
- `apps/worker` 어댑터 패턴용 공통 인터페이스: `IExchangeAdapter`, `IWsRelay`, `IPoller`

**완료 기준**
- [ ] 4개 레지스트리 각각에 dummy 항목 1개 등록 → `promptInjection()` 호출 시 AI가 읽기 가능한 텍스트 출력
- [ ] Zod 검증이 dummy 항목에 통과
- [ ] 단위 테스트: 레지스트리에 새 항목 추가 → `promptInjection()` 출력에 자동 반영 확인
- [ ] 4개 레지스트리 인터페이스가 모두 `packages/shared`에 모여 있어 `apps/web`과 `apps/worker` 양쪽에서 import 가능

**의존성**: M1.1 완료

**비전공자 설명**
"AI가 볼 메뉴판 4장"을 미리 만드는 단계입니다. 메뉴판 자체는 비어있어도 되지만, 메뉴판의 **형식**은 고정해야 합니다. 나중에 "김치찌개"를 추가했을 때 AI가 자동으로 그걸 주문할 수 있게 됩니다.

---

### M1.3 — 데이터 파이프라인 최소 경로 + Hetzner 실서버 배포

**목표**
Binance(spot + futures) 어댑터 1개 → Hetzner 실서버에서 돌아가는 워커 → Supabase에 데이터 종류별로 분할된 테이블로 upsert → `dataService` 경유 조회 가능.
경로 A(WS 스트리밍)와 경로 B(폴링) 모두 최소 1개씩 동작.

**산출물**
- Hetzner VPS 프로비저닝 (Ubuntu, Node.js LTS, pm2 또는 systemd)
- `apps/worker`를 Hetzner에 배포 (GitHub Action 또는 SSH 기반 배포 스크립트, 방식은 구현 중 선택)
- Binance 어댑터 구현 (spot + futures, market type 배열로 선언, **배치 API 필수**)
- 레지스트리 등록: Binance 어댑터, M1 단계에 필요한 최소 데이터소스 엔트리
- Supabase 마이그레이션 (테이블 이름/컬럼은 **구현 중 결정**, 카테고리만 고정):
  - `_now_*` 계열 — Hetzner 폴링 결과의 최신 스냅샷 (경로 B용)
  - `_history_*` 계열 — 시계열 축적 (M1에선 스키마만, 실제 backfill은 확장 루프에서)
  - `exchange_*` 계열 — Binance 심볼 메타데이터 (`exchange_symbols`가 유력 후보, 이름은 구현 중 확정)
  - `log_validation_failure` — AI 검증 실패 로그 (RLS는 M1.6에서 추가, 이 단계에선 임시로 service role 기반)
- 폴링 스케줄러 (tier 기반: high/mid/low 변동성, **구체 수치는 구현 중 결정**, **per-symbol 폴링 금지**)
- WS 릴레이 서버: Binance spot + futures WS 연결 유지, 정규화된 포맷으로 프론트 릴레이 준비
- `dataService`에 M1 필수 메서드 구현 (예: 심볼 조회, 티커 조회, 최근 kline 조회). 정확한 메서드 이름·시그니처는 구현 중 결정. `IDataService` 인터페이스 먼저 확장 후 `SupabaseDataService` 구현
- Hetzner → Supabase 쓰기도 `dataService`의 쓰기 메서드 경유 (읽기만 추상화하면 반쪽짜리)

**완료 기준**
- [ ] Hetzner에서 워커가 24시간 무중단 동작 (pm2 재시작 카운트 0)
- [ ] Supabase Studio에서 Binance 데이터가 실제로 채워지는 것 시각 확인
- [ ] `dataService` 호출 → 최신 데이터 반환 확인 (단위 테스트 또는 임시 CLI)
- [ ] `apps/web` 테스트 스크립트에서 Supabase Realtime 구독 → `_now_*` 변경 이벤트 수신
- [ ] WS 릴레이 서버에 테스트 클라이언트 접속 → Binance 실시간 tick 수신
- [ ] 코드 리뷰: 배치 API만 사용됨 (per-symbol 루프 금지)
- [ ] grep 검증: `apps/web`에 `dataService`를 경유하지 않는 Supabase 직접 호출이 존재하지 않음

**의존성**: M1.1, M1.2 완료

**비전공자 설명**
"진짜 데이터 배관"을 까는 단계입니다. 이때 Hetzner 실서버를 처음 띄웁니다. 비유하면 "수돗물이 나오게 공사"하는 단계. 나중에 (M2~) 커피머신(CoinGecko), 정수기(CoinGlass) 등을 같은 배관에 꽂으면 됩니다.

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
  - `CoinListCard` — 심볼 리스트 + 24h 변동률 정렬 (**경로 B**: Supabase Realtime 구독)
  - `KlineChartCard` — 분봉 차트 (lightweight-charts 라이브러리, **경로 B**: Supabase Realtime)
- 3개 컴포넌트 등록 → `promptInjection()` 출력에 자동 포함되는지 확인
- 액션 디스패처 초기 구현 (spawn만 지원, drill-down은 확장 루프)
- 채팅 입력 바 (shadcn/UI, 아직 AI 연결 안 됨, 클릭 시 dummy 핸들러)
- Zustand 글로벌 상태: 캔버스 노드, 뷰포트, 채팅 상태 (Zustand hook은 client component에서만 사용)
- **각 카드가 독립적으로 구독 관리** — 중앙 집중식 구독 금지 (CLAUDE.md 규칙)

**완료 기준**
- [ ] localhost에서 캔버스가 렌더링되고, 줌/팬 동작
- [ ] 개발자 콘솔에서 JSON을 수동 주입하면 3종 카드가 모두 생성됨
- [ ] `TickerCard`는 Hetzner WS로 가격이 1초 이내 갱신
- [ ] `CoinListCard`는 Supabase Realtime 구독 → DB 변경 시 자동 갱신
- [ ] `KlineChartCard`는 과거 kline 로드 + 신규 봉 실시간 추가
- [ ] 카드를 드래그·리사이즈·삭제 가능
- [ ] `componentRegistry`에 3종이 등록됐고, AI 프롬프트 주입 테스트에 나타남

**의존성**: M1.3 완료 (데이터가 흘러야 카드 렌더를 증명 가능)

**비전공자 설명**
"집에 가구를 놓는 단계"지만 아직 사람(AI)은 배치를 지시하지 못합니다. 먼저 가구가 혼자서도 제대로 동작하는지 확인하는 게 목적. 수도(M1.3 Hetzner)는 연결됐으니 수돗물이 가구까지 잘 오는지 본인 눈으로 검증합니다.

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
- Zod 스키마: AI 출력 JSON 형식 (카드 목록 + 데이터 바인딩 + actions 필드)
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

- "말로 화면을 조립한다"는 핵심 비전이 **프로덕션 환경(Hetzner 실서버 포함)**에서 증명됨
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

| 우선 | 카테고리 | 예상 항목 | 루프 반복 횟수 (예상) |
|---|---|---|---|
| 1 | 거래소 | OKX, Bybit, Bitget (각 spot + futures) | 3~6 |
| 2 | 컴포넌트 | Heatmap, PnL 요약, 청산 피드, 오더북, 펀딩레이트 테이블 등 | 5~10 |
| 3 | 데이터소스 | CoinGecko, CoinMarketCap, CoinGlass, 뉴스, 온체인 등 | 5~8 |
| 4 | 인터랙션 | Drill-down (back-navigation 스택 포함), Linked Selection, Hover Preview 등 | 2~4 |
| 5 | 사용자 기능 | 뷰 저장/불러오기, 뷰 공유, 좌측 "My Views" 패널, 우측 세션 로그 패널 | 3~5 |
| 6 | 사용자 거래소 API 키 | Binance/OKX/Bybit/Bitget 개인 키 암호화 저장 (Edge Functions) + 포지션/PnL 카드 | 4 |
| 7 | 뉴스 & 검색 | 뉴스 피드, Tavily 웹 검색 폴백 (~5% 희귀 쿼리), TradingView/YouTube 임베드 | 2~3 |
| 8 | 공유 기능 | Live Signal Links (공유 가능 URL) | 1~2 |
| 9 | 모바일·UX 폴리시 | 반응형 레이아웃, 터치 드래그, 핀치 줌, 성능 최적화 | 3~5 |
| 10 | 어드민 | 사용자 관리, 시스템 모니터링, 로그 분석 대시보드 | 1~2 |

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
- 폴링 tier별 구체 주기 (M1.3 구현 중 결정, 이후 튜닝)
- `_history_*` 테이블의 보존·다운샘플링 정책 (확장 루프에서)
- Drill-down 인터랙션의 UI 형태 (확장 루프에서)
- 뷰 저장 포맷·공유 URL 스펙 (확장 루프에서)
- TimescaleDB vs ClickHouse 선택 (실데이터 쿼리 패턴 관찰 후)
- Launch 시점 및 소셜 로그인 첫 제공자 선택 (확장 루프 진행 중 결정)
- Claude Code 워크플로우 부트스트랩(커스텀 agent/command) 도입 시점 (필요 시 M1 진행 중 추가 가능)

이 목록은 살아있는 문서로, 결정이 확정될 때마다 해당 항목을 제거합니다.
