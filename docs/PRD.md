# TRAVIS — 제품 요구사항 문서

> **"Shape your market."**
TRAVIS는 자연어 입력을 통해 인터페이스 자체가 개인화된 실시간 마켓 뷰를 조립하는 다이나믹 UI 플랫폼입니다.
> 

---

## 1. 제품 정의

### TRAVIS란 무엇인가

TRAVIS는 암호화폐 트레이더를 위한 **다이나믹 UI 플랫폼**입니다. 사용자가 자연어 쿼리를 입력하면, AI가 무한 2D 캔버스 위에 실시간 인터랙티브 마켓 뷰를 구성합니다. AI는 사용자의 의도를 파악하여 어떤 데이터를 어떤 형식, 어떤 인터랙션, 어떤 갱신 모드로 보여줄 지를 결정합니다.

TRAVIS는 스크리너가 아니고, 챗봇이 아니며, 리서치 도구도 아닙니다. **트레이딩 워크플로우 도구**입니다 — "내 조건에 맞는 코인을 지금 당장 보여줘", "dashusdt를 바이낸스 기준으로 분석해줘" — 정적 텍스트가 아닌 라이브로 움직이는 화면으로 응답합니다.

### TRAVIS가 해결하는 문제

1. **수동 설정 피로** — 기존 대시보드는 정적입니다. 사용자가 매번 모든 패널을 수동으로 설정해야 합니다. TRAVIS는 한 문장으로 뷰를 생성합니다.
2. **획일적인 인터페이스** — 모든 트레이더는 다른 의도와 맥락을 가지지만, 모두 같은 대시보드를 봅니다. TRAVIS는 쿼리마다 개인화된 뷰를 조립합니다.
3. **텍스트 기반 AI로는 부족하다** — 트레이더는 신뢰할 수 있는 라이브 데이터가 필요하지, 분석 문단이 필요한 게 아닙니다. TRAVIS는 실시간 인터랙티브 패널로 응답합니다.

### 타겟 사용자

바이낸스, OKX, Bybit, Bitget 등 다양한 거래소에서 알트코인 및 비트코인 선물/현물 거래를 하는 글로벌 액티브 암호화폐 트레이더. 매일 다수의 페어를 스캔하는 데이트레이더가 핵심 타겟이며, 이 풀 안에는 시그널 그룹 운영자나 암호화폐 라이브 스트리머처럼 본인 또한 적극적인 트레이더이면서 영향력을 가진 사용자가 일부 포함됩니다. 창업자가 타겟 사용자 — 강한 창업자-시장 적합성.

### 비치헤드 마켓

바이낸스/OKX/Bybit/Bitget 등 다양한 거래소의 현/선물 활성 데이트레이더. 창업자가 직접 X (Twitter) 에서 크립토 인플루언서로 활동하며 TRAVIS 를 홍보하는 것이 1차 획득 채널.

### 경쟁 포지셔닝

- **vs Surf AI** (시리즈A $15M): Surf는 리서치 도구. TRAVIS는 워크플로우 도구. 완전히 다른 유즈케이스.
- **vs altFINS / CoinGlass / TradingView**: 정적 대시보드. TRAVIS는 다이나믹 — 쿼리마다 UI가 재구성됨.
- **0-to-1 차별화 요소**: 본인만의 대시보드 구성 및 공유 / LiveView Links — 본인만의 라이브 실시간 뷰를 여는 공유 가능한 URL.

---

## 2. 핵심 아키텍처

### 기술 스택

| 레이어 | 기술 | 역할 |
| --- | --- | --- |
| 프론트엔드 | Next.js 16, TypeScript, React Flow (@xyflow/react 12), shadcn/UI, Zustand | 2D 캔버스, UI 컴포넌트, 상태 관리 |
| AI | Claude API (Haiku 4.5 + Sonnet 4.6), Zod | 의도 파싱, 뷰 구성, 출력 검증 |
| 데이터베이스 | Supabase (DB + Auth + Realtime) | 데이터 저장, 사용자 인증, 실시간 푸시 |
| 검색 | Tavily | 온디맨드 웹 검색 폴백 (쿼리의 ~5%) |
| 데이터 워커 | Hetzner VPS (Node.js/TypeScript, CPX22/Nuremberg, M1.7 Step 0 완료로 24/7 가동 중) | 거래소 연결, 폴링, WS 릴레이 |
| 호스팅 | Vercel | 프론트엔드 배포 |
| 언어 | 영어 전용 (글로벌 타겟) |  |

### 데이터 플로우 — 하이브리드 실시간 아키텍처

세 가지 데이터 경로가 동시에 동작합니다 (경로 A·B 는 프론트엔드 실시간 갱신용, 경로 C 는 AI 가 카드 구성을 지시):

**경로 A — WS 스트리밍 (진정한 실시간)**
거래소 WebSocket → Hetzner 워커 → WebSocket 릴레이 → 프론트엔드 직접 연결.
거래소별 WebSocket API에서 지원하는 모든 데이터를 지원합니다. 이것들은 절대 Supabase를 거치지 않습니다 — 실시간 스트리밍 데이터에 대해 DB 쓰기 + Realtime 브로드캐스트의 지연 비용은 용납할 수 없습니다.

**경로 B — 나머지 전부 (준실시간)**
데이터 소스(거래소 REST API(가격,거래량 등 모두), CoinGecko, CoinMarketCap, CoinGlass, 뉴스 피드, 온체인 등) → Hetzner 워커(데이터 특성별 차별화 주기로 폴링, 구체 수치는 개발 중 결정, **배치 API 의무 사용**) → Supabase DB(upsert) → Supabase Realtime → 프론트엔드.
모든 폴링 기반 데이터는 Supabase에 저장됩니다. 이를 통해 Supabase가 단일 진실 공급원이 됩니다 — **AI 오케스트레이터는 Supabase DB (+ Tavily 폴백)만 조회하며, 거래소 REST API, CoinMarketCap, 뉴스 API 등 외부 API를 직접 호출하지 않습니다**. WebSocket으로 직접 지원되지 않는 데이터는 프론트엔드가 Supabase Realtime을 구독하여 Hetzner 폴링이 upsert하는 변경을 자동으로 수신합니다.

