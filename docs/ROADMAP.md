# TRAVIS — 로드맵

> **이 문서는 WHAT(무엇을 만들지)을 정의하고, HOW(어떻게 만들지)는 개발 중에 결정합니다.**
> 특히 **Supabase 테이블 스키마(컬럼, 타입, 인덱스, 관계)**는 실제 개발 시점에 하나씩 결정합니다. 테이블명/카테고리/RLS 정책은 계획 가능하지만, 내부 컬럼 구성은 사전에 확정하지 않습니다.
> **각 API와 WebSocket에서 가져올 데이터의 구체 필드/조건**, **폴링 주기의 구체 수치** (데이터 특성 기반 고/중/저 변동성 tier 원칙만 사전 결정)도 모두 개발 중 결정합니다.
> 각 마일스톤의 "개발 중 결정할 사항" 섹션이 이러한 deferred decisions를 명시합니다.

## 참조 문서

- `docs/PRD.md` — 제품 요구사항, 타겟 사용자, 경쟁 포지셔닝
- `docs/ARCHITECTURE.md` — 시스템 설계, 데이터 플로우, 4개 레지스트리, 확장 패턴, 스토리지 전략
- `docs/DB_SCHEMA.md` — Supabase 테이블 스키마 (개발 중 점진적으로 작성)
- `.claude/CLAUDE.md` — 프로젝트 불변 규칙 (코드 스타일, 보안, Gotchas)

### 스토리지 확장성 전제

M1~M2(+ 🚀 Launch) 단계는 **Supabase only** 운영으로 출발합니다. 데이터 성장 임계점 도달 시 하이브리드 스토리지 전환 (TimescaleDB 또는 ClickHouse for 시계열). **Data service abstraction layer**가 M1부터 이를 가능하게 하는 safety net을 제공합니다. 자세한 전략은 `docs/ARCHITECTURE.md §10` 참조.

## 개발 단계 개요: 배포 중심 로드맵

TRAVIS는 **M2 완료 시점에 베타 배포(🚀 Launch)**를 목표로 합니다. Launch는 마일스톤이 아닌 **별도의 배포 단계**이며, 새 기능 추가가 아니라 *제품을 실사용자의 손에 놓기 위한 운영 준비와 실행*입니다. Launch 이후 마일스톤(M3~M5)은 실사용자 피드백과 사용 로그를 기반으로 **데이터 소스와 기능을 점진적으로 보강**합니다.

```
Pre-launch:   M1 (Foundation + Core Loop)
                 → M2 (Realtime + Canvas + 4 Exchanges)
                              │
                              ▼
              🚀 Launch (베타 배포 + 실사용자 피드백 루프 가동)
                              │
                              ▼
Post-launch:  M3 (Complex queries + Personalization)
                 → M4 (Sharing + On-chain + Data expansion)
                 → M5 (Auth + Admin + Mobile + DR + Storage scale-out)
```

**핵심 원칙**: M1~M2는 *shippable product* 구축, 🚀 Launch는 *실사용자 만나기*, M3~M5는 *실사용자 데이터 기반 보강*입니다. Launch에서 수집한 쿼리 패턴, 에러 분포, 사용 로그가 M3~M5의 모든 의사결정의 근거가 됩니다.

## 데이터 플로우의 세 가지 역할 (아키텍처 요약)

TRAVIS의 데이터 플로우는 **세 주체가 명확히 분리된 역할**을 가집니다. 이 분리는 마일스톤 전체에서 non-negotiable 원칙입니다.

### 1. Supabase DB = AI의 세계관 (single source of truth for AI)

- 테이블/스키마/컬럼별로 코인/시장 데이터를 구분 (컬럼 구성은 개발 중 결정)
- 데이터 특성별 차별화된 폴링 주기 (고/중/저 변동성 tier 원칙, **구체 수치는 개발 중 결정**)
- Hetzner 워커가 **배치 API**를 활용해 모든 심볼을 효율적으로 수집
- **항상 최신 상태 유지** — AI가 쿼리할 때 stale 데이터가 없어야 함

### 2. AI 오케스트레이터 = Supabase 조회자 (+ Tavily fallback)

- 사용자 쿼리 → Haiku → **항상 Supabase DB에서 데이터 조회** → JSON 카드 설정 반환
- Supabase에 데이터가 없거나 웹 검색이 필요한 쿼리 → **Tavily 폴백** (~5% 수준)
- **AI는 거래소 REST API, CoinMarketCap, 뉴스 API 등을 직접 호출하지 않음** — 오직 Supabase (또는 Tavily fallback)
- AI는 **`dataService` abstraction layer**를 경유하여 데이터에 접근 (미래 스토리지 마이그레이션 safety net)

### 3. WebSocket = 프론트엔드 실시간 갱신 레이어

WebSocket은 **프론트엔드 카드의 live 값 갱신 전용**이며, **AI 의사결정에는 사용되지 않습니다**. 두 경로가 공존합니다:

**경로 A — 거래소 WS 직접 (Path A)**: 고빈도 거래소 스트림 (trades, orderbook, ticker 등)
```
거래소 WebSocket → Hetzner WS 릴레이 → 프론트엔드 직접
```
- Supabase를 거치지 않음 — 실시간 프레젠테이션 전용
- 예: "BTC/USDT 가격 카드"가 렌더된 후 가격 틱이 ms 단위로 갱신

**경로 B 경유 — Supabase Realtime**: WebSocket으로 직접 지원되지 않는 데이터
```
소스 API → Hetzner 폴링 → Supabase upsert → Supabase Realtime broadcast → 프론트엔드
```
- Hetzner 워커가 폴링한 데이터를 Supabase `_now` 테이블에 upsert
- Supabase Realtime이 변경 이벤트를 구독 중인 프론트엔드에 broadcast
- 예: 뉴스 카드, 펀딩레이트 카드, 온체인 카드 등이 이 경로로 갱신

**중요 함의**:
- AI는 Supabase 스냅샷 시점의 세계를 봄 (실시간 스트림 아님)
- 폴링이 느리면 AI가 낡은 데이터로 결정 → 폴링 주기 튜닝은 *AI 품질 요소*
- 프론트엔드 실시간성은 WebSocket 두 경로가 담당 → AI는 "수 초~수 분 이내 데이터" 신선도로 충분

## 마일스톤 개요

| 단계 | 마일스톤 | 핵심 목표 | 주요 결과물 |
|------|---------|----------|------------|
| Pre-launch | **M1** Foundation + Core Loop | 자연어 → AI → 카드 렌더 E2E | 내부 alpha — Binance 단일, 폴링, spawn, 운영 인프라 |
| Pre-launch | **M2** Realtime + Canvas + Exchange | 실시간 + 캔버스 + 4거래소 | Launch-ready — Path A WS, 저장 뷰, drill-down |
| **배포** | **🚀 Launch** | **베타 오픈 + 실사용자 피드백 루프** | **관찰 가능성, 롤백 플랜, 초기 사용 로그** |
| Post-launch | **M3** Complex queries + Personalization | Sonnet 튜닝 + 개인 데이터 | Sonnet 라우팅 (데이터 기반), API 키, 분석 도구 |
| Post-launch | **M4** Sharing + On-chain | 외부 공유 + 데이터 확장 | Live Signal Links, 온체인, 추가 소스 |
| Post-launch | **M5** Auth + Admin + Mobile + DR + Storage | 프로덕션 완성도 | 소셜 로그인, 어드민, 모바일, 백업/DR, 스토리지 확장 |