**경로 C — AI 명령**
사용자 쿼리 → Vercel API 라우트 → AI 오케스트레이터(Haiku/Sonnet) → Supabase DB에서 데이터 검증 쿼리 → JSON 뷰 설정 반환 → 프론트엔드가 라이브 데이터 구독과 함께 카드 렌더링.

### AI 오케스트레이터

오케스트레이터는 TRAVIS의 두뇌입니다. 자연어 입력을 받아 무엇을 보여줄지 결정합니다.

**라우팅:**

- 사용자 입력 → Haiku (빠르고 저렴): 의도 분류, 데이터 소스 선택, 컴포넌트 선택, 인터랙션 정의 → 단순 쿼리의 경우 여기서 완료
- 복잡한 쿼리만 → Sonnet (정확하고 비쌈): 다중 소스 조합, 크로스 거래소 비교, 모호한 의도 해석

**핵심 설계 원칙:**

- **하드코딩 금지.** AI에게 레지스트리(컴포넌트, 데이터 소스, 인터랙션)가 주어지고, 런타임에 사용자 의도에 가장 적합한 조합을 결정합니다. 다른 맥락의 다른 사용자가 같은 쿼리를 해도 다른 뷰가 생성될 수 있습니다.
- **AI가 카드별로 모든 것을 정의합니다:** 어떤 컴포넌트를 렌더링할지, 어떤 데이터를 바인딩할지, 어떤 조건으로 필터링할지, 카드가 어떻게 실시간 갱신될지(갱신 모드), 그리고 각 요소가 어떤 인터랙션을 지원할지(예: 코인 목록의 행을 클릭하면 상세 차트가 생성). 아래 갱신 모드 시스템 및 컴포넌트 액션 시스템 참조.
- **AI가 복합 조건 필터를 구성합니다:** 사용자가 "거래량 증가하고 OI 급증하는 코인"처럼 여러 조건을 조합한 쿼리를 하면, AI가 데이터 소스 레지스트리의 필터 가능 필드(queryable fields)를 참조하여 구조화된 필터 조건 JSON을 생성합니다. 이는 Haiku/Sonnet의 자연어→구조화 JSON 변환 능력으로 처리되며, 별도 스크리너 엔진이 불필요합니다.
- **출력은 JSON**이며, 런타임에 Zod로 검증됩니다. 검증 실패 시 시스템이 재시도하거나 우아한 에러를 표시합니다 — 절대 크래시하지 않습니다.

### 확장성 — 4개의 레지스트리

TRAVIS는 4개의 레지스트리를 중심으로 설계되며, 모두 같은 패턴을 따릅니다: 새 항목을 등록 → AI가 즉시 사용 가능. 오케스트레이터에 코드 변경 불필요.

1. **거래소 어댑터 레지스트리** — 거래소 연결을 위한 공통 인터페이스. 어댑터 인터페이스를 구현하여 새 거래소를 추가. REST + WebSocket 지원. 마켓 타입(spot, futures, options, alpha 등)은 어댑터별로 배열로 선언 — 새 자산군은 마켓 타입 추가로 확장.
2. **데이터 소스 레지스트리** — 사용 가능한 데이터 소스, 스키마, 갱신 주기, 쿼리 기능, **필터 가능 필드(queryable fields)**를 기술. AI가 이를 읽고 어떤 데이터에 접근 가능한지, 어떤 필드를 기준으로 필터링할 수 있는지 파악. 필터 가능 필드에는 필드명, 데이터 타입, 지원 연산자(>, <, =, above/below 등)가 포함됨.
3. **컴포넌트 레지스트리** — 사용 가능한 UI 컴포넌트, 필요한 데이터 형태, 지원 크기, 지원 인터랙션을 기술. AI가 이를 읽고 무엇을 렌더링 가능한지 파악.
4. **인터랙션 레지스트리** — 사용 가능한 인터랙션 유형을 기술. 컴포넌트가 어떤 인터랙션을 지원하는지 선언하고, AI가 맥락에 따라 적절한 인터랙션을 선택.

### 🎯 모든 데이터 × 모든 형태 (Form↔Data 직교) — 최상위 제품 축

> **2026-06-28 사용자/CTO 확정 (중심축).** §1~§4 가 이미 기술한 "AI 가 카드별로 모든 것을 정의" 의 **본질을 명시**하고, M2+ 개발의 북극성으로 못박는다. 기술 구현은 `docs/Architecture.md §8 Form↔Data 직교`, 개발 규율은 `CLAUDE.md §최상위 개발 축`. 이 축은 `future.md §2 (Composable 컴포넌트 / GenericChart)` 의 정식 활성화이며, 동시에 §3 갱신 모드·§4 인터랙션 시스템을 하나로 묶는 상위 프레임이다.

TRAVIS 의 정체성은 **유저가 TRAVIS 가 불러오고 저장하는 어떤 데이터든, 원하는 어떤 형태·형식·인터랙션으로든 보여줄 수 있다**는 것이다. 이를 위해 **형태(form)와 데이터(data)는 직교(독립) 축**으로 설계한다.