---

## M1 — Foundation + Core Loop

**단계:** Pre-launch
**목표:** "자연어 입력 → AI가 의도 판단 → 캔버스에 카드 렌더" 엔드투엔드 동작 + Launch 준비를 위한 운영 기반 구축.
**의존성:** 없음 (프로젝트 시작점).

### M1의 역할 — 5-axis 확장의 구조적 토대

M1은 **5-axis 수평 확장의 구조적 토대**를 마련하는 단계입니다. 5축은 다음과 같습니다:

1. **거래소 어댑터** (exchange adapter registry)
2. **데이터 소스** (datasource registry)
3. **Supabase 테이블** (`_now` / `_history`)
4. **WebSocket 구독** (Path A 거래소 WS 또는 Path B Supabase Realtime)
5. **컴포넌트** (component registry)

M1에서는 각 축의 **첫 엔트리**만 구현하여 E2E 루프를 검증하고, M2+에서는 동일 패턴으로 엔트리를 반복 추가하는 것이 TRAVIS 확장의 본질입니다. 따라서 M1은 "최소한의 기능이지만 5축 구조가 완전한" 상태를 목표로 합니다.

### 병렬 실행 경로

- **1.2 Supabase ↔ 1.3 Hetzner 워커**: 독립적 인프라 작업 (1.1 이후 즉시 병렬 시작)
- **1.5 AI 오케스트레이터 ↔ 1.6 프론트엔드 코어**: Zod 출력 스키마만 먼저 합의하면 분리 개발 가능
- **1.9 시크릿 & 관찰 가능성**: 1.1 이후 어느 시점에든 시작 (1.7 E2E 와이어링 전까지 완료 권장)

### 세부 단계

#### 1.1 프로젝트 스캐폴딩
- Next.js 16 (App Router) + TypeScript strict mode 초기화
- shadcn/UI (Tailwind v4) 설치 및 초기 컴포넌트 추가
- React Flow (`@xyflow/react` 12) 설치
- Zustand 설치 (클라이언트 전용 사용 규칙 준수)
- ESLint + Prettier 설정
- 기본 폴더 구조: `app/`, `components/`, `lib/`, `stores/`, `schemas/`, `registries/`, `services/` (data service abstraction layer)
- `package.json` 스크립트: `dev`, `build`, `lint`, `type-check`, `test`
- _개발 중 결정:_ 폴더 구조 세부는 첫 컴포넌트 작성 시 확정.

#### 1.2 Supabase 초기 설정
- Supabase 프로젝트 생성 (개발 + 프로덕션 인스턴스 분리)
- Auth 이메일 프로바이더 활성화
- 초기 테이블: `log_chat`, `log_behavior` 생성
- **모든 사용자 테이블에 RLS 정책** (`auth.uid() = user_id`)
- Next.js용 Supabase 클라이언트 (SSR + client 변형)
- **RLS 누락 감지 CI 스크립트** — `user_*`, `log_*` 테이블에 RLS 정책이 없으면 마이그레이션 reject
- _개발 중 결정:_ `log_chat`, `log_behavior`의 정확한 컬럼 구성 (스키마는 개발 중 하나씩 결정하는 원칙 준수).

#### 1.3 Hetzner 워커 스캐폴딩
- Hetzner VPS 프로비저닝
- Node.js/TypeScript 워커 프로젝트 설정
- **거래소 어댑터 공통 인터페이스 정의:**
  - REST + WS 메서드 signature (WS는 스켈레톤, 본격 구현은 M2.1)
  - **심볼 정규화 강제**: 모든 어댑터는 `{exchange, symbol, base, quote}` 형태의 정규화 출력 보장. 거래소별 raw 포맷 차이는 어댑터 내부에서 흡수.
  - **마켓 타입 세분화**: `spot` / `futures_usdm` (USDT-margined perpetual) / `futures_coinm` (COIN-margined perpetual). Dated/quarterly는 **메타데이터 수준 지원** (아래 참조).
- **Binance 어댑터만 M1 구현** — `spot` + `futures_usdm` REST 폴링
- **배치 API 의무화** — Binance `/api/v3/ticker/24hr` (spot), `/fapi/v1/ticker/24hr` (futures)로 **전체 심볼을 단일 호출**. **per-symbol polling 금지** (rate limit 즉시 포화).
- **데이터 특성별 차별화 폴링 주기 (원칙만, 구체 수치는 개발 중 결정)**:
  - **고변동성** (ticker, 단기 kline 등): 고주기 폴링
  - **중변동성** (24h stats, 중장기 kline 등): 중주기 폴링
  - **저변동성** (symbol list, exchange info 등): 저주기 폴링