- **컴포넌트는 데이터 종류가 아니라 "형태"로 정의한다.** "청산 카드"·"코인 리스트 카드" 처럼 데이터에 잠긴 컴포넌트는 안티패턴이다. "표(Table)"·"차트(Chart)"·"피드(Feed)"·"단일값(BigValue)"·"히트맵(Heatmap)" 같은 form 컴포넌트가 **어떤 데이터든** 받아 렌더한다. 데이터별 표시 의미(단위·방향 색·정밀도·라벨·고지)는 코드에 박힌 **시맨틱 레이어**(데이터 소스 레지스트리 + `canonical-metrics.md` + 표시 헬퍼)에서 파생한다.
- **제약은 데이터 정체성이 아니라 "모양(shape) 호환성"이다.** 데이터를 종류가 아닌 모양으로 보면 5가지다: `scalar`(값 하나) / `record`(한 대상의 여러 값) / `set`(여러 대상 행 모음) / `series`(시간축 위의 값) / `events`(시간순 도착 사건). form 은 자기가 소비하는 shape 를 선언하고, 데이터 레이어는 어떤 datasource 든 호환 shape 로 서빙한다. 같은 데이터를 snapshot/history/집계로 reshape 하면 거의 모든 데이터가 거의 모든 형태를 먹일 수 있다 (예: "OI 를 차트로" = OI 의 `series`(history) 를 꺼내면 가능).
- **새 form 1개 = 모든 지표 자동 유입.** form N개 × 데이터 M개의 표현을 N+M 작업으로 연다(미리 N×M 컴포넌트를 만드는 combinatorial explosion 회피).
- **AI 가 카드별로 {form · data · shape · filters · updateMode · interaction} 전부 자율 결정** (§2 핵심 원칙의 자연 확장). 인터랙션(요소 터치→상세 정보, spawn, drill-down)도 AI 가 데이터·의도에 맞게 판단해 넣는다.
- **향후 확장도 이 축 위**: 형태 사후 변경("이걸 차트로 바꿔줘") · 카드끼리 연동(클릭→연관 카드) · `reactive` 갱신 모드(§3).
- **쿼리 자유도 (2026-07-12 사용자 재확정)**: 이 축은 선물 지표 등 특정 데이터군에 국한되지 않는다 — **모든 데이터 × 모든 form × 표현 스타일**("펀딩비를 선차트로")까지 유저가 자유롭게 요구할 수 있어야 하며, 복합·크로스 쿼리("Low LSR and top gainers")를 포함해 **유저의 어떤 요청이든** 원하는 데이터·형태로 화면을 구성하는 것이 목표다. (부채 추적: `deferred-task.md [10-101]`/`[10-102]`.)
- **경계**: 모양 비호환 조합(예: 단일 현재값을 캔들차트로)은 무의미 — TRAVIS 결함이 아니라 논리 한계. 새 form 은 처음 한 번 제작이 필요. **도메인 위생(§7 사이트=DB · sampled 고지 · 상장폐지 allowlist · 단위 정확성)은 어떤 형태로 보여주든 불변.**

---

## 3. 갱신 모드 시스템 (Update Mode)

AI가 카드를 생성할 때, 해당 카드가 **어떤 수준으로 실시간 갱신될지**를 함께 결정합니다. 유저가 "BTC 가격 보여줘"라고 하는 것과 "OI 급증 코인들 보여줘"라고 하는 것은 갱신 방식이 근본적으로 다릅니다.

### 3가지 갱신 모드

**`value`** — 카드 구조는 고정, 안의 숫자만 실시간 갱신.
예시: `TickerCard` — BTC 가격이 68,000 → 68,100으로 바뀜. 카드 자체는 그대로.

**`content`** — 카드 안의 **항목이 동적으로 추가·제거**됨. AI가 정의한 필터 조건을 데이터 갱신 시마다 재평가.
예시: "OI 급증 코인 보여줘" → `CoinListCard`가 생성되고, 조건을 충족하는 코인이 실시간으로 목록에 들어오거나 빠짐. DOGE가 OI 조건을 벗어나면 목록에서 사라지고, XRP가 새로 충족하면 추가됨.

**`reactive`** — 상황 변화에 따라 **카드 구성 자체가 변경**될 수 있음. (향후 확장 — MVP 이후)
예시: "BTC 큰 이벤트 있어?" → 평상시엔 요약 카드, 대규모 청산 발생 시 청산 피드 카드가 자동 추가.

### 작동 방식

AI 출력 JSON에 `updateMode`와 필요 시 `filters`, `refreshInterval` 필드가 포함됩니다. 프론트엔드는 이를 읽고 갱신 전략을 분기합니다:
- `value` 모드: 데이터 구독만 바인딩 (기존 경로 A/B와 동일)
- `content` 모드: 데이터 구독 + **필터 재평가 로직** 실행. Supabase Realtime으로 `_now_*` 테이블 변경을 수신할 때마다, AI가 정의한 필터 조건에 따라 목록을 재구성.
- `reactive` 모드: MVP 이후 정의 — 작동 방식 분기는 reactive 도입 시점에 명세 (현재는 Zod enum 만 예약).

> 프론트엔드 처리 분기의 구체적 기술 구현 (Supabase Realtime 구독 패턴, 필터 재평가 로직 디테일 등) 은 `docs/Architecture.md §5 갱신 모드 처리` 참조.

**`_history` 기반 카드의 주기적 갱신**: `_history` 데이터를 조회하는 카드(시계열 추이 차트 등)는 Supabase Realtime push가 아닌 **주기적 pull 방식**으로 갱신됩니다. AI가 카드 생성 시 쿼리 특성에 맞는 기본 갱신 주기를 설정하고, 사용자가 카드 설정에서 이를 조절할 수 있습니다. 구체적인 기본 주기와 조절 범위는 개발 중 결정.

AI가 사용자 의도를 파악하여 적절한 갱신 모드를 선택합니다 — 이는 "AI가 카드별로 모든 것을 정의한다"는 핵심 원칙의 자연스러운 확장입니다.

> AI 출력 JSON 전체 필드 명세 (`updateMode` / `filters` / `refreshInterval` / `actions` / `kicker` / `title` / `subtitle` 등) 는 `packages/shared/src/zodSchemas.ts` 또는 `docs/Architecture.md §3` 참조.

---

## 4. 컴포넌트 액션 시스템

AI가 뷰를 구성할 때, 무엇을 보여줄지와 어떻게 갱신할지(§3)뿐만 아니라, 사용자가 인터랙션할 때 각 요소가 어떻게 동작하는지도 정의합니다. 이는 맥락에 따라 달라집니다 — 다른 데이터를 가진 같은 컴포넌트는 다른 인터랙션을 갖습니다.

### 인터랙션 유형 (확장 가능)

**Spawn** — 요소를 클릭 → 캔버스에 새 카드가 나타남.
예시: 코인 목록 → 코인 클릭 → CoinDetail 차트 카드가 생성. 뉴스 목록 → 뉴스 항목 클릭 → 관련 코인 가격 변동 카드가 생성 또는 자세한 뉴스 내용이 생성.

**Drill-down** — 요소를 클릭 → 같은 카드가 더 깊은 뷰로 전환(뒤로 가기 내비게이션 포함).
예시: 전체 코인을 보여주는 히트맵 → 코인 하나 클릭 → 같은 카드가 해당 코인의 상세 분석을 표시.

새 인터랙션 유형은 인터랙션 레지스트리에 추가할 수 있습니다. AI가 적절할 때 자동으로 사용합니다.

> **✅ Spawn 실동작 (M3-step1, 2026-07-16)**: 카드 요소 클릭 → **Spawn** 이 라이브로 작동합니다 — AI 가 카드 생성 시 "클릭하면 어떤 카드(form×data)를 띄울지"를 `actions` 에 **사전 선언**하고, 클릭 시 프론트가 AI 재호출 없이 조립(반응 0초). 무엇을 띄울지는 전적으로 AI 자율 결정(매핑 규칙 하드코딩 0). 표/피드 행 = row-click, 단일 record 카드 헤더 = header-click. Drill-down/hover-preview/linked-selection 은 후속 (`deferred-task.md [4-13]`). 상세 = `docs/Architecture.md §5 액션 디스패처` + `task-record/M3-step1-interaction-wire.md`.
>
> **✅ 인터랙션 완성 2탄 (M3-step2, 2026-07-17)**: ① 새 카드는 **항상 현재 뷰포트 안 빈자리**에 배치(만차 시에만 화면 밖 + 토스트 "Show/Undo" — 자동 팬 없음) ② **재클릭 체인 깊이 1**: AI 가 "표 행→상세, 상세 헤더→차트"처럼 스폰 카드의 다음 클릭까지 사전 선언 가능(소스→mid→leaf 2 hop, 재귀 아닌 명시 중첩) ③ 클릭 표면 hover 시 **"View detail ↗" 힌트 배지**(AI 선언 파생) ④ 엔진이 AI 선언에 빠진 스코프(symbol/marketType)를 클릭 행에서 보충 — "행 = 더 구체적 진실" 원칙. 상세 = `task-record/M3-step2-interaction-2.md`.

### 작동 방식

AI 출력 JSON에는 컴포넌트별 `actions` 필드가 포함됩니다. 프론트엔드의 액션 디스패처가 액션 유형을 읽고 실행합니다. AI가 데이터 유형과 사용자 의도에 따라 어떤 인터랙션이 적절한지 결정합니다.

> AI 출력 JSON 의 `actions` 필드 전체 명세는 `packages/shared/src/schemas/aiCardConfig.ts` (`CardActionSchema`/`SpawnTargetSchema`) 참조. **✅ M3-step1 (2026-07-16) 부터 위 "작동 방식"이 실동작** — 클릭 spawn 실행 구조는 Architecture §5 액션 디스패처 참조.

---

## 5. UI 구조

제공된 UI 목업 기반:

1. **좌측 패널** (토글 가능) — "My views": 저장된 뷰 목록. 과거 뷰를 클릭하면 라이브 데이터가 재연결된 상태로 해당 레이아웃을 복원. Claude/ChatGPT 좌측 사이드바와 동일한 방식.
2. **메인 영역** — 무한 2D 캔버스 (React Flow). 확대/축소, 드래그하여 팬. AI 또는 사용자 인터랙션에 의해 카드가 배치됨.
3. **하단** — 채팅 입력 바. 자연어 입력. 플레이스홀더 예시: "ETH 청산 카드 추가해줘."
4. ~~**우측 패널** (토글 가능) — 현재 세션 채팅 기록 / AI 로그.~~ **(M2 테마 C 에서 폐기, 2026-06-15 — 사용자 판단: 채팅 복기는 워크플로 비핵심. 셸은 좌측 전용.)**
5. **좌측 패널 하단 — Custom Instructions** (M2 테마 C Step 4, 2026-06-18) — ChatGPT 식 자유텍스트 트레이딩 선호도 1칸. 저장하면 AI 시스템 프롬프트에 soft default 로 주입(현재 쿼리 미명시 시에만 적용, guardrails 못 덮음). enum 이 아닌 자유텍스트 = 새 컴포넌트 추가 시 AI 자동 반영. 프롬프트 인젝션 5겹 방어.

### 캔버스 인터랙션

- 카드: 드래그하여 위치 변경, 리사이즈 핸들, 삭제(즉시 + 5초 Undo 토스트)
- 캔버스: 줌(스크롤), 팬(빈 공간 드래그)
- 카드 콘텐츠: AI가 정의한 컴포넌트별 인터랙션(spawn, drill-down)
- 뷰: 현재 레이아웃 저장, 저장된 레이아웃 불러오기, 새 뷰 생성

### 디자인 시스템 및 테마

TRAVIS는 **UI-3 Monochrome Architectural 하이브리드**를 채택합니다 — 흑백 건축도면 미학을 기반으로 up/down·long/short 방향성에만 teal + vermilion 2색 예외를 허용해 트레이더 가독성을 확보합니다.

**듀얼 테마 (사용자 토글, 좌측 상단)**:
- **라이트 (Monochrome Light)**: paper `#fafaf9` + ink `#0a0a0a` + halftone 흑 도트. 오피스 조명 아래 숫자 스캔 최적화.
- **다크 (Carbon Architectural)**: paper `#1a1a1a` + 웜 크림 `#e8d9b8` + halftone 크림 도트. 새벽 장시간 세션 눈 피로 완화.

라이트/다크 간 up/down 악센트 oklch 값은 각 테마 체감 대비에 맞춰 개별 튜닝합니다 (라이트 대비 다크는 L +0.07, C -0.02). 테마 토글은 사용자 명시 선택 우선 — OS 다크모드 자동 추적은 비활성(새벽 세션 중 급전환 방지).