- 거래소별 응답을 정규화된 공통 포맷으로 변환
- **Rate limit 대응**: 응답 헤더 모니터링 (`x-mbx-used-weight` 등), 429 시 지수 백오프, 안전 마진 유지
- **Symbol discovery 파이프라인**: symbol list 폴링 → `exchange_symbols` (또는 유사) 테이블 upsert → 신규 상장/폐지/**dated 계약 정보 자동 반영**
- **Dated/quarterly 심볼 메타데이터 수집**:
  - Binance dated: `/dapi/v1/` endpoint
  - OKX dated: `instType=FUTURES` (perpetual은 `instType=SWAP`)
  - Bybit dated: 심볼 패턴 (예: `BTCUSDU25` = 2025년 9월 만기)
  - Bitget dated: product type으로 구분
  - **심볼 목록에 포함하여 메타데이터 수준 지원** — 사용자가 dated 심볼을 쿼리하면 정보 조회 가능
  - 스냅샷/실시간 데이터는 perpetual 우선, dated는 배치 API 포함 범위 내 best-effort
- Supabase 클라이언트 (service role key) 연결
- 폴링 스케줄러 (소스별 interval 선언적 설정, tier 기반)
- 프로세스 매니저 (PM2 또는 systemd)
- `/health` 엔드포인트
- _개발 중 결정:_ 워커 저장소 구조, VPS 사양, 각 tier의 구체 폴링 주기값, rate limit 안전 마진, dated 스냅샷 수집 범위.

#### 1.4 4개 레지스트리 (TRAVIS 확장성의 뼈대)
각 레지스트리는 "항목 등록 → AI 자동 탐색" 패턴을 따릅니다. 레지스트리에 등록되면 AI 시스템 프롬프트에 자동 주입되어 오케스트레이터 코드 변경이 불필요합니다.

- **Exchange adapter registry**: Binance 엔트리. `marketTypes` 배열로 지원 마켓 선언 (`["spot", "futures_usdm"]`). `futures_coinm`은 M2.
- **Datasource registry**: ticker, kline, symbol list 초기 엔트리 (스키마 + 갱신 주기 tier + 쿼리 파라미터)
- **Component registry**: 초기 2~3개 컴포넌트 (가격 카드, kline 차트, 코인 목록 등 — 정확한 세트는 개발 중 결정)
- **Interaction registry**: **`spawn`만** 등록 (drill-down은 M2)
- _개발 중 결정:_ 초기 컴포넌트 세트 (M1 demo 쿼리 패턴 기반).

#### 1.5 AI 오케스트레이터 (Path C)
- Vercel API Route (예: `app/api/query/route.ts`)
- Claude API 클라이언트 (Haiku 4.5 primary)
- **시스템 프롬프트에 4개 레지스트리 내용 구조화된 텍스트로 주입**
- **AI의 데이터 소스 = Supabase DB 전용** — 거래소 REST API, CoinMarketCap, 뉴스 API 등을 **AI가 직접 호출하지 않음**. 모든 데이터는 Hetzner 워커가 Supabase에 미리 채워놓은 것을 AI가 SQL로 조회.
- **Data service abstraction layer 경유 의무** — AI는 `supabase.from()` 직접 호출 대신 `dataService.query*()` 인터페이스를 사용. 이 layer가 M1~M2에서는 내부적으로 Supabase만 호출하지만, M3~M4 스토리지 마이그레이션 시 엔진을 교체할 수 있는 safety net.
- Zod 스키마로 AI 출력 JSON 검증
- **검증 실패 시 Zod 에러를 AI에게 feedback → 1회 재시도 → 여전히 실패하면 graceful fallback UI** (절대 크래시 금지)
- **모든 검증 실패를 Supabase에 로깅** (향후 프롬프트 개선용)
- **Sonnet 에스컬레이션 플래그만 구현** — Haiku 출력에 `complexity` 필드 추가, 실제 Sonnet 호출 경로는 M3에서 구현. M3 라우팅 기준을 Launch 실증 데이터로 튜닝하기 위한 사전 준비.
- **Tavily 웹 검색 폴백 스캐폴딩** — M1에서는 인터페이스만 준비. AI 출력 JSON에 `needs_web_search: true` 플래그를 추가할 수 있는 구조만 스캐폴딩. 실제 Tavily 호출은 M3.6에서 활성화.
- **사용자별 Claude API rate limit (비용 제어)**:
  - 일일 호출 quota + burst limit per user
  - 쿼터 초과 시 graceful 메시지
  - Supabase에 per-user usage counter 저장
- **토큰 사용량 로깅** — 각 호출의 input/output token count + 모델명
- _개발 중 결정:_ 시스템 프롬프트 문구, Zod 출력 스키마, fallback UI 디자인, rate limit 수치, abstraction layer interface 구체 형태.

#### 1.6 프론트엔드 코어
- React Flow 무한 2D 캔버스 (줌/팬 기본 동작)
- **커스텀 카드 노드**: 공통 컨테이너(헤더, 바디 슬롯) + 레지스트리 컴포넌트 동적 렌더
- 하단 채팅 입력 바 (placeholder 예: `"ETH 청산 카드 추가해줘"`)
- **Zustand 스토어**: `canvasStore` (nodes, viewport), `chatStore` (messages, input)
- **액션 디스패처**: `spawn` 핸들러 (캔버스에 새 카드 추가 + 데이터 구독 시작)
- Supabase Auth UI (이메일 로그인/회원가입 + 세션 관리)
- `react-error-boundary`로 Error Boundary 적용 (크래시 방지)
- **각 카드의 데이터 구독 경로**:
  - 카드가 Supabase Realtime 구독 (Path B 경유 — 폴링 기반 데이터의 실시간 갱신)
  - 또는 Hetzner WS 직접 구독 (Path A — 고빈도 거래소 데이터, M2 이후 활성화)
  - 구독 중앙집중 금지 — 각 카드가 자체 관리
- **Sentry SDK 연동**: 프론트엔드 uncaught exception 자동 수집 (초기 설정 — 대시보드는 M1.9)
- _개발 중 결정:_ 카드 비주얼 디자인, 캔버스 배경, 로딩/에러 상태 UI.

#### 1.7 엔드투엔드 와이어링
- 사용자 채팅 입력 → API Route → Haiku → JSON → Zod 검증 → 프론트엔드 반환
- 액션 디스패처가 JSON 파싱 → 카드 spawn → Supabase Realtime 구독 시작
- Supabase 데이터 변경 (Hetzner 폴링이 upsert) → Realtime broadcast → 카드 자동 업데이트
- 채팅 로그 (`log_chat`) + 행동 로그 (`log_behavior`) 비동기 저장
- 에러 상태 (API 실패, Zod 실패, 구독 실패) 모두 fallback UI로 처리

#### 1.8 배포 + CI
- GitHub 리포지토리 생성
- GitHub Actions 워크플로우:
  - `lint` (ESLint)
  - `type-check` (`tsc --noEmit`)
  - `build` (Next.js)
  - **`rls-check`** (Supabase 스키마에서 `user_*`, `log_*` 테이블의 RLS 정책 존재 검증)
  - **`test`** (Jest 단위 테스트, Playwright E2E 핵심 플로우)
  - **`no-trade-execution-check`** (grep 기반, M1에 스캐폴딩)
  - **`secret-leak-check`** (빌드 결과물에 환경 변수 값 노출 검증)
- Vercel 프로젝트 연결 → `main` 브랜치 자동 배포
- Hetzner 배포 스크립트 (수동 트리거 GitHub Action 또는 로컬 스크립트)
- 환경 변수 관리 (Vercel + Hetzner 분리, 프론트엔드에 비밀 노출 금지)

#### 1.9 시크릿 관리 & 관찰 가능성 & 테스팅 (운영 기반)
M1의 마지막 서브페이즈로, Launch 준비를 위한 운영 인프라를 구축합니다.

**시크릿 관리:**
- 시크릿 목록: Claude API key, Supabase service role key, Supabase anon key, 거래소 public API key (폴링용, 읽기 전용), Sentry DSN
- 저장 위치: Vercel 시크릿 (프론트엔드/API Route), Hetzner `.env` (워커)
- **소스 코드/로그에 절대 노출되지 않음** (CI `secret-leak-check` 검증)
- 회전 정책: 분기별 정기 회전 또는 노출 의심 시 즉시 회전
- _개발 중 결정:_ 시크릿 관리 도구 도입 여부 (Doppler, Infisical 등).

**에러 트래킹 (Sentry):**
- Sentry 프로젝트 (프론트엔드 + Hetzner 워커 분리)
- Next.js SDK 연동 + Hetzner 워커 Node.js SDK 연동
- 에러 알림 채널 (이메일 또는 Slack)
- _개발 중 결정:_ Sentry 플랜.

**기초 메트릭:**
- Haiku/Sonnet 호출 수 (일별/사용자별), Zod 검증 실패율, Hetzner 워커 health, Supabase `_now` 테이블 freshness
- _개발 중 결정:_ 메트릭 대시보드 도구.

**테스팅 기초 인프라:**
- Jest 설정 (단위 테스트 — stores, utilities, `dataService` layer)
- Playwright 설정 (E2E — signup → query → card render → live update)
- 커버리지 리포트 (Launch 전까지 단위 커버리지 ≥ 50% 목표)
- CI에 테스트 게이트 통합 (1.8)
- _개발 중 결정:_ 정확한 커버리지 임계값.

### 완료 기준

- [ ] 이메일로 회원가입 및 로그인 동작
- [ ] 최소 3가지 간단한 쿼리 패턴이 E2E로 동작 (예: "BTC 가격 보여줘", "ETH 1시간 차트", "거래량 상위 10개 코인")
- [ ] 카드가 Supabase Realtime 경유로 라이브 업데이트
- [ ] 채팅 기록이 Supabase에 영속화되고 재로그인 후에도 유지
- [ ] GitHub Actions CI 모두 통과 (lint, type-check, build, rls-check, test, secret-leak-check)
- [ ] Vercel + Hetzner 배포 성공
- [ ] Zod 검증 실패 시 재시도 후 fallback UI 표시 (크래시 없음)
- [ ] `spawn` 액션 확인
- [ ] **Sentry 대시보드 활성화** — 강제 에러 발생시켜 수집 확인
- [ ] **Jest 단위 테스트 커버리지 ≥ 50%**
- [ ] **Playwright E2E** 핵심 플로우 1개 자동화
- [ ] **Claude API 사용자별 quota 동작 검증**
- [ ] **시크릿이 소스 코드/로그에 노출되지 않음** (CI pass)
- [ ] **심볼 정규화 스키마 강제 검증** (어댑터 인터페이스 타입 테스트)
- [ ] **배치 API 사용 검증** — Binance ticker는 전체 심볼 단일 호출
- [ ] **`dataService` abstraction layer 사용 검증** — AI orchestrator가 Supabase client 직접 호출 0건

### 개발 중 결정할 사항

- `log_chat`, `log_behavior` 테이블 정확한 컬럼 구성 (결정 시점: 1.2)
- Zod 출력 스키마 필드 구성 (결정 시점: 1.5)
- Haiku 시스템 프롬프트 문구 (결정 시점: 1.5)
- Claude API 사용자별 rate limit 수치 (결정 시점: 1.5)
- 초기 컴포넌트 세트 (결정 시점: 1.4)
- 각 tier의 구체 폴링 주기값 (결정 시점: 1.3, 거래소 rate limit 기반)
- Rate limit 안전 마진 구체값 (결정 시점: 1.3)
- Fallback UI 시각적 디자인 (결정 시점: 1.6)
- `dataService` abstraction layer interface 구체 형태 (결정 시점: 1.5)
- Dated 스냅샷 수집 범위 (결정 시점: 1.3, 배치 API 포함 여부 확인 후)
- Sentry 플랜, 시크릿 관리 도구 (결정 시점: 1.9)
- Jest 커버리지 임계값, 메트릭 대시보드 도구 (결정 시점: 1.9)

---

## M2 — Realtime + Canvas interactions + Exchange expansion

**단계:** Pre-launch (Launch-ready 최종 단계)
**목표:** 카드가 WebSocket 실시간 데이터로 업데이트되고, 사용자가 캔버스를 자유롭게 조작하며, 4개 거래소 모두 연결. **M2 완료 시점에 🚀 Launch 준비 완료**.
**의존성:** M1 완료.

### 병렬 실행 경로

- **2.2 거래소 확장 (OKX/Bybit/Bitget)**: M1.3에서 어댑터 인터페이스가 안정되면 **M1 후반부부터 병렬 시작 가능** (M1→M2 hard gate를 soft gate로 완화)
- **2.4 캔버스 인터랙션 ↔ 2.5 저장된 뷰**: 독립적 UI 작업, 병렬 가능
- **2.7 Drill-down**: 2.6의 컴포넌트 추가 이후 착수

### 세부 단계

#### 2.1 Path A — WebSocket **프론트엔드 실시간 갱신 레이어** (고빈도 거래소 스트림)
**중요**: 이 WS 데이터는 **AI 의사결정에 사용되지 않음**. 프론트엔드 카드가 Supabase 기반 AI 응답으로 렌더된 이후, 그 카드의 값(가격 틱, orderbook 변화, trades)을 실시간 갱신하는 용도 전용.

- **Hetzner WS 릴레이 서버** (프로덕션급)
- 프론트엔드 WS 클라이언트 라이브러리
- Symbol 기반 sub/unsub 프로토콜 설계
- 지수 백오프 자동 재연결
- 거래소 WS 끊김 시 릴레이 측 자동 재연결
- 거래소별 메시지를 공통 포맷으로 정규화
- **WS Stream 수 budgeting**: Binance WS는 connection당 최대 1024 streams. **안전 마진 ~200 streams/connection** 적용, 초과 시 자동 connection 분할
- Binance WS 첫 통합 (spot + futures_usdm): ticker, orderbook, trades, kline, funding rate, liquidation
- **Path A는 Supabase를 절대 거치지 않음** — 아키텍처 rule
- _개발 중 결정:_ WS 메시지 포맷, 구독 단위 granularity, stream budget 구체 임계값.

#### 2.2 거래소 확장 (OKX, Bybit, Bitget)
- **OKX 어댑터**: REST + WS, `spot` + `futures_usdm` (`instType=SWAP`). `futures_dated` (`instType=FUTURES`)는 메타데이터만.
- **Bybit 어댑터**: REST + WS, `spot` + `futures_usdm` (linear perpetual) + `futures_coinm` (inverse perpetual). Dated는 심볼 패턴으로 식별하여 메타데이터만.
- **Bitget 어댑터**: REST + WS, `spot` + `futures_usdm` (UMCBL). Dated는 메타데이터만.
- **Binance `futures_coinm` perpetual 활성화** (M1에서는 usdm만 구현)
- **스케일**: Binance spot ~2,500 pairs + futures perpetual ~400. 4거래소 합계 대략 5,000~15,000 고유 instrument. **per-symbol polling 물리적 불가 — 배치 API 필수**.
- **Futures scope (범위 정의)**:
  - ✅ **Perpetual futures primary** — MVP 전체 범위: 메타데이터 + 스냅샷 데이터 + 실시간 WebSocket
  - ✅ **Dated/quarterly 심볼 메타데이터** — symbol list 폴링 시 포함, 사용자가 dated 심볼을 쿼리하면 정보 조회 가능 (MVP 범위 내)
  - ⚠️ **Dated 스냅샷 데이터** (ticker, 24h stats 등) — 배치 API가 dated를 포함하면 자동 수집, 별도 호출 필요하면 M3 이후 low priority
  - ❌ **Dated 실시간 스트리밍** (WS trades/orderbook) — MVP 범위 외 (WS stream budget 고려 시 perpetual 우선)
- 거래소별 API 특이사항 대응:
  - OKX: instrument 타입 enum 필터링
  - Bybit: v5 API unified account 구조 (linear vs inverse 분리)
  - Bitget: product type 구분 (umcbl 사용)
- 모두 공통 포맷으로 정규화 + 심볼 정규화 스키마 강제
- 각 어댑터를 exchange adapter registry에 등록 → **AI가 오케스트레이터 코드 변경 없이 자동 탐색**
- 거래소별 rate limit 별도 관리 (어댑터 내부 설정)
- _개발 중 결정:_ 거래소별 API 특이사항 세부 대응, 각 거래소 symbol 매핑, dated 스냅샷 수집 범위.

#### 2.3 Path B 폴링 데이터 확장 — Registry 기반 5-axis 수평 확장 원칙

**5-axis 수평 확장 원칙**: 각 M2+ 확장 사이클은 다음 **5축을 한 묶음으로** 함께 움직입니다:

1. **거래소 어댑터** (exchange adapter registry) — 새 거래소 또는 기존 거래소의 새 마켓 타입
2. **데이터 소스** (datasource registry) — 새 데이터 타입 (funding, OI, liquidations, 온체인 등)
3. **Supabase 테이블** (`_now` / `_history` + migration) — 데이터 저장소
4. **WebSocket 구독** (Path A 거래소 WS 또는 Path B Supabase Realtime 경유)
5. **컴포넌트** (component registry) — 해당 데이터를 렌더링할 UI 카드

**한 확장 사이클 = 5축 공존**. 새 데이터 타입 하나 추가는 이 5축을 모두 건드리는 것이 자연스러운 단위. **오케스트레이터 코드 변경 0건** (registry-only).

**M2.3 범위 — 추가 폴링 데이터 타입** (M1 최소 세트 외):

- **Funding rate** (선물): 거래소별 funding 주기 상이 (일반적으로 수 시간 주기). 폴링 주기는 funding 주기의 일부 수준 (고변동성 tier와 중변동성 tier 사이, 구체 수치는 개발 중 결정)
- **Open interest** (선물): 중변동성 tier
- **24h 통계** (volume, price change, high/low): 중변동성 tier
- **Taker buy/sell volume**: 중변동성 tier
- 기타 (M1 사용 패턴 기반 결정)

각 데이터 타입에 해당하는 `_now` 테이블 + datasource registry 엔트리 + (필요 시) 컴포넌트 — 5-axis 확장 원칙 준수.

**`_history` 테이블 초기 backfill 전략**:
- M2 시작 시 Binance REST API로 kline 역사 데이터 backfill (일정 기간) → `_history` upsert
- 이후 실시간 append-only
- High-frequency 스트림 (trades, ticks)은 backfill 제외 (용량 문제)
- 기타 `_history` 대상의 주기별 retention 정책 별도 결정

_개발 중 결정:_ 정확한 추가 데이터 타입 리스트 (M1 로그 분석 기반), 모든 `_now`/`_history` 테이블 컬럼 구성, backfill 기간 구체값, 각 데이터 타입의 폴링 주기 구체값.

#### 2.4 캔버스 인터랙션
- 카드 드래그 (마우스)
- 카드 리사이즈 핸들
- 카드 삭제 (헤더 X 버튼 + 단축키)
- 캔버스 팬 (빈 공간 드래그)
- 캔버스 줌 (스크롤)
- 카드 헤더 UI (제목, 닫기, 옵션 메뉴)
- 카드 포커스 상태 시각화
- _개발 중 결정:_ 멀티 셀렉트 포함 여부, 단축키 매핑.

#### 2.5 저장된 뷰 ("My views")
- `user_views` Supabase 테이블 (RLS, **레이아웃 직렬화 컬럼 — 타입은 개발 중 결정**)
- 좌측 패널 UI: 저장된 뷰 목록
- "현재 뷰 저장" / "뷰 불러오기" / "새 뷰" 액션
- 뷰 불러오기 시 **레이아웃 복원 + 모든 카드의 라이브 데이터 재구독**
- 뷰 이름 변경 / 삭제
- _개발 중 결정:_ 뷰 썸네일 생성 여부, 레이아웃 직렬화 포맷 및 DB 컬럼 타입.

#### 2.6 컴포넌트 & 데이터 소스 추가
- M1에서 부족했던 컴포넌트/데이터 소스를 registry 패턴으로 추가 (5-axis 확장 사이클)
- 추가 후보: 히트맵, 펀딩레이트 테이블, OI 차트, 청산 지도 등
- **모든 추가는 오케스트레이터 코드 변경 없이 registry 등록만으로 완료**
- _개발 중 결정:_ 컴포넌트 우선순위 (M1 로그 기반).

#### 2.7 Drill-down 인터랙션
- 액션 디스패처에 `drill-down` 핸들러 추가
- 카드별 back-navigation 스택 상태 관리
- 컴포넌트 registry에 `supportsDrillDown: true` 옵트인
- AI가 맥락에 따라 `spawn` vs `drill-down` 자동 선택
- 뒤로 가기 UI (카드 헤더 ← 버튼)
- _개발 중 결정:_ drill-down 지원 컴포넌트 우선순위.

### 완료 기준

- [ ] 4개 거래소 WS 스트리밍 안정 (8+ 커넥션, 자동 재연결 검증)
- [ ] **Path A 데이터가 Supabase를 거치지 않음** (코드 리뷰 + 네트워크 트레이스 검증)
- [ ] **WS stream 수가 거래소별 안전 마진 내 유지**
- [ ] 카드 드래그/리사이즈/삭제 + 캔버스 팬/줌 부드럽게 동작
- [ ] 뷰 저장 → 로그아웃 → 재로그인 → 뷰 불러오기 시 라이브 데이터 복원
- [ ] 최소 1개 컴포넌트에서 drill-down 인터랙션 동작
- [ ] M1 E2E 플로우 regression 없음
- [ ] Supabase `_now` 테이블들이 registry 선언 tier대로 업데이트
- [ ] **`_history` 테이블 backfill 완료** (backfill 기간 데이터 조회 가능)
- [ ] **모든 거래소 어댑터에서 심볼 정규화 검증**
- [ ] **Dated 심볼 메타데이터 저장 검증** — 사용자가 dated 심볼을 쿼리하면 정보 제공
- [ ] **5-axis 확장 사이클 검증** — 최소 1개의 새 데이터 타입이 5축 모두 갖춘 상태로 추가됨
- [ ] **M2 완료 = Launch ready** — L.1 pre-launch 체크리스트 진입 준비

### 개발 중 결정할 사항

- WS sub/unsub 프로토콜 메시지 포맷 + stream count 임계값 (결정 시점: 2.1)
- 2.3의 정확한 데이터 타입 리스트 (결정 시점: M1 로그 분석 후)
- 거래소별 API 특이사항 대응 세부 (결정 시점: 2.2)
- `_history` backfill 기간 구체값 (결정 시점: 2.3)
- 모든 `_now`/`_history` 테이블 컬럼 구성 (결정 시점: 구현 직전)
- 각 데이터 타입의 구체 폴링 주기값 (결정 시점: 2.3, tier 기반)
- 2.6의 추가 컴포넌트 세트 (결정 시점: M1 demo 피드백 후)
- 멀티 셀렉트 포함 여부 (결정 시점: 2.4)
- 뷰 썸네일 생성 여부 + 레이아웃 직렬화 포맷 (결정 시점: 2.5)

---

## 🚀 Launch — 배포 & 베타 오픈

**단계:** 배포 (M2와 M3 사이의 별도 단계)
**목표:** M1~M2에서 구축한 파운데이션을 기반으로 **실제 사용자를 맞이하고 피드백 루프를 가동**합니다.
**의존성:** M1, M2 전부 완료. 특히 M1.9 운영 인프라가 안정적이어야 함.
**철학:** Launch는 *끝*이 아니라 *시작*입니다. 이 단계에서 수집하는 실사용자 데이터가 M3~M5의 핵심 의사결정 근거가 됩니다.

### 세부 단계

#### L.1 사전 점검 체크리스트 (Pre-launch gate)

**보안 감사:**
- 환경 변수가 프론트엔드 빌드 결과에 노출되지 않음 (`secret-leak-check` CI pass)
- 모든 `user_*`, `log_*` 테이블 RLS 정책 적용 확인 (`rls-check` CI pass)
- 거래 실행 관련 코드 경로 0건 (`no-trade-execution-check` CI pass)
- Supabase service role key가 클라이언트에 노출되지 않음
- **AI가 외부 API를 직접 호출하지 않음** (코드 리뷰로 검증 — `dataService` abstraction layer 경유 확인)

**성능 기초 검증:**
- 10 concurrent users 시뮬레이션, 각 5개 카드 동시 구독, 메모리 누수 없음
- WS 연결 수가 거래소별 안전 마진 내
- Supabase DB 크기 초기값 기록 (이후 성장 추세 모니터링 baseline)

**장애 복구 검증:**
- Hetzner 워커 재시작 시 자동 복구
- Supabase 재연결 시 구독 자동 재개
- WS 릴레이 재시작 시 프론트엔드 reconnect

**법적/정책 검토:**
- 이용약관, 개인정보처리방침, 쿠키 정책 작성 및 퍼블리시
- 거래소 API 사용 정책 준수
- "거래 실행 없음" 명시 (compliance boundary)

_개발 중 결정:_ 동시 사용자 성능 목표치, 법무 검토 주체.

#### L.2 Soft launch — 제한된 베타 사용자 온보딩
- **비공개 베타 초대장 기반 온보딩** — 창업자 네트워크 10~30명으로 시작
- 초대 코드 기반 회원가입
- **첫 접속 시 간단한 튜토리얼**
- **베타 사용자 전용 피드백 채널**
- _개발 중 결정:_ 튜토리얼 형식, 피드백 채널.

#### L.3 실시간 모니터링 & 알림
M1.9에서 구축한 관찰 가능성 인프라를 실시간 운영 모드로 전환:

- Sentry 에러 대시보드 실시간 감시
- Hetzner 워커 health 체크 (자동 재시작 포함)
- Supabase 데이터 freshness 모니터링 (`_now` 테이블 정상 주기 업데이트 확인)
- Claude API 비용 대시보드
- **Supabase DB 크기 주간 추세 모니터링** — 스토리지 확장 전략 트리거 조건 (`docs/ARCHITECTURE.md §10` 참조)
- **알림 규칙**:
  - 에러율 > 5% (5분 이동 평균)
  - WS 릴레이 disconnected > 30초
  - Claude API 일일 예산 80% 도달
  - Supabase 연결 실패 / Hetzner 워커 crash
  - **Supabase DB 크기 조기 경고 임계점 도달** (스토리지 마이그레이션 평가 트리거)
- _개발 중 결정:_ 알림 수신 채널, 임계값 튜닝.

#### L.4 롤백 & 핫픽스 플랜
- Vercel: 이전 deployment으로 즉시 rollback
- Hetzner 워커: 버전 태그 기반 이전 바이너리 복귀 스크립트
- Supabase 마이그레이션: 파괴적 마이그레이션 금지 정책 + 롤백 가이드
- 핫픽스 브랜치 프로세스 (`main` 기반 `hotfix/*`)
- 사후 분석(post-mortem) 템플릿
- _개발 중 결정:_ 자동/수동 롤백 판정 기준.

#### L.5 초기 사용자 피드백 수집 & M3 입력 데이터 확보
Launch의 가장 중요한 산출물 — M3~M5의 의사결정 근거가 될 데이터를 축적합니다.

- **기초 분석 이벤트 수집 시작** (M3.7에서 본격 분석 툴 연동):
  - `signup`, `first_query`, `query_success`, `query_failure`, `card_spawn`, `card_delete`, `view_save`, `view_load`
- **베타 사용자 인터뷰** (주 1회)
- **사용 로그 분석**:
  - 가장 빈번한 쿼리 패턴 Top 20 → M3.1 Sonnet 라우팅 판정 기준 입력
  - Zod 검증 실패 패턴 Top 10 → Haiku 프롬프트 개선
  - 가장 많이 사용되는 컴포넌트 → M2.6에서 누락된 컴포넌트 식별
  - 자주 실패하는 카드 타입 → 버그 우선순위
- **주간 인사이트 요약**
- _개발 중 결정:_ 인터뷰 질문 템플릿, 인사이트 공유 형식, 초기 분석 이벤트 상세 스키마.

### 완료 기준

- [ ] L.1 사전 점검 체크리스트 **100% 통과**
- [ ] 최소 **10명 이상의 실제 베타 사용자** 온보딩 완료
- [ ] **72시간 연속 안정 운영** (Sentry 에러율 < 3%)
- [ ] 모든 알림 규칙이 테스트 알림으로 동작 검증됨
- [ ] 롤백 스크립트 dry-run 성공
- [ ] **최소 1주일간 사용 로그 축적** → M3.1 입력 데이터 확보
- [ ] **초기 베타 사용자 피드백 인터뷰 3건 이상** 수행
- [ ] **Supabase DB 성장 추세 baseline 기록** → 스토리지 확장 모니터링 활성화
- [ ] **Post-launch 의사결정 루프 가동 확인**

### 개발 중 결정할 사항

- 동시 사용자 성능 목표치 (결정 시점: L.1)
- 초기 베타 사용자 모집 채널, 튜토리얼 형식 (결정 시점: L.2)
- 알림 임계값 구체값 (결정 시점: L.3)
- 자동/수동 롤백 판정 기준 (결정 시점: L.4)
- 초기 분석 이벤트 상세 스키마 (결정 시점: L.5)

---

## M3 — Complex queries + Personalization

**단계:** Post-launch (실사용자 데이터 기반 첫 보강)
**목표:** Launch에서 축적된 실사용자 로그를 근거로 Sonnet 라우팅을 실구현하고, 개인 데이터 통합.
**의존성:** 🚀 Launch 완료.

**🔑 핵심 전환점:** 이 마일스톤부터는 "우리가 짐작으로 설계"하지 않습니다. Launch 실사용자 데이터가 모든 의사결정의 근거입니다.

### 세부 단계

#### 3.1 Sonnet 라우팅 실제 구현
- Haiku 1차 패스 복잡도 판정 — **Launch `complexity` 로그 + 실 쿼리 패턴 분석 기반**
- 복잡 쿼리 조건 예시 (Launch 데이터로 검증 후 확정):
  - 다중 소스 조합 (거래소 + CoinMarketCap + 온체인)
  - 크로스 거래소 비교
  - 모호한 의도
- Sonnet 호출 경로 (full registries + 추가 컨텍스트)
- Sonnet 출력도 동일한 Zod 검증 + 1회 재시도 + fallback
- **사용자별 Sonnet quota 별도 관리** (Haiku보다 엄격)
- _개발 중 결정:_ 복잡도 판정 기준 (Launch 로그 기반), Sonnet 프롬프트 튜닝, Sonnet quota 수치.

#### 3.2 사용자 거래소 API 키 통합
- `user_exchange_keys` Supabase 테이블 (암호화 컬럼 + RLS — **컬럼 구성은 개발 중 결정**)
- **복호화는 Supabase Edge Function 단일 지점에서만**
- **읽기 전용 권한 Edge Function 레벨에서 강제**
- 키 추가/수정/삭제 UI
- 키 유효성 검증 (저장 시 read-only endpoint 호출)
- **보안 감사 문서 `docs/SECURITY.md` 신규 작성**
- _개발 중 결정:_ 암호화 방식, 키 회전 전략, 테이블 컬럼 구성.

#### 3.3 개인 데이터 카드
- 포지션 / 잔고 / PnL / 주문 내역 카드
- 모든 쿼리는 Edge Function 경유
- datasource registry에 "개인 데이터" 카테고리 추가
- **개인 데이터도 `dataService` abstraction layer 경유** (Supabase 캐시 테이블 + TTL 기반 갱신)
- **거래 실행 코드 경로 0건** (`no-trade-execution-check` CI 강화 + 코드 리뷰 필수)
- _개발 중 결정:_ 캐싱 TTL, 테이블 컬럼 구성.

#### 3.4 사용자 설정
- `user_settings` 테이블 (RLS, **컬럼 구성은 개발 중 결정**)
- 설정 항목 후보: 테마, 기본 거래소, 기본 마켓, 알림 설정 등
- 설정 UI 페이지
- _개발 중 결정:_ 정확한 설정 항목 리스트.

#### 3.5 세션 & 채팅 기록 패널
- **우측 패널**: 현재 세션 채팅 기록 + AI 로그
- **좌측 패널**: 과거 세션 목록 (`log_chat` 기반)
- 과거 세션 클릭 → **캔버스 레이아웃 복원 + 라이브 데이터 재구독**
- 세션 검색
- _개발 중 결정:_ AI 로그 표시 범위.

#### 3.6 뉴스 & 외부 데이터
- 뉴스 피드 폴링 파이프라인 (소스 후보: CoinDesk, CryptoPanic 등)
- `_now` 테이블 + datasource registry 엔트리 (**컬럼 구성 개발 중 결정**)
- 뉴스 카드 컴포넌트
- **Tavily 웹 검색 폴백 본격 활성화** — M1.5에서 스캐폴딩한 인터페이스를 실제 Tavily API 호출로 연결
- 외부 임베드 컴포넌트 (TradingView 위젯 등 — 범위 TBD)
- _개발 중 결정:_ 뉴스 피드 소스, 외부 임베드 범위.

#### 3.7 사용자 분석 (Analytics) 본격 연동
- **분석 도구 후보**: Mixpanel, PostHog, Amplitude
- **주요 분석 대상**: Funnel, Retention, Feature adoption, Query failure 분포, Contention points
- **주간 자동 리포트**
- **어드민 대시보드(M5.2)와 통합 고려**
- _개발 중 결정:_ 분석 도구 선택, 이벤트 분류 스키마.

### 완료 기준

- [ ] Sonnet 라우팅이 실 복잡 쿼리에서 트리거 (로그 검증)
- [ ] 크로스 거래소 쿼리가 올바른 다중 소스 카드 조합 생성
- [ ] 사용자가 API 키 추가 후 포지션/잔고/PnL 정상 표시
- [ ] **거래 실행 API 호출 코드 경로 0건** (강화 CI pass)
- [ ] 과거 세션 복원 동작
- [ ] 뉴스 카드 렌더 및 업데이트 (Supabase Realtime 경유)
- [ ] Tavily 폴백이 레지스트리 miss 시 트리거
- [ ] 사용자 설정이 세션 간 영속
- [ ] **분석 도구 연동 완료**
- [ ] **`docs/SECURITY.md` 초안 작성**
- [ ] **Performance checkpoint 수행** — 누적 기술 부채 사전 점검 (M5.5 전)

### 개발 중 결정할 사항

- 복잡도 판정 기준 (결정 시점: 3.1)
- Sonnet 사용자별 quota 수치 (결정 시점: 3.1)
- API 키 암호화 방식 + 테이블 컬럼 구성 (결정 시점: 3.2)
- 개인 데이터 캐싱 TTL + 테이블 컬럼 구성 (결정 시점: 3.3)
- `user_settings` 컬럼 구성 (결정 시점: 3.4)
- 뉴스 피드 소스 + 뉴스 테이블 컬럼 구성 (결정 시점: 3.6)
- 외부 임베드 범위 + AI 로그 패널 표시 범위 (결정 시점: 3.5/3.6)
- 분석 도구 선택 + 이벤트 분류 스키마 (결정 시점: 3.7)

---

## M4 — Sharing + On-chain + Data expansion

**단계:** Post-launch (실사용 패턴 기반 확장)
**목표:** 외부 공유(Live Signal Links)와 온체인 데이터 통합.
**의존성:** M3 완료 + Launch 이후 수개월간 실 사용 데이터 축적.

### 세부 단계

#### 4.1 Live Signal Links
- 공유 가능한 URL 생성 (뷰 ID 기반 + 서명 토큰)
- **비인증 공개 뷰 렌더링**
- **공유 뷰에서도 실시간 데이터 계속 스트리밍** (Path A/B 모두)
- 권한 모델: read-only 기본, 옵션 비밀번호/만료
- Rate limiting (abuse 방지)
- 공유 링크 관리 UI
- _개발 중 결정:_ **PRD가 M4 진입 시 전체 UX 확정**. M1~M3 + Launch 사용자 행동 로그 기반으로 별도 디자인 스프린트 수행 후 확정.

#### 4.2 온체인 데이터
- 온체인 데이터 소스 선택 (유력 후보: Ethereum 메인넷 + L2 하나 + Bitcoin)
- 데이터 타입 후보: whale alerts, DEX 거래량, 스테이블코인, 거래소 입출금, 온체인 펀딩 레이트
- 폴링 파이프라인 → Supabase `_now` → Realtime
- datasource registry 엔트리 (**테이블 컬럼 구성 개발 중 결정**)
- 온체인 시각화 컴포넌트
- _개발 중 결정:_ 온체인 데이터 소스, 체인 목록, 테이블 컬럼 구성.

#### 4.3 데이터 소스 확장
- Launch ~ M3 사용 패턴 분석 기반 우선순위
- 후보: CoinGlass, Glassnode, Fear & Greed Index, 거래소 공지 피드
- 모두 datasource registry를 통해 추가
- **오케스트레이터 코드 변경 0건**
- _개발 중 결정:_ 추가 데이터 소스 우선순위.

### 완료 기준

- [ ] 시그널 링크 URL이 비인증 브라우저에서 라이브 데이터 표시
- [ ] 원본 사용자 로그아웃 후에도 공유 뷰 동작
- [ ] 공유 링크 권한 옵션 (비밀번호/만료) 동작
- [ ] 최소 1개 온체인 데이터 소스 통합
- [ ] 신규 데이터 소스 추가 시 오케스트레이터 코드 변경 0건
- [ ] Rate limiting이 abuse 시도 차단

### 개발 중 결정할 사항

- Live Signal Links 전체 UX (결정 시점: M4 디자인 스프린트)
- 온체인 데이터 소스 + 테이블 컬럼 구성 (결정 시점: 4.2)
- Rate limiting 알고리즘 (결정 시점: 4.1)
- 4.3의 추가 데이터 소스 우선순위 (결정 시점: 4.3)

---

## M5 — Auth hardening + Admin + Mobile + DR + Storage scale-out

**단계:** Post-launch (프로덕션 완성도)
**목표:** 프로덕션 준비 완료. 보안 강화, 운영 도구, 모바일 지원, 재해 복구, **스토리지 확장 평가 및 마이그레이션**.
**의존성:** M4 완료, 실 사용자 기반 충분 확장.

### 세부 단계

#### 5.1 인증 강화
- 소셜 로그인: Google (필수), GitHub, 가능하면 Apple
- 옵션 2FA (TOTP)
- 세션 만료 및 자동 갱신
- 계정 복구 플로우
- _개발 중 결정:_ 2FA 강제 여부, 소셜 프로바이더 우선순위.

#### 5.2 어드민 페이지
- Supabase 어드민 role + role-based RLS
- 사용자 관리, 데이터 파이프라인 모니터링, 시스템 상태, 로그 분석 대시보드 (M3.7 분석 도구와 통합)
- _개발 중 결정:_ 어드민 메트릭 구체 선택.

#### 5.3 모바일 반응형
- Tailwind 반응형 breakpoint
- 카드 터치 드래그 + 캔버스 핀치 줌
- 모바일 채팅 입력 최적화
- 좌/우 패널을 모바일에서 bottom sheet로 전환
- _개발 중 결정:_ 모바일 UX 단순화 범위.

#### 5.4 맥락 인식
- "이거" → 포커스된 카드 resolve
- "아까 그거" → 세션 기록 기반 resolve
- 세션 컨텍스트를 AI 프롬프트에 추가 주입
- _개발 중 결정:_ 맥락 참조 문구 확장.

#### 5.5 성능 최적화
> **권장:** M3 완료 시점에 mini-performance-review 수행.

- 카드 virtualization
- WS 커넥션 풀링 / 지연 구독
- `dataService` 레벨 쿼리 결과 캐싱 (stale-while-revalidate)
- Bundle 분석 + 코드 스플리팅
- Lighthouse 감사 → 데스크탑 성능 score ≥ 90
- _개발 중 결정:_ 캐싱 TTL, 가상화 threshold.

#### 5.6 UI 폴리시
- 애니메이션/트랜지션
- Empty / Loading / Error 상태
- 접근성 pass (WCAG AA)
- _개발 중 결정:_ 애니메이션 라이브러리.

#### 5.7 백업 & 재해 복구 (Backup & DR)
- **Supabase 자동 백업** 활성화
- **외부 저장소 복제**: Supabase 백업을 AWS S3 또는 Cloudflare R2에 주기적 복제
- **Hetzner 워커 failover 전략**: Cold standby (초기) → Active-active (사용자 증가 시)
- **RTO / RPO 목표 설정**
- **분기별 DR drill**
- _개발 중 결정:_ Standby 전략, RTO/RPO 수치, 백업 보존 기간.

#### 5.8 스토리지 확장 평가 & 하이브리드 마이그레이션

Launch 이후 누적된 데이터 성장 추세를 기반으로 스토리지 확장 여부를 평가하고, 필요 시 하이브리드 스토리지로 마이그레이션합니다. 자세한 전략은 `docs/ARCHITECTURE.md §10` 참조.

**임계점 모니터링 및 트리거**:
- Supabase DB 크기 지속 모니터링 (Launch 이후 L.3 모니터링 인프라 경유)
- 임계점 도달 시 하이브리드 스토리지 도입 트리거 (수치는 개발 중 결정)

**Phase 2: 하이브리드 스토리지 도입 (임계점 도달 시)**:
- TimescaleDB (Hetzner 자체 호스팅) 또는 ClickHouse 중 선택
- 선택 기준: 실데이터 쿼리 패턴 (aggregation-heavy이면 ClickHouse, SQL 호환성 우선이면 TimescaleDB)
- **`_history` 테이블부터 점진 이전** — 대량 시계열이 하이브리드 DB로
- `user_*`, `log_*`, `exchange_*`, 최신 `_now`는 Supabase 유지
- **AI orchestrator는 `dataService` abstraction layer만 사용하므로 쿼리 코드 변경 없음** — M1부터 준비된 safety net의 실제 활용
- 마이그레이션 중 zero-downtime 보장 (dual-write 일정 기간)

**Phase 3: 장기 archive (운영 안정화 후)**:
- 오래된 `_history` 데이터를 S3 또는 Cloudflare R2 Parquet 파일로 archive
- DuckDB 또는 ClickHouse S3 engine으로 cold query
- Hot storage 축소 → 비용 효율 최적화

_개발 중 결정:_ 임계점 수치, TimescaleDB vs ClickHouse 선택 기준, archive 보존 기간 정책, 하이브리드 시점의 `_now` split 여부.

### 완료 기준

- [ ] 모든 소셜 프로바이더 로그인 동작
- [ ] 어드민 페이지 접근 어드민 role로 제한
- [ ] 모바일 iOS Safari + Android Chrome 수동 테스트 pass
- [ ] "이거", "아까 그거" 맥락 참조 동작
- [ ] Lighthouse 데스크탑 성능 score ≥ 90
- [ ] 접근성 검사 pass (WCAG AA)
- [ ] 100개 카드 캔버스에서도 부드러운 인터랙션
- [ ] **Supabase 자동 백업 + 외부 복제 동작 검증**
- [ ] **DR drill 1회 이상 성공**
- [ ] **스토리지 확장 평가 수행** — 임계점 도달 여부 결정
- [ ] **하이브리드 마이그레이션 완료** (임계점 도달 시) — `dataService` layer만 수정, AI 쿼리 코드 변경 0건 검증

### 개발 중 결정할 사항

- 2FA 강제 정책 (결정 시점: 5.1)
- 어드민 대시보드 메트릭 선택 (결정 시점: 5.2)
- 모바일 인터랙션 단순화 범위 (결정 시점: 5.3)
- 캐싱 TTL + 가상화 threshold (결정 시점: 5.5)
- 애니메이션 라이브러리 (결정 시점: 5.6)
- Standby 전략 + RTO/RPO 수치 (결정 시점: 5.7)
- 하이브리드 스토리지 임계점 + DB 선택 (결정 시점: 5.8)

---

## 마일스톤 간 non-negotiable 규칙

모든 마일스톤 및 Launch 단계에서 다음 규칙은 절대 위반하지 않습니다 (`.claude/CLAUDE.md` 참조):

- **Path A WebSocket 스트리밍 데이터는 Supabase를 절대 거치지 않습니다** — Hetzner WS 릴레이 → 프론트엔드 직접.
- **모든 폴링 기반 데이터는 Supabase를 단일 진실 공급원으로 사용합니다** — Path B.
- **AI 오케스트레이터는 Supabase DB (+ Tavily fallback)만 조회합니다** — 거래소 REST API, CoinMarketCap, 뉴스 API 등을 직접 호출하지 않습니다.
- **WebSocket은 프론트엔드 실시간 갱신 전용** — AI 의사결정 데이터 소스가 아닙니다. Path A (거래소 WS) 또는 Path B (Supabase Realtime 경유) 모두 해당.
- **AI는 `dataService` abstraction layer를 경유합니다** — `supabase.from()` 직접 호출 대신 `dataService` 인터페이스 경유. 미래 스토리지 마이그레이션 safety net.
- **모든 폴링은 배치 API를 우선 활용합니다** — per-symbol polling은 rate limit 포화의 주요 원인이므로 금지 (배치 미지원 데이터에 한해 예외).
- **datasource / component / interaction 매핑을 오케스트레이터에 하드코딩하지 않습니다** — 반드시 registry를 통해 추가.
- **`user_*`, `log_*` 테이블은 반드시 RLS 정책을 가집니다** — `rls-check` CI 스크립트가 검증.
- **Zustand hook은 Server Components에서 사용하지 않습니다** (클라이언트 전용).
- **TRAVIS는 거래를 실행하지 않습니다** — 읽기 전용만 허용. `no-trade-execution-check` CI 스크립트가 지속 검증.
- **AI 출력은 Zod 검증 + 1회 재시도 + graceful fallback** — 크래시 금지, 모든 실패 로깅.
- **Supabase 테이블 스키마는 개발 중 하나씩 결정합니다** — 테이블명/카테고리/RLS/관계는 계획 가능, **컬럼/타입/인덱스는 구현 시점 결정**.
- **데이터의 구체 필드/조건/폴링 주기도 개발 중 결정합니다** — 각 API와 WebSocket에서 가져올 구체 필드, 폴링 주기의 수치 (고/중/저 변동성 tier 원칙만 사전 고정)은 모두 deferred.
- **시크릿은 소스 코드/로그에 절대 노출되지 않습니다** — `secret-leak-check` CI 스크립트가 검증.

이 규칙 중 어느 것이라도 위반되면 해당 마일스톤은 완료로 간주하지 않습니다.