**폰트**: DM Serif Display (카드 타이틀·가격 huge display) / JetBrains Mono (mono metric · tabular-nums 수치) / Archivo (body · UI 라벨).

**AI 자유 텍스트 헤더**: 각 카드에 `kicker` + `title` + `subtitle` 3필드(모두 optional). AI 프롬프트에서 신문 저널 톤 카피 작성 가이드 주입 — 동일 데이터도 맥락에 따라 헤드카피가 달라져 "같은 대시보드, 다른 뷰" 컨셉을 강화.

### 차트 정책

차트는 **TradingView 임베드를 우선** 사용합니다. TradingView가 지원하지 않는 데이터(커스텀 지표, 비가격 시계열 등)에 한해 자체 차트 컴포넌트를 렌더링합니다. 차트의 구체적인 형태, 사용할 기술 지표 종류, 표현 방식 등은 개발 중 결정.

---

## 6. 개발 로드맵

상세한 단계별 개발 계획은 `docs/ROADMAP.md` 를 참조하세요. **현행 마일스톤(M3) 의 단일 진실 = `docs/M3-plan.md`** (M2 이력은 `docs/task-record/M2-plan.md` 로 이동, 2026-07-15). 요약:

- **M1 (M1.1~M1.6)**: "자연어 → AI → 실데이터 카드" 엔드투엔드 수직 슬라이스 — **2026-05-04 완료 ✅** (Binance 1개 거래소 / 컴포넌트 3종 / Haiku 4.5 / Supabase RLS / **13 테이블 + 13 RLS 정책**, 세부는 `docs/DB_SCHEMA.md`).
- **M1.7 Step 0 (Hetzner 24/7 이전)** — **2026-05-03 완료 ✅** (CPX22 / Nuremberg / 83h+ 무재부팅 입증 + Memory 평탄화 +0.9 MB/h).
- **M1.7 Step 1~6 (Closed Beta Ops 잔여)** — 게이트(`user_allowlist`) + 운영 도구(`/admin`) + 비용 상한 + Magic link + 종합 보안 감사. **현재 보류** (2026-05-18 사용자 결정, `docs/M2-plan.md`) — 사용자 단독 실사용 단계이므로 즉시 베타 게이트 불필요. 외부 베타 손님 받기 시점에 활성화.
- **M1.8 — 선물 데이터 카탈로그 완성 + 사이트=DB 진실 일치 — 2026-05-28 완료 ✅** (`docs/ROADMAP.md §M1.8`) — 8 metric (Funding predicted+realized / OI / Top LSR Accounts+Positions / Global LSR / Taker / Basis) × 단위/정밀도 동기화 + SPOT stale cleanup + spot full ticker 복귀 (§8.4-e) + `docs/canonical-metrics.md` 신설 + `marketUnits.ts` 표시 헬퍼. **M2-plan §Step 1 (funding/OI hotfix) 흡수 처리**. 종단 게이트 G1~G5 전부 통과 (13셀 site=DB 사용자 육안 검증 + 216 test PASS + 3 자문 0 Critical). 8.3c (history backfill) ⏭️ **M1.8.5 이월** (`[8-15]`). 누적 28 commit. 단일 진실 원천 = `docs/task-record/M1.8-complete.md`.
- **M1.8.5 history backfill** ✅ **완료 (2026-06-01)** — `history_futures_indicator` 6 metric × 9 interval × 608 symbol × 14일 = **4,098,247 distinct row / 1.5GB** 1차 backfill. 종단 게이트 G1~G5 통과 (BTC/ETH site=DB 사용자 육안 + 77 test + 4 자문 0 Critical). 실측 교훈: 같은-IP ban → **로컬 one-shot(별도 IP)** 경로. forward-fill(`[8-26]`)는 **M1.9 로 승격**(아래 M1.9) / sliding window(`[8-18]`)만 M2 이월. 단일 진실 `task-record/M1.8.5-complete.md`.
- **M1.9 — history 시계열 지속성(forward-fill) + COINM 확장** ✅ **완료 (2026-06-06)** (`docs/ROADMAP.md §M1.9`) — M1.8.5 가 채운 history 가 2026-05-31 정지(`[8-26]`)한 문제를 별도 Hetzner worker(49.13.138.121 별도 IP)로 forward-fill 24/7 가동해 해소 + COINM 확장. Step 0~3 전부 통과, 종단 게이트 G1~G5 ✅. USDM(23h+ 무중단 `NRestarts=0`) + COINM(`markets=[usdm,coinm] tasks=6`, 20 `_PERP` 라이브 실측) 라이브 + **G2 site=DB 소수점 일치(USDM ~50셀 + COINM 24셀, OI=contract 단위)** + ⓑ AbortSignal graceful 종료 2회 검증 + **basis `-1003` = Binance LB 노드 weight 풀 혼잡(basis weight 0, 우리 무관, backoff 흡수) 규명**. 회수 `[8-26]`/`[8-3]`/`[8-20]`/`[8-31]`ⓐⓑⓒ/`[8-33]`/`[3-68]` + **`[8-34]`(2026-06-07)**. **✅ 후속(2026-06-07): COINM 24~48h 안정성 PASS**(롤아웃+22h, NRestarts=0·same-IP ban 0·DB 무구멍, `task-record/M1.9-coinm-stability.md`). 잔여(차단 아님) `[8-31]`ⓓ·`[8-22]`. 단일 진실 `task-record/M1.9-complete.md`.
- **M1.8 완료 후 → M1.8.5 → M1.9 → M2-plan §Step 2** (사용자 실사용 피드백 본격 진입) → §Step 3 (우선순위 재배치 + M2 Step 분해) → §Step 5 (M2 본 진입).
- **M2+**: 확장 루프 7단계 반복 — 실사용 피드백 기반 테마 단위 착수 (`docs/M2-plan.md` + `M2-step2-usage-feedback.md §H`). **1회전 = 테마 A (카드 표현력 확장) ✅ 완결 (2026-06-11)**: IndicatorCard + IndicatorListCard 신설(컴포넌트 3→5종) + 리스트 liveness(flash/FLIP) + registry 파생 2중 방어. 동반 사고 해소 3건(@arr WS 폐지 / Supabase Disk IO / symbols 2달 stale→syncSymbolsTask). **2회전 = 테마 B (데이터 정합/quote_asset) ✅ 완결 (2026-06-12)**: quote_asset 3시장 + AI 필터 서버 pushdown + 라이브 G2 5종 PASS (F2 "USDT pairs 오염" 해소, Binance 수치 일치). **3회전 = `[10-33]` "모든 코인 보기" ✅ (2026-06-14)** (sort/limit 직교 분리 + fetchAll + react-virtual 임계값 분기) + **테마 C (UI 셸 + 유저 프리퍼런스) 🔄 진행 중** (2026-06-15~16: Step 0 셸 골격 ✅ + 셸 트림(우측 Session Log 패널 폐기) ✅ + Step 1 `user_preferences` 첫 user-owned-write 테이블 ✅ + **Step 2 `saved_views` 영속화 + 계정 위젯 좌측 이전 ✅** + **Saved Views v2 (ChatGPT 식 살아있는 뷰: 활성뷰+자동저장+rename+새로고침 자동 복원) ✅ 완결 (2026-06-18, 라이브 G2 7/7 통과 — create→자동저장→New view(순서 불변식)→복원→rename→새로고침 복원, DB 교차검증, 콘솔 0)**. **Step 4 (자유 텍스트 Custom Instructions: ChatGPT 식 1칸, enum 기각 + 프롬프트 인젝션 5겹 방어) ✅ 완결 (2026-06-18, 라이브 G2 4/4 — 악성 메모 무력화 + XSS 콘솔 alert 0 + 정상 메모 ETH 4h 반영 + raw 저장 site=DB)**. → **테마 C 전 step 완료, 완결 후보**). **4회전 = 경로 A (WS 프론트 직결) ✅ 완결 (2026-06-24)**: PRD §2 경로 A(WS→프론트 직결, Supabase 미경유) 실구현 — 사용자 실측 "박동"(경로 B 500ms throttle 하한)의 근본 해법. Step 1(워커 WS 서버) + Step 3a(레지스트리 transport 칸 + buildLiveTopic 단일 진실, 불투명 토픽+자유 payload 범용 파이프) + Step 3b(프론트 라우터) + Step 2 Phase 1/2(wss `ws.use-travis.com` Caddy LE + JWT) + **Step 4 Phase A/B(ticker transport ws_direct 플립)**. **라이브 G2 PASS**: 박동 소멸(가격 ~1초 매끄러움 사용자 실측) + site=DB(24H low/high 소수점 일치) + 토큰 통과 + 경로 B 무중단 공존. **★ 라이브 정정 ES256**: 이 프로젝트가 이미 비대칭 ES256 서명으로 마이그레이션 → 워커 JWKS 공개키 검증으로 전환(Step 2 HS256 가정을 라이브가 정정). **= PRD 3대 데이터 경로(A/B/C) 전부 구현 완료.** `[10-1]`(a) 묘비. **▶ 경로 A fast-follow 트랙 (2026-06-25~): #1 마크/펀딩 ✅ 완결 (2026-06-26) → #2 청산 피드 카드 🔄 진행 중 (Phase A non-web ✅: 토픽 keystone+liquidation 플립+워커 publish, 다음 Step 4 `useDataServiceFeed` 훅 = `content` updateMode 첫 실사용) → #3 trade+호가 예정**. **6회전 = Feed form + 청산 ✅ 완결 (2026-07-06)**: 모양-제네릭 feed-card(events 2번째 form) + 청산×table-card 8번째 datasource(같은 데이터 두 형태 — "watch"→피드/"biggest"→표 AI 자율 분기 라이브 실측) + 피드 과거 seed + Binance CM migration 오염(21.9만 행) 당일 규명·차단·청소. 단일 진실 `docs/task-record/M2-pathA-ws-direct.md §3` + `M2-pathA-ff2-liquidation.md`. **7회전 = 사이클 1 (Realtime throttle `[10-77]`) ✅ 완결 (2026-07-09 G3 PASS)**: markPrice DB 쓰기만 60초 coalescing(경로 A 방송 무접촉) — Realtime 사용량 하향·deadlock 0. **8회전 = 사이클 2 (GenericChart, Composable Stage 2+3) ✅ 완결 (2026-07-10 — Step 6 라이브 G2 7종 PASS: site=DB Binance 공식 API 8자리 일치 + AI 분기 8/8 + G2 적발 결함 3건[N1 last_settled predicted 오염·줌 툴팁·y축 부호 소실] 당일 수정. 다음 사이클 = `[10-35]` forward-fill lag)**: Shape 계약(servableShapes×acceptsShapes 2층 게이트) + `useDataServiceSeries`(첫 주기 pull) + **chart-card**(uPlot 자체 차트 — §5 차트 정책의 "TV 미지원 데이터 자체 차트" 첫 실현, series 7종: history 격자 6 + 펀딩 정산 이벤트) + 그리기 어휘 line/area/bars/stepped + **펀딩 히스토리 별도 이벤트 테이블 `history_futures_funding`**(정산 1회=1행, 60일 backfill 완주 USDM 196,600행) + AI 자율 분기 라이브 실증(★"compare" 시간축 단서 유무로 table↔chart 갈림 = §2 직교 실증). 단일 진실 `task-record/M2-cycle2-genericchart.md`. **9~12회전 = 사이클 3(`[10-35]` lag) ✅ + 사이클 4(4a 스타일/4b 크로스 스크리너 = 🎉 Stage 4 AI 계약 완료) ✅ (2026-07-12) + 사이클 5(Stage 1b — ticker/indicator 카드 → big-value/detail 카드 수렴) ✅ (2026-07-14) = 🎉 §2 "모든 데이터 × 모든 형태" 격자 완성 선언**(데이터-잠금 카드 부채 0, kline 차트=§5 정책상 의도된 예외. 단일 진실 `task-record/M2-cycle5-stage1b.md`) — 이후 타 거래소·뉴스·체결/호가 개방 재논의.
- **🏁 M2 종료 → M3 "Binance 우주 완성" (2026-07-15 신설, 단일 진실 `docs/M3-plan.md` + `ROADMAP.md §M3`)**: 신규 데이터 **공급자** 추가 전, Binance 데이터만으로 모든 데이터 × 모든 형태 × **모든 인터랙션**(§4 spawn/drill-down 실동작 wire 포함) + 고도화 + UIUX 완성. 경계 = 공급자 기준(Binance 내부 datasource 추가는 IN — 알파/체결·호가 등). 첫 사이클 = 인터랙션 wire — **✅ M3-step1 완결 (2026-07-16)**: Spawn 실동작(§4 각주 참조) + 라이브 G2 PASS + AI 자율 actions 선언 실증 (`task-record/M3-step1-interaction-wire.md`). 이후 스케치: M4 외부 데이터소스(CMC·뉴스) → M5 베타 준비(M1.7 활성화 + 100명 스케일 + 보안·정리) → 베타테스터 모집 → Launch §L. (세션 컨텍스트·혼합 응답 = 보류 / OKX = 베타~Launch 사이 재논의.)
- **Launch §L**: 기능 최소 요건 / 안정성·보안 / 관측·운영 / 법적·정책 체크리스트 통과 시 배포 (`docs/ROADMAP.md §L`).

---

## 7. 데이터 아키텍처 원칙

- **Supabase가 모든 폴링 기반 데이터의 단일 진실 공급원.** 모든 데이터 소스(거래소, CoinGecko, CoinGlass, 뉴스, 온체인)는 Hetzner 워커가 수집하여 Supabase에 저장.
- **`_now` 테이블**은 각 데이터 유형의 최신 스냅샷을 보유하며, 데이터 특성별 차별화된 주기(고/중/저 변동성 tier 원칙, **구체 수치는 개발 중 결정**, 배치 API 우선 활용)로 업데이트. **`_now` 테이블에는 거래소 원시 데이터와 사전 계산된 가공 값이 같은 행(row)에 함께 저장됨** — Hetzner 워커가 폴링 시 원시 데이터 수집과 동시에 가공 값을 계산하여 한 번의 upsert로 저장. 이를 통해 Supabase Realtime이 한 행 변경 시 원시값+가공값을 함께 프론트엔드에 푸시하므로 추가 JOIN이나 별도 구독 불필요.
- **`_now` 사전 계산 원칙**: Hetzner 워커가 `_now` 테이블에 사전 계산하여 저장하는 범위는 **실시간 스크리닝에 필요한 핵심 지표**로 한정합니다 — 단순 변화율(가격·거래량·OI 등의 시간대별 변화율)과 핵심 기술 지표의 현재값(구체 지표는 개발 중 결정). Hetzner 워커는 **메모리에 심볼별 롤링 윈도우**(최근 N개 데이터 포인트)를 유지하여, `_history` 테이블을 조회하지 않고도 기술 지표를 효율적으로 계산합니다. 사전 계산 목록은 하드코딩이 아니라 **데이터 소스 레지스트리에 등록하는 방식**이므로, 새 지표 추가 시 레지스트리 등록 + 계산 로직 추가로 AI가 자동 사용 가능. 사전 계산 목록에 없는 지표를 유저가 요청 시 AI가 `_history` 원시 데이터로 즉석 계산하거나 graceful하게 미지원 응답. 사용자 로그를 분석하여 특정 지표가 반복적으로 스크리닝에 사용되면 `_now` 사전 계산으로 승격할 수 있습니다.
- **`_history` 테이블**은 과거 데이터를 축적하며, **시계열 분석의 핵심 데이터 소스**입니다. 시간에 따른 변화 추이 조회, 차트 데이터 제공, 과거 패턴 분석 등에 사용됩니다. `_history` 테이블은 다음 설계 가이드라인을 따릅니다:
  - **인덱스**: 시계열 조회에 최적화된 복합 인덱스 (구체 구성은 테이블별로 개발 중 결정)
  - **다운샘플링**: 최근 데이터는 고해상도(원본), 오래된 데이터는 저해상도(집계)로 보관하여 스토리지 관리 (구체 티어와 보존 기간은 개발 중 결정)
  - **파티셔닝**: PostgreSQL 네이티브 파티셔닝으로 시간 범위별 분할하여 쿼리 성능 확보 (구체 기간 단위는 개발 중 결정)
  - **보존 정책**: 다운샘플링 티어별 자동 보존/삭제 정책 (구체 정책은 개발 중 결정)
  - `_history` 테이블에 저장할 컬럼 범위(원시 데이터만 vs 가공 값 포함)는 개발 중 테이블별로 결정.
- **AI의 `_now`/`_history` 선택은 레지스트리 기반 자율 판단**: 데이터 소스 레지스트리에 `_now` 테이블과 `_history` 테이블 각각의 특성·용도·queryable fields가 기술됩니다. AI는 이를 읽고 사용자 의도에 따라 적절한 소스를 **스스로 선택**합니다. 별도 라우팅 규칙을 하드코딩하지 않으며, 이는 기존 레지스트리 패턴("하드코딩 금지, AI가 런타임에 판단")의 자연스러운 확장입니다.
- **사용자 데이터 테이블**은 사용자별 설정, 저장된 뷰, 세션 기록을 저장.
- **사용자 로그 테이블**: 사용자별 채팅 로그(쿼리, AI 응답 JSON, 타임스탬프), 행동 로그(카드 클릭, 뷰 저장/로드, 인터랙션 이벤트). RLS 적용으로 본인 로그만 접근 가능. 이 데이터는 AI 의도 파악 개선, 세션 복원, 사용자 분석, 어드민 모니터링에 활용.
- 구체적 테이블 스키마, 컬럼, 데이터 유형은 개발 중 점진적으로 정의 — 사전에 확정하지 않음.

### 🔥 사이트 = DB 진실 일치 원칙 (2026-04-27 신설, M1.6 Step 3.5 hotfix 발견)

**사용자(트레이더)가 거래소 공식 웹사이트(현재 Binance, 미래 OKX/Bybit/Bitget/CoinGlass 등)에서
직접 보는 모든 데이터가 TRAVIS 의 DB / 카드 / AI 응답과 완전히 일치해야 합니다.**

- **즉시 적용 (M1)**: 모든 카드 metric 은 거래소 공식 사이트의 동일 값과 일치 검증 필수.
  폴링 stale / WS 미지원 / 단위 불일치 / 계산법 차이 모두 **도메인 결함**.
- **확장 지향 (M2+)**: 거래소 공식 사이트가 보여주는 **모든 데이터** (가격 / OI / funding /
  청산 / LSR / 호가 / 차트 / 뉴스 등) 를 TRAVIS 가 **동일 정확도로 지원** 하는 것을 장기 목표.
  "이 데이터 빼도 되나?" = 자동 "아니오" 답. 도메인 단점은 누적될수록 사용자 신뢰 손실 가속.
- **현실 한계 3가지**:
  - (a) WebSocket 미지원 데이터는 별도 stream + REST 조합으로 보완
  - (b) 거래소별 metric 정의 차이 → canonical 정의로 통일 (M2 전 `docs/canonical-metrics.md` 신설)
  - (c) WS first / REST fallback only — 폴링은 마지막 수단
- **사례 (2026-04-27 hotfix)**: M1.3 Step 5b 에서 ticker WS 를 `!miniTicker@arr` (6필드) 로
  설정 → `priceChangePercent` 미포함 → DB price_change_pct 영구 stale → 사용자 발견.
  M1.6 Step 3.5 hotfix 로 `!ticker@arr` (17필드) 전환 + 본 원칙 명문화.
- 상세: CLAUDE.md §데이터 소스 위생 원칙 #9, `docs/task-record/M1.6-step3.5-ticker-stream-hotfix.md`.

---

## 8. 거래소 커버리지

**MVP 거래소:** 바이낸스, OKX, Bybit, Bitget — 각각 현물 및 선물 시장.
이들은 거래량 기준 글로벌 상위 거래소를 커버합니다 (규제/현물 전용 특성으로 코인베이스와 업비트는 제외).

**거래소 어댑터 패턴:**
각 거래소는 REST API(폴링)와 WebSocket(스트리밍)을 커버하는 공통 인터페이스를 구현합니다. 새 거래소를 추가하려면 어댑터 하나만 구현하면 됩니다 — 오케스트레이터, 프론트엔드, 데이터 파이프라인에 변경 불필요.

**자산군 확장:**
MVP는 현물(spot)과 선물(futures)을 지원합니다.

**Futures 범위**:
- **Perpetual 중심**: 스냅샷 데이터 + 실시간 WebSocket 모두 지원 (MVP 주 범위, `futures_usdm` + `futures_coinm`)
- **Dated/quarterly**: 심볼 메타데이터 수준 지원 — 심볼 목록에 포함되며 사용자가 dated 심볼을 쿼리하면 정보 조회 가능. 스냅샷/실시간 데이터는 거래소 배치 API 포함 범위 내 best-effort.

어댑터는 지원하는 마켓 타입을 배열로 선언하는 구조(`spot` / `futures_usdm` / `futures_coinm`)이므로, 이후 옵션(options), 알파(alpha), Earn 등 새 자산군은 마켓 타입 추가만으로 확장 가능합니다. 데이터 소스 레지스트리에 해당 자산군의 스키마를 등록하면 AI가 자동으로 사용합니다.

**스토리지 확장성 참고**: 초기에는 Supabase only, 이후 TimescaleDB/ClickHouse 하이브리드 전환 가능성. 자세한 전략은 `docs/ARCHITECTURE.md §10` 참조.

---

## 9. 보안 고려사항

- 모든 사용자별 테이블에 Supabase RLS(행 수준 보안) 적용.
- 환경 변수는 프론트엔드에 노출되지 않음.
- **클로즈드 베타 게이트 (M1.7 Step 1~6, 외부 베타 진입 시)**: 공개 가입 비활성화 — `user_allowlist` 테이블에 등록된 이메일만 `signup` 가능. Supabase `Confirm email` ON + Magic link 병행으로 이메일 소유권 검증.
- **어드민 역할 분리 (M1.7 Step 1~6, 외부 베타 진입 시)**: `auth.users.app_metadata.role = "admin"` 기반. service_role 만 수정 가능 → 권한 상승 공격 차단. JWT claim 으로 proxy/RLS 가 DB 조회 없이 즉시 판정. `/admin` 페이지 전체가 admin role 한정 접근.
- **비용 상한 (M1.7 Step 1~6, 외부 베타 진입 시)**: `/api/orchestrate` 유저별 일 rate limit 적용. **구체 한도는 단계별로 차등 운영** — 실사용 데이터를 바탕으로 단계마다 다르게 결정하며, 무료 티어와 Pro 티어 한도도 단계별 분리. 초기 예시값 ~100 calls/day 수준이나 확정값 아님 (admin 은 사실상 무제한). UI 에 남은 쿼리 수 영어 실시간 고지(예: `"42 / {daily_limit} queries today"`) + 초과 시 영어 토스트(예: `"You've reached today's query limit ({daily_limit}/day). It resets at 00:00 UTC."`). UI 문자열의 `{daily_limit}` 는 현재 단계의 실제 한도값을 동적으로 주입.
- TRAVIS는 절대 거래를 실행하지 않음 — compliance boundary로 read-only.
- **(확장 루프에서 도입)** 사용자 거래소 API 키: Supabase Edge Functions에서 암호화 저장 + 읽기 전용 복호화 (포지션/잔고/PnL 조회 전용).

---

## 10. 비즈니스 모델 (참고)

단계적 프리미엄 SaaS:

- 무료 티어 (제한된 쿼리/뷰 — 한도는 단계별 차등 운영, §9 비용 상한 참조)
- Pro (~$29/월, 한도는 단계별 차등 운영)
- 상위 티어 (이름/가격/타겟 Launch 이후 결정)
- 거래소 제휴(어필리에이트/브로커) 프로그램을 보조 수익원으로