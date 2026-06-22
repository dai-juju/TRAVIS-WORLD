# TRAVIS — 아키텍처 문서

본 문서는 TRAVIS의 시스템 설계 원칙과 데이터 플로우를 정의합니다.
구체적인 폴더 구조와 파일 구성은 코드베이스를 직접 참조하세요.
제품 요구사항은 `docs/PRD.md`, DB 스키마는 `docs/DB_SCHEMA.md` 참조.

---

## 1. 시스템 구성

TRAVIS는 3개의 독립적인 배포 단위로 구성됩니다:

**Vercel** — Next.js 16 프론트엔드 + API Route (AI 오케스트레이터)
**Hetzner VPS** — 데이터 수집 워커 + WS 릴레이 서버
**Supabase** — DB + Auth + Realtime

이 세 서비스는 각각 독립적으로 배포되며, Supabase를 중심으로 연결됩니다.

---

## 2. 데이터 플로우

프론트엔드는 동시에 3개의 데이터 스트림을 수신합니다:

### 경로 A — WS 스트리밍 (진정한 실시간)

```
거래소 WS → Hetzner 어댑터 → Hetzner WS 릴레이 서버 → 프론트엔드 직접
```

거래소별 WebSocket API에서 지원하는 모든 데이터를 지원. Supabase를 거치지 않음 — 실시간 스트리밍 데이터에 대해 DB write + Realtime broadcast 지연은 용납할 수 없음.
Hetzner가 4개 거래소 × 현물/선물 = 8개 WS 연결을 유지하고, 거래소별 데이터를 정규화된 공통 포맷으로 변환하여 프론트엔드에 릴레이.

**중요**: Path A는 **프론트엔드 실시간 갱신 전용**이며, **AI 의사결정에는 사용되지 않음**. 카드가 Supabase 기반 AI 응답으로 렌더된 이후, 그 카드의 값(가격 틱, orderbook 변화, trades)을 실시간 갱신하는 용도 전용.

#### Binance WS 표준 옵션 (M1.7 Step 0 확정, 2026-05-03)

`BinanceWsRelay` + `BinanceKlineRelay` + `BinanceChunkedRelay` 의 모든 connection 은 **`perMessageDeflate: false` + `maxPayload: 100MB`** 를 표준으로 한다.

- **사유**: M1.6 Step 4 hotfix C 진단에서 압축 활성화 시 ws#1810 backpressure 로 USDM stream 전체 stall 사례 확인. M1.7 Step 0 Substep 0.5 의 **Hetzner 환경 83h 무재부팅 가동 + 6 dump 일관 작동** 으로 영구 정책으로 명문화.
- **트레이드오프**: 압축 disable 로 대역폭 ~2배 증가하지만 Hetzner 1Gbps 환경에서 무시 가능 (1.2 MB/s 수준). 안정성 확보가 결정적.
- **검증 환경**: 개발(Windows 11) + Hetzner production (Ubuntu 24.04 / Nuremberg) 양쪽에서 stream 안정성 입증. 추가 환경 (Hetzner staging 등) 도입 시 동일 옵션 유지 의무.
- **회수**: deferred `[3-51]` perMessageDeflate=false 영구화 ✅

#### Binance WS 수집 구조 — chunked per-symbol + 코얼레서 (M2 테마 A Step 2.5, 2026-06-10)

**`[10-11]` 사고 근본 수정으로 USDM·spot 수집 전송 계층이 교체됨** (단일 진실: `docs/task-record/M2-themeA-incident-arr-stream-stall.md` §9~§10):

- **★ USDM WS base URL = `wss://fstream.binance.com/market`** — Binance 가 2026-04-23 레거시 URL(`/ws`·`/stream`) 을 폐지하고 카테고리 경로로 이전 (ticker/miniTicker/markPrice/forceOrder/kline → `/market`, bookTicker/depth → `/public`). 미이전 연결은 핸드셰이크·구독 ACK 정상이나 데이터 push 0 인 brownout. `BINANCE_WS_BASE` 상수 1곳 + 테스트 단언이 회귀 방어선. COINM(dstream)·spot 은 폐지 공지 없음 — 레거시 유지 (`[10-14]` 공지 감시).
- **수집 흐름**: `BinanceChunkedRelay`(per-symbol 250 streams/conn — USDM 8연결·spot 6연결, 심볼당 suffix 인접 배치로 모든 chunk 에 markPrice@1s 생존 신호) → `StreamCoalescer`(단건을 1초 모아 기존 `@arr` 배열 계약으로 재조립, synthetic stream name) → `StreamRouter` → 기존 핸들러 (무변경). forceOrder 는 sparse 라 passthrough 단건.
- **USDM ticker = full 17필드** (`[3-50]` 회수) — 24h 변화율 매초 WS 적재. COINM 만 `BinanceWsRelay` @arr 잔류 (30심볼 소형, 무사고).
- 연결 관리 코드 3중복(BaseWsConnection 추출)은 의도적 보류 — `[10-12]`, 거래소 2개째 WS 작업 시 회수.

### 🔥 사이트 = DB 진실 일치 원칙 (2026-04-27 신설, 2026-05-28 M1.8 첫 마일스톤급 적용 ✅ 완료 — 13셀 site=DB 사용자 육안 검증 통과)

**사용자가 보는 거래소 공식 웹사이트와 TRAVIS 의 DB / 카드 / AI 응답이 완전히 일치해야 함.**
WS stream 선택 시 mini variant (예: `!miniTicker@arr`) 가 아닌 full variant (예: `!ticker@arr`)
를 우선 채택 — payload 크기 ~3배 증가 vs 사용자 사이트 일치 보장의 트레이드오프에서 후자 우선.

- **즉시 (M1)**: 모든 metric 이 거래소 공식 사이트와 동일 검증
- **장기 (M2+)**: 거래소 사이트의 모든 데이터를 TRAVIS 가 지원 지향
- **canonical 정의**: `docs/canonical-metrics.md` — **M1.8 §8.5 ✅ 신설 완료 (2026-05-26)**. 9 섹션 / 7 metric × 9 interval × 단위 × 정밀도 × 사이트 URL 매트릭스 + PHAROSUSDT 4h funding smoke + M2+ 거래소 다변화 청사진 (predicted/realized 두 컬럼 분리가 OKX/Bybit/Bitget 4 거래소 공통분모로 작동 입증). `apps/web/lib/format/marketUnits.ts` 8 헬퍼가 본 docs 의 코드 차원 구현.
- **M1.8 적용 사례 (2026-05-24)**: (a) `markPriceUpdate.r` = predicted next funding rate / `premiumIndex.lastFundingRate` = realized last settled — 두 컬럼 분리 (`predicted_funding_rate` + `last_settled_funding_rate`). (b) `/fapi/v1/fundingInfo` 로 코인별 4h/8h funding interval 자동 식별. (c) Top LSR Accounts vs Positions = 같은 응답 필드명 (`longAccount` / `shortAccount`) 이지만 의미 다름 → DB 컬럼은 endpoint 별로 분리. 상세: `docs/task-record/M1.8-step0-pre-infra.md`.
- **M1.8 ✅ 완료 (2026-05-28)**: 종단 게이트 G1~G5 전부 통과 (13셀 site=DB 사용자 육안 검증 + 216 test PASS + 3 자문 0 Critical). spot `!ticker@arr` full 복귀 (§8.4-e, spot null 0%). **8.3 history backfill**: 8.3a/b ✅ (`historyBackfillTask` dry-run mode + Hetzner worker 5번째 task 영구 가동, 실 호출 0건) — 8.3c (β) 전체 = "M1.8.5 history backfill" 별도 사이클로 이월 (`[8-15]`). 단일 진실 원천: `docs/task-record/M1.8-complete.md`.
- **M1.8.5 ✅ 완료 (2026-06-01)**: `[8-15]` 회수 — `history_futures_indicator` 1차 backfill 완료. 6 metric × 9 interval × 608 symbol × 14일 = **4,098,247 distinct row / 1.5GB** (`docs/DB_SCHEMA.md` 적재 현황 참조). 적재 = `runHistoryBackfill.ts` 로컬 one-shot(production 과 다른 IP — same-IP `-1003` ban 회피). 핵심 교훈 3건: (a) Binance rate-limit 을 200+`{code:-1003}` envelope 로 반환 (429 아님) → `isBinanceErrorEnvelope` 가드, (b) `/futures/data/*` stat 5종은 범위>limit 시 sampling → **고정 폭 윈도우**(endTime=cursor+500×interval) 로 dense 확보, (c) production 과 같은 IP backfill 금지. ⚠️ **forward-fill 미구현 → M1.9 에서 해소 예정** (`[8-26]`, 아래 M1.9 라인). 단일 진실 원천: `docs/task-record/M1.8.5-complete.md`.
- **M1.9 📋 계획 확정 (2026-06-01, 미착수)**: history 시계열 지속성(forward-fill) + COINM 확장. **별도 Hetzner worker(2번째 서버, 자체 Primary IPv4)** 로 forward-fill 24/7 가동 — production 폴링 worker 와 **IP 격리**(same-IP `-1003` ban 회피, M1.8.5 실측). 인프라 구조 변화: 기존 단일 worker(`apps/worker`) → **collector 2개**(production 폴링 + `apps/collector-history` 증분 backfill, `packages/exchange-collectors` 공유 골격, 코드는 forward-fill task 1개만 = YAGNI). COINM 은 forward-fill market_type 일반화로 흡수(과거 대량 backfill 불필요 — 베타 ~1달 전 가동 누적). 저장은 향후 native range partition by `recorded_at` (TimescaleDB 는 Supabase PG17 deprecated → 미사용). 확장성 빚 6건 = `[8-27]` 가시화(M1.9 무관). 단일 진실: `docs/ROADMAP.md §M1.9`.
- 상세: CLAUDE.md §데이터 소스 위생 원칙 #9, PRD §7, `docs/ROADMAP.md §M1.8` / `§M1.8.5` / `§M1.9`

### 경로 B — 나머지 전부 (준실시간)

```
데이터 소스 → Hetzner 폴링 → Supabase DB (upsert) → Supabase Realtime → 프론트엔드
```

가격, 거래량, 펀딩레이트, OI, 뉴스, 코인 메타데이터, 온체인, 상장 목록 등 모든 폴링 기반 데이터.
데이터 특성별 차별화된 주기로 폴링 (고/중/저 변동성 tier 원칙, **구체 수치는 개발 중 결정**, **배치 API 의무 사용**). Supabase가 단일 진실 공급원 — **AI 오케스트레이터는 Supabase DB만 조회**하며, 거래소 REST API, CoinMarketCap, 뉴스 API 등 외부 API를 직접 호출하지 않음. Supabase miss 시 **Tavily 웹 검색 폴백** (~5% 수준).

### 경로 C — AI 명령

```
사용자 쿼리 → Vercel API Route → AI 오케스트레이터 → (Supabase 쿼리) → JSON 뷰 설정 → 프론트엔드
```

AI가 레지스트리를 참조하여 컴포넌트 + 데이터 소스 + 인터랙션 조합을 결정.

**AI의 데이터 소스 제약 (non-negotiable)**:

- AI는 **Supabase DB만 조회** — 거래소 REST API, CoinMarketCap, 뉴스 API 등을 직접 호출하지 않음
- Supabase miss 또는 웹 검색 필요 시 → **Tavily 웹 검색 폴백** (~5% 수준)
- AI는 `dataService` **abstraction layer**를 경유하여 데이터 접근 (미래 스토리지 마이그레이션 safety net, §10 참조)

출력 JSON을 Zod로 검증 후 프론트엔드에 전달. 프론트엔드는 JSON을 파싱하여 카드 생성 + 데이터 구독(경로 A 또는 B) 바인딩.

**프론트엔드 실시간 갱신 경로 두 가지**:

- **경로 A (거래소 WS 직접)**: 고빈도 거래소 스트림 — Hetzner WS 릴레이 → 프론트엔드 직접
- **경로 B 경유 (Supabase Realtime)**: WebSocket으로 직접 지원되지 않는 폴링 기반 데이터 — Hetzner 폴링 → Supabase upsert → Supabase Realtime → 프론트엔드. 이를 통해 AI가 Supabase 기반으로 렌더한 카드가 폴링 데이터 업데이트 시 자동 갱신됨.

---

## 3. AI 오케스트레이터 설계

### 처리 흐름

1. 사용자 자연어 입력 수신
2. Haiku 호출 — 시스템 프롬프트에 레지스트리 내용이 구조화된 텍스트로 주입됨
3. Haiku가 의도 분류 + 복잡도 판단: 단순이면 바로 JSON 출력, 복잡이면 Sonnet에 위임
4. 출력 JSON을 Zod 스키마로 검증. 실패 시 1회 재시도
5. 프론트엔드로 반환

### 핵심 원칙

- **하드코딩 없음**: AI는 레지스트리 목록만 보고 런타임에 조합을 결정. 새 레지스트리 항목 추가 시 AI가 자동 사용.
- **AI 출력 JSON**: 카드별로 컴포넌트 타입, 데이터 소스 + 파라미터, **갱신 모드(updateMode)**, **필터 조건(filters)**, 인터랙션 정의(`actions`) 를 포함. 구체적 JSON 구조는 Zod 스키마 파일 (`packages/shared/src/zodSchemas.ts`) 참조. **M1 시점 `actions` 는 dispatcher 가 검증만 하고 무시** — 카드 클릭 동작 wire 는 M2+ 진입 시 별도 인터랙션 바인딩 작업으로 예정 (§5 액션 디스패처 참조).
- **갱신 모드(updateMode)**: AI가 사용자 의도를 파악하여 카드별 갱신 전략을 결정. `value`(숫자만 갱신), `content`(필터 재평가로 항목 동적 추가/제거), `reactive`(카드 구성 자체 변경, MVP 이후). 상세 설명은 `docs/PRD.md §3` 참조.
- **복합 조건 필터**: AI가 자연어 조건("거래량 증가하고 OI 급증하는 코인")을 데이터 소스 레지스트리의 필터 가능 필드(queryable fields)를 참조하여 구조화된 `filters` 배열로 변환. Haiku가 단순 필터, Sonnet이 복잡한 다중 조건 필터를 처리.
- **`_now`/`_history` 선택은 AI 자율 판단**: 데이터 소스 레지스트리에 `_now` 테이블(최신 스냅샷, 실시간 필터링 최적화)과 `_history` 테이블(시계열 데이터, 시간 범위 조회 최적화) 각각의 특성·용도·queryable fields가 기술됨. AI는 이를 읽고 사용자 의도에 따라 적절한 소스를 스스로 선택. **별도 라우팅 규칙을 오케스트레이터에 하드코딩하지 않음** — 이는 기존 "하드코딩 없음" 원칙의 자연스러운 확장.
- **레지스트리 → 프롬프트 주입**: 4개 레지스트리의 각 항목(key, description, 파라미터, 지원 인터랙션, **필터 가능 필드**)이 AI 시스템 프롬프트에 자동으로 포함됨. 항목 등록만으로 AI가 인식.

---

## 4. 4개 레지스트리 패턴

TRAVIS의 확장성은 4개 레지스트리에 의존합니다. 모든 레지스트리는 동일한 패턴을 따릅니다: **항목 등록 → AI가 즉시 사용 가능, 오케스트레이터 코드 변경 불필요.**

### 거래소 어댑터 레지스트리

거래소 연결을 위한 공통 인터페이스. 각 어댑터는 REST(폴링) + WebSocket(스트리밍)을 구현.
마켓 타입(spot, futures, options, alpha 등)은 어댑터별 배열로 선언 — 새 자산군 추가는 타입 추가만으로 확장.
모든 어댑터는 거래소별 API 차이를 내부에서 흡수하고, 정규화된 공통 포맷으로 데이터를 출력.

> **비거래소 데이터 소스**(CoinGlass, CoinMarketCap, 뉴스, 온체인 등)는 거래소 어댑터보다 단순하므로(REST 폴링 전용, WS·마켓 타입 불필요) 별도의 폴러(poller) 패턴으로 Hetzner 워커에 추가됩니다. 확장 루프의 "수집기 구현" 단계에서 처리.

### 두 레지스트리의 역할 분담

- **거래소 어댑터 레지스트리** → Hetzner 워커가 사용: "어떤 거래소에서, 어떤 방식(REST/WS)으로 데이터를 가져오는가"
- **데이터 소스 레지스트리** → AI 오케스트레이터가 사용: "Supabase에 어떤 데이터가 존재하고, 어떤 필드로 필터링할 수 있는가"

어댑터가 수집한 데이터는 데이터 소스 레지스트리에 등록된 스키마에 따라 정규화되어 Supabase에 저장됩니다. AI는 데이터의 외부 출처(Binance인지 CoinGecko인지)를 알 필요 없이, 데이터 소스 레지스트리가 선언한 필드와 연산자만으로 필터/쿼리 JSON을 생성합니다.

### 데이터 소스 레지스트리

Supabase에 저장된 데이터의 스키마, 갱신 주기, 쿼리 파라미터, **필터 가능 필드(queryable fields)**를 기술.
AI가 이를 읽고 어떤 데이터에 접근 가능한지, **어떤 필드를 기준으로 필터링할 수 있는지** 파악하여 사용자 쿼리에 맞는 소스를 선택. AI 시스템 프롬프트에 자동 주입되는 "AI의 Supabase 데이터 지도" 역할.

필터 가능 필드 선언 예시:

- `volume_change_1h`: 숫자 타입, 비교 연산자(`>`, `<`, `=`) 지원
- `oi_change_1h`: 숫자 타입, 비교 연산자 지원
- `price_vs_ma5`: 위치 타입, `above`/`below` 연산자 지원

이 선언이 AI 시스템 프롬프트에 자동 주입되므로, AI는 존재하지 않는 필드를 참조하는 실수 없이 정확한 필터 JSON을 생성할 수 있음.

### 컴포넌트 레지스트리

사용 가능한 UI 컴포넌트와 필요한 데이터 형태, 지원 크기, 지원 인터랙션을 기술.
AI가 이를 읽고 사용자 의도에 맞는 컴포넌트를 선택.

### 인터랙션 레지스트리

사용 가능한 인터랙션 유형(spawn, drill-down 등)을 기술.
컴포넌트가 어떤 인터랙션을 지원하는지 선언하고, AI가 맥락에 따라 선택.
새 인터랙션 유형은 핸들러 구현 + 등록으로 추가.

### M1 완료 시점 등록 현황 (2026-05-04, M1.5 Step 4 이후 변화 없음)

`packages/shared/src/registries/defaults.ts` 의 `registerDefaults()` 가 부트스트랩 시 일괄 등록. M1.5 Step 4 (2026-04-23) 의 4종 레지스트리 확정 후 M1.6 / M1.7 Step 0 동안 신규 항목 0건 — M1 완료 시점에도 동일한 4종 구성 유지.

- **거래소 1종**: `binance` (spot + futures_usdm + futures_coinm)
- **데이터소스 9종**: `ticker_spot`, `ticker_futures`, `premium_index`, `open_interest`, `long_short_ratio`, `taker_long_short`, `symbols_meta`, `liquidation`, `kline`
- **컴포넌트 3종**: `ticker-card` (updateMode=value), `coin-list-card` (updateMode=content), `kline-chart-card` (updateMode=value, TradingView 임베드)
- **인터랙션 1종 (선언만, 실제 동작 미바인딩)**: `spawn` — `interactionRegistry.ts` 에 Zod 타입 enum + 단일 entry 등록만 됨. **카드 요소 클릭 → spawn 의 프론트엔드 바인딩은 M1 시점 미구현** (`apps/web/lib/actionDispatcher.ts` line 20~23 명시 — dispatcher 가 AI 출력의 `actions` 필드를 검증만 하고 무시). 카드 클릭 동작 wire 는 M2+ 의 별도 인터랙션 바인딩 작업으로 예정.

**M2 진입 시점에 확장 예정** (사용자 실사용 피드백 후 우선순위 분해, `docs/M2-plan.md §Step 3`): 거래소 4종 (OKX/Bybit/Bitget 추가) / 컴포넌트 N종 (히트맵, 청산 피드, funding 카드 등 후보) / 인터랙션 2종 (drill-down + hover-preview).

**핵심 원칙 (M1.5 Step 4 에서 확정)**:
1. React 렌더 맵 (`apps/web/lib/registerCards.ts`) 과 AI metadata registry (`defaults.ts`) 는 **항상 동일 id 집합** 유지. 한쪽만 등록된 상태는 "AI 환각 의존" 으로 숨은 버그 — M1.5 Step 4 에서 `coin-list-card`/`kline-chart-card` 가 registry 미등록 상태여도 Haiku 가 환각으로 우연히 맞추는 경로가 실제 발현했음.
2. **"쿼리 X → 컴포넌트 Y" 하드 매핑 금지**. AI 는 각 엔트리의 `description` 만 읽고 의도 추론. 키워드 hint 는 유스케이스 선언의 보조 단서로만 1줄 이내 허용 (`CLAUDE.md §Registry description 키워드 hint 가이드라인` 참조).
3. AI 출력 id 가 canvas state 로 들어가는 모든 경로에서 **dispatcher 레이어가 충돌 감지 + nonce suffix 자동 부여** 로 유일성 구조 보장 — 프롬프트로 "유일 id 내라" 는 1차 방어선일 뿐 (`actionDispatcher.resolveUniqueId` 참조).

---

## 5. 프론트엔드 설계 원칙

### 캔버스

React Flow 기반 무한 2D 캔버스. 모든 카드는 React Flow의 커스텀 노드로 렌더링.
카드 노드는 공통 컨테이너(드래그, 리사이즈, 삭제, 헤더)이며, 내부에 레지스트리의 컴포넌트를 동적 렌더링.
각 카드는 자체적으로 데이터 구독을 관리 (WS 스트리밍 데이터는 Hetzner WS, 폴링 데이터는 Supabase Realtime).

### 갱신 모드 처리

카드는 AI가 지정한 `updateMode`에 따라 실시간 갱신 전략을 분기:

- **`value` 모드**: 구독된 데이터의 값이 변경되면 카드 내 숫자/차트만 갱신. 카드 구조는 고정.
- **`content` 모드**: 구독된 데이터 변경 시 AI가 정의한 `filters` 조건을 **재평가**. 조건을 새로 충족하는 항목은 카드에 추가, 벗어나는 항목은 제거. 프론트엔드가 Supabase Realtime으로 `_now_*` 테이블 변경을 수신할 때마다 필터 로직을 클라이언트에서 실행.
- **`_history` 기반 주기적 갱신**: `_history` 테이블을 조회하는 카드(시계열 추이 등)는 Supabase Realtime push 대신 **주기적 pull 방식**으로 갱신. AI가 카드 생성 시 `refreshInterval`을 설정하고, 사용자가 카드 설정에서 조절 가능. 구체적인 기본 주기·조절 범위는 개발 중 결정.
- **`reactive` 모드**: MVP 이후 — 상황 변화에 따라 카드 구성 자체가 변경될 수 있음.

### 상태 관리

Zustand(vanilla + Provider 패턴)로 글로벌 상태 관리. 각 store 는 전용 Provider 가
`useState` lazy 로 단일 인스턴스를 생성·주입 → Turbopack HMR 중복 로드로 인한 store
분기를 구조적으로 차단. 현재 store: 캔버스(`canvasStore` — 노드/뷰포트), 채팅
(`chatStore` — 쿼리 히스토리/입력), 토스트(`toastStore` — Undo 큐), **UI 셸
(`uiShellStore` — 좌측 My Views 패널 개폐, M2 테마 C Step 0 신설; 우측 Session Log
패널은 2026-06-15 폐기)**, **활성 뷰(`activeViewStore` — 현재 작업 중인 저장 뷰
id/이름/dirty/saveState, Saved Views v2 Sub-step 2 신설)**. 뷰(저장된 뷰 목록)는
테마 C Step 2(`saved_views`)에서 **영속화 완료** — 탭 닫아도 보존, 라이브 데이터 재연결.
**Saved Views v2 (✅ 완결 2026-06-18, Sub-step 3~5)**: 활성 뷰에 들어가면 캔버스 변경이
1.5초 debounce 후 `PATCH /api/views` 로 **자동 저장**(ChatGPT 식 살아있는 뷰) — 순수 엔진
`autoSaveController`(해시 멱등 + 재시도 + flush 안전망) + `useAutoSaveActiveView` 훅
(canvasStore/activeViewStore 비반응 구독, 리렌더 0). UI = `MyViews`(New view / Save as
view / 더블클릭 rename / 활성 행 강조) + `ViewSaveIndicator`(saveState 상시 "Saved" /
Saving… / Couldn't save). **새로고침 자동 복원**: `activeViewId` 를 localStorage 에
미러(`activeViewStorage`) → 마운트 시 `ActiveViewRestorer` 가 읽어 서버 GET 재검증 후
캔버스 복원(seed 멱등 → 거짓 저장 0). ★ 불변식: 뷰 전환 / New view / 복원 모두 활성 id
변경과 `loadNodes` 의 순서(활성 id 해제·설정과 캔버스 교체의 전후)가 빈 캔버스의 기존
뷰 덮어쓰기를 구조적으로 차단. 채팅 메시지 추가 시 Supabase에 로그 비동기 저장.

### UI 셸 (M2 테마 C Step 0, 2026-06-15)

PRD §5 의 토글 패널 셸. `CanvasWorkspace` 가 `flex [좌 rail | 좌 패널 | 캔버스(flex-1)]`
구조 — 좌측 "My Views"(저장 뷰, Step 2~Views v2) **단일 패널**. ⚠️ **우측 "Session Log"
패널은 2026-06-15 폐기**(사용자 판단: 채팅 복기 비핵심) → 셸은 좌측 전용으로 단순화
(`ShellPanel`/`PanelRail` 의 `side` prop 은 향후 재사용 위해 범용 보존). 핵심 설계:

- **Push 레이아웃**: 패널을 열면 캔버스(ReactFlow flex-1)가 실제로 폭이 줄어듦. 기본
  둘 다 닫힘 → 평소 캔버스 full-width.
- **저사양(UHD 620) stutter 차단**: 패널 폭은 `transition` 없이 즉시 변경(ResizeObserver
  → ReactFlow reflow 가 토글당 1회) + 패널 본체는 `transform:translateX` 슬라이드(GPU
  합성). 닫힘은 폭 collapse 에 `delay`를 줘 슬라이드 아웃이 끝난 뒤 collapse(열림의 거울).
- **고정 컨트롤 편입**: 기존 `fixed`(뷰포트 기준) ThemeToggle/UserMenu/ChatInputBar 를
  캔버스 `<main relative>` 기준 `absolute` 로 전환해 Push 시 캔버스 영역을 추종.
- **z-index 불변식**: 캔버스/chat(z-20) < 패널(z-30) < rail/컨트롤(z-40) < UndoToast(z-50).
  ⚠️ `<main>` 에 z-index/transform 부여 금지(stacking context 생성 시 위계 붕괴).

### Custom Instructions (유저 프리퍼런스 → AI 주입, M2 테마 C Step 4, 2026-06-18)

사용자별 자유텍스트 트레이딩 선호도(ChatGPT 식 "Custom Instructions"). 좌패널 My Views
아래 `CustomInstructions` 폼 — 평소 접힘 + 1줄 프리뷰, 펼치면 textarea + **명시 Save**(dirty
활성, 자동저장 아님 — Saved Views 와 정반대 set-and-forget 성격). 데이터 흐름:

- **저장/조회**: `/api/preferences` GET/PUT → `user_preferences.preferences.customInstructions`
  (인증 서버 클라이언트, RLS 본인 row, user_id=인증값만). **raw 원본 저장**(정화 없음).
- **AI 주입**: `/api/orchestrate` 가 `loadCustomInstructions`(graceful)로 읽어
  `buildSystemPrompt` 의 `<user_preferences>` 블록(GUARDRAILS 다음)에 **soft default** 주입.
  1차/재시도 양쪽. enum 이 아닌 **자유텍스트**라 새 컴포넌트 추가 시 AI 가 자동 반영(레지스트리
  기반 의도추론 = 하드코딩 금지 정합).
- **프롬프트 인젝션 5겹 방어**: ① data-not-instructions framing ② guardrails NEVER override
  ③ `sanitizeCustomInstructions`(`<>`escape + 800자 cap + 마커 제거, **주입 직전 1회** = "저장은
  원본, 정화는 출구마다") ④ 출력단 `tool_use`+`AiCardConfigSchema` Zod 백스톱 ⑤ RLS 폭발반경 =
  본인 세션. 라이브 G2 4/4 실증(악성 메모 무력화 + XSS 콘솔 alert 0 + 정상 메모 반영 + raw site=DB).

### 액션 디스패처

> **M1 시점 현황 (2026-05-04 기준)**: `apps/web/lib/actionDispatcher.ts` 의 `dispatchOrchestrateResponse()` 는 `/api/orchestrate` 응답을 받아 카드 노드를 캔버스에 **추가** 하는 동작만 처리합니다. **카드 내 요소 클릭 → AI 가 정의한 `actions` 실행 (spawn/drill-down) 은 미구현** — dispatcher 가 AI 출력의 `actions` 필드를 검증만 하고 무시 (`actionDispatcher.ts` line 20~23 명시). 아래 spawn / drill-down 항목은 **M2+ 인터랙션 바인딩 작업의 청사진** 입니다.

**M2+ 청사진**:
- spawn: 캔버스에 새 카드 노드 추가 + 데이터 구독 시작.
- drill-down: 같은 카드 내부 뷰 전환 + 뒤로가기 스택 관리.

**Canvas id 무결성 (M1.5 Step 4, 현재 작동)**: AI 응답으로 들어온 카드 id 가 기존 canvas 노드와 충돌하면 `actionDispatcher.resolveUniqueId` 가 short base36 nonce suffix 를 자동 부여. LLM 결정적 id 로 인한 React Flow 덮어쓰기를 **프롬프트 순응성 대신 구조적으로** 방어. (이 부분은 dispatcher 가 카드 추가 시 작동하는 현재 기능 — 위의 M2+ 청사진과 별개로 M1 부터 동작.)

---

## 6. Hetzner 데이터 워커 설계 원칙

> **M1.7 Step 0 ✅ 완료 (2026-05-03)**. M1.6 까지 사용자 Windows 11 로컬에서 worker 실행하다가, Step 4 hotfix 진단에서 USDM `fstream.binance.com` selective stuck 발견 → **CPX22** (2 vCPU AMD / 4GB / 80GB / **Nuremberg DE** / Ubuntu 24.04 LTS / Backup ON / **$11.99/월 + VAT 19%**) 로 이전 후 systemd `travis-worker.service` 24/7 가동. **83h 무재부팅 + 사용자 카드 staleness 1~2초 + 환경 사고 근본 차단** 입증. M1.7 Step 1~6 (allowlist / admin / rate-limit / Magic link / security audit / funding 단위) 은 **사용자 결정 (2026-05-18, `docs/M2-plan.md`) 으로 외부 베타 진입 시까지 보류** — 그 전엔 사용자 단독 실사용 + M2 진행. 세부: `docs/task-record/M1.7-step0-hetzner-migration.md`.
>
> **🔍 USDM stale 원인 확정 (2026-05-03, 83h 가동 6 dump 정량 분석)**: Windows + 사용자 ISP / Linux + Hetzner 데이터센터 IP / Nuremberg DE 라는 클라이언트 환경 3중 + 시장 활동 6개 시간대 모두 동일 ~5분 주기 stale event 패턴 (변동폭 ±0.66%) → **Binance fstream 서버 측 ping/heartbeat 주기 동기화 패턴 confidence 95%+**. 클라이언트 변경 (mini ↔ full / TCP keepalive / staleConnectionMs 조정) 으로 stale event 빈도 감소 불가능. **Hotfix B (mini 6필드 + REST 1분 폴링) 의 graceful 흡수가 100% 작동** — WS stream 분당 1.26회 stale event 발화해도 DB 는 1~2초 stale 만 유지. `[3-50]` full 17필드 복귀는 의미 없으므로 **M2+ 이월** ([3-59] Phase B client-side ping listener 도입 또는 Binance 측 server ping 주기 단축 정책 변경 시 재시도).
>
> **모니터링 자동화 (Step 0 산출물)**: 6h 주기 systemd timer + `monitor.sh` 7-metric 자동 dump (`/var/log/travis-monitor/<timestamp>.log`). 사용자 매 6h 수동 점검 시간 부담 0. 주요 metric: USDM stale event count + WS reconnect count + Supabase staleness. 알림 (Slack/Discord webhook) 은 M1.7 Step 1~6 활성화 시 추가 예정 (외부 베타 진입 트리거, `[3-58]`).
>
> **운영 안정성 입증 (2026-05-03 검증 완료)**: NRestarts 0회 / Memory 11.9% (366 MB) / CPU 평균 5.3% / Hetzner Backup 4개 누적 (7일 보관) / journald 10.7% (53.3 MB) / 루트 디스크 6% (3.7 GB / 75 GB).

워커는 두 가지 역할을 수행합니다:

### 데이터 수집기

스케줄러가 데이터 소스별 주기에 따라 어댑터를 호출.
어댑터가 거래소/외부 API에서 데이터를 수집하고 정규화.

**symbols 마스터 동기화 (`[10-22]` 회수 2026-06-11 / `[10-23]` 1단계 2026-06-12)**: `syncSymbolsTask` 가 3마켓 exchangeInfo 를 **부팅 시 1회 + 1h 주기** (신규상장 11h 누락 실측 후 24h→1h 단축)로 `symbols` 테이블에 upsert (데이터 위생 #3 이행). 부팅 순서는 sync → loadAllSymbols — 신규 상장 심볼이 allowlist/WS 구독 스냅샷에 즉시 반영된다. 신규 심볼의 WS 실시간 합류는 워커 재시작 시점(부팅 스냅샷 정책) — 그 사이는 REST 폴링이 채움. 동적 WS 구독·즉시 감지 옵션은 `deferred [10-23]`.

**사전 계산 레이어**: 원시 데이터 수집 직후, upsert 직전에 **실시간 스크리닝에 필요한 핵심 지표**를 계산. 사전 계산 범위는 단순 변화율(가격·거래량·OI 등의 시간대별 변화율)과 핵심 기술 지표의 현재값으로 한정하며, 구체 지표는 개발 중 결정. 사전 계산 대상은 데이터 소스 레지스트리에 등록되는 방식이므로, 새 지표 추가 시 레지스트리 등록 + 계산 로직 추가로 확장. 오케스트레이터 코드 변경 불필요. 사용자 로그 분석을 통해 특정 지표가 반복적으로 스크리닝에 사용되면 사전 계산 대상으로 승격 가능.

**롤링 윈도우 메커니즘**: Hetzner 워커는 **메모리에 심볼별 롤링 윈도우**(최근 N개 데이터 포인트)를 유지합니다. 기술 지표 계산 시 `_history` 테이블을 조회하지 않고 메모리의 롤링 윈도우에서 직접 계산하므로, DB round-trip 없이 효율적으로 처리됩니다. 윈도우 크기는 사전 계산 대상 지표 중 가장 긴 기간을 요구하는 지표에 맞춰 설정(구체 수치는 개발 중 결정).

Supabase에 upsert — `_now` 테이블은 **원시 데이터 + 가공 값을 같은 행에** 최신 값 덮어쓰기, `_history`에 append.

### forward-fill 수집기 (M1.9 ✅ 완료 2026-06-06, 별도 worker)

**왜 두 번째 worker 인가**: history forward-fill(새 봉 증분 누적)을 production worker 와 **같은 IP** 로 24/7 돌리면 `/futures/data/*` 1000 req/5min IP 카운터가 포화 → same-IP `-1003` ban → production 수집까지 동시 마비 (M1.8.5 실측). 해법 = **별도 Hetzner 서버(별도 Primary IPv4)** 의 `apps/collector-history`. IP 격리는 자동(별도 서버 = 별도 IP, rate-limit 싱글톤도 프로세스 단위).

**공유 구조 (M1.9 Step 1 추출)**: 두 worker 가 수집 엔진을 공유하도록 `apps/worker` 에 갇혀 있던 코드를 추출 —
- **`packages/exchange-collectors`** (신규): Binance `client.ts`(rate-limit 싱글톤) + `historyFetchers.ts` + `normalize/historyFutures.ts` + `core/executeHistoryBackfill`(순수 루프, marketType 파라미터화) + `_upsertRetry`. 의존 = `@travis/data-service` + `@travis/shared` 단방향.
- **`@travis/shared`** 로 `TierPoller`/`IPoller`/`PollTask` 승격 (두 worker 공유 = 폴링 추상 drift 방지).
- **`apps/worker`**(production): 실시간 now-수집 + WS 릴레이 잔류. now-adapter 는 추출된 client/타입을 `@travis/exchange-collectors` 에서 import.
- **`apps/collector-history`**(신규): `TierPoller` 1 + forward-fill task. 범용 골격(register 추가만으로 미래 OKX/뉴스 task 확장). Supabase service_role 은 production 과 공유(같은 DB), Binance IP 만 분리.

순수 추출 = 기능 변경 0 (worker 77 test 회귀 0 + collector dry-boot 실증).
- **Step 2 ✅ (2026-06-04)**: forward-fill 실 구현 — `getMaxRecordedAt` freshness anchor 기반 증분 윈도잉 + interval 그룹 3 task + COINM(dapi) 6 metric + marketType 별 별도 cycle(mixed-batch 불변).
- **Step 3 ✅ (2026-06-04~06, 라이브 가동)**: 2번째 Hetzner 서버(49.13.138.121 Falkenstein, **별도 IP**)에 USDM-only 배포 → history **05-31 정지 → 복구 실증**. 라이브 실측 fix: ① freshness 전용 인덱스(`(exchange,market_type,interval,recorded_at DESC)`, 25초→5.9ms) ② 즉효 3종 ③ **`[8-31]` 근본 fix ⓐⓑⓒ 전부 회수(2026-06-05)**: ⓒ `PerMetricThrottle`(per-metric 간격) + ⓐ `FuturesDataRateLimiter`(프로세스 전역 `/futures/data` token-bucket, **opt-in** 으로 worker now-poller 무영향) + ⓑ `AbortSignal` 협조적 취소(`abortableSleep`+graceful shutdown) + `[8-33]` 금속/주식 basis `-4104` reactive 캐시 제외. 잔여 ⓓ circuit breaker(차단 아님). **✅ COINM 롤아웃(2026-06-06, `markets=[usdm,coinm] tasks=6`, 20 `_PERP` 라이브 실측) + G2 site=DB(USDM ~50셀 + COINM 24셀 소수점 일치, OI=contract 단위) + ⓑ AbortSignal graceful 종료 2회 검증 + basis `-1003` = Binance LB 노드 weight 풀 혼잡(basis weight 0, 우리 무관, backoff 흡수) 규명 → 종단 게이트 G1~G5 통과, M1.9 완료. ✅ 후속(2026-06-07): COINM 24~48h 안정성 PASS(NRestarts=0/22h·same-IP ban 0·DB 무구멍) + `[8-34]` LSR guard false positive 회수. 단일 진실 `M1.9-complete.md` + `M1.9-coinm-stability.md`.**
- 세부: `docs/task-record/M1.9-step1-collector-infra.md` + `M1.9-step2-forward-fill.md` + `M1.9-step3-rollout.md`.

### WS 릴레이 서버

4개 거래소의 WebSocket에 8개 연결 유지 (현물 + 선물).
프론트엔드가 Hetzner WS에 연결하여 필요한 심볼만 구독.
거래소 WS 끊김 시 자동 재연결. 프론트엔드에는 정규화된 공통 포맷으로 릴레이.

---

## 7. Supabase 설계 원칙

### 3가지 역할 (MVP)

- **DB**: 모든 폴링 기반 마켓 데이터, 사용자 데이터, 로그 저장
- **Auth**: 사용자 인증 (이메일 + 비밀번호 M1.6 ✅ 도입 완료, `Confirm email` ON + Magic link 병행은 외부 베타 진입 시 활성화, 소셜 로그인 Launch §L.1)
- **Realtime**: `_now` 테이블 변경 시 프론트엔드에 자동 푸시 (3개 publication — `now_spot_ticker` / `now_futures_ticker` / `now_futures_indicator`. `history_*` 와 `log_*` 는 의도적 비활성)

> **`now_*` vs `history_*` 채움 방식 (M1.8.5 정리 + M1.9 forward-fill 갱신)**: `now_*` = 실시간 WS + N분 폴링으로 "지금 값" **덮어쓰기** (과거 안 남음, Realtime push). `history_*` = 거래소 history API 로 9 interval(5m~1d) 격자 시계열 적재 (Realtime 비활성 → 카드는 주기적 pull). **과거는 실시간 append 로 복구 불가** (폴링 시작 전 데이터는 DB 에 없음) → 거래소 history API 가 유일 경로. ✅ **forward-fill 가동 중 (M1.9 완료 2026-06-06)** — 별도 Hetzner 서버(49.13.138.121)의 `apps/collector-history` 가 USDM+COINM 새 봉을 24/7 증분 누적 → M1.8.5 가 05-31 에 정지시킨 14일 스냅샷이 다시 미래로 성장 중(`[8-26]` 회수). 단일 진실 `task-record/M1.9-complete.md`.

> **M1.7 Closed Beta Ops 보류 (2026-05-18 사용자 결정, `docs/M2-plan.md`)**: `app_metadata.role = "admin"` JWT claim 기반 권한 분리 + `user_allowlist` 테이블 기반 signup 게이팅 + `/api/orchestrate` 유저별 일 rate limit + Magic link 활성화 — 모두 **외부 베타 손님 받기 시점에 활성화** 로 보류. 현재는 사용자 단독 실사용 단계 (M1.7 Step 0 Hetzner 24/7 이전만 2026-05-03 완료). Edge Function 또는 server action 경유로 service_role 접근.
>
> **확장 루프에서 도입**: Edge Functions — 사용자 거래소 API 키 암호화 저장 + 읽기 전용 복호화 등 민감한 서버사이드 로직

### 테이블 카테고리

- `_now`: 최신 스냅샷 (Realtime 구독 대상). 원시 데이터 + 사전 계산된 가공 값(단순 변화율, 핵심 기술 지표 현재값)이 같은 행에 저장. 실시간 스크리닝에 필요한 핵심만 사전 계산하여 컬럼 수 관리.
- `_history`: 과거 데이터 축적, **시계열 분석의 핵심 데이터 소스**. 시간에 따른 변화 추이 조회, 차트 데이터 제공에 사용. 설계 가이드라인:
  - **인덱스**: 시계열 조회 최적화 복합 인덱스 (구체 구성은 개발 중 결정)
  - **다운샘플링**: 최근 데이터는 고해상도, 오래된 데이터는 저해상도로 보관 (구체 티어·보존 기간은 개발 중 결정)
  - **파티셔닝**: PostgreSQL 네이티브 파티셔닝으로 시간 범위별 분할 (구체 기간 단위는 개발 중 결정)
  - **보존 정책**: 티어별 자동 보존/삭제 (구체 정책은 개발 중 결정)
  - 저장할 컬럼 범위(원시 데이터만 vs 가공 값 포함)는 개발 중 테이블별로 결정
- `symbols`: 전 거래소 심볼 마스터 (1행 = 1거래소 × 1마켓타입 × 1심볼, `exchange` + `market_type` + `symbol` 복합 PK). 상장/폐지 상태 자동 반영.
- `user_*`: 사용자별 설정, 뷰, 세션 기록
- `log_*`: 채팅 로그, 행동 로그, AI 검증 실패 로그

### RLS 정책

> **M1 완료 시점 (2026-05-04) 실측 = 13 정책 (anon-read 10 + user-scoped 3 + INSERT/UPDATE/DELETE 0).** 정책별 컬럼·qualifier·인덱스 인벤토리는 `docs/DB_SCHEMA.md §RLS 정책 inventory` 참조 — 본 §는 정책 설계 의도만.

- **마켓 데이터 (`now_*`, `history_*`, `symbols`) — 10 정책 anon-read**: `TO {anon, authenticated} FOR SELECT USING (true)`. 시장 가격·청산·심볼 마스터는 공개 정보. 비로그인 사용자도 카드 렌더 가능 (단, AI 호출 `/api/orchestrate` 는 401).
- **`log_*` (M1.6 Step 2 회수 ✅ 2026-04-25) — 3 정책 user-scoped**: `log_validation_failure` / `log_chat` / `log_behavior` 모두 SELECT `TO authenticated USING (auth.uid() = user_id)`. INSERT/UPDATE/DELETE policy 0개 → service_role 전용 (RLS bypass — `route.ts` 등 server-side 만 INSERT 가능, 클라이언트 위변조 차단). NULL `user_id` (`ON DELETE SET NULL` 익명화 row) 는 `auth.uid() = NULL` → false 로 자동 차단. 세부: `docs/task-record/M1.6-step2-logs-rls.md`.
- **`user_*` (향후 `user_views` 등 도입 시)**: 본인 데이터만 접근 (`auth.uid() = user_id`) — 동일 패턴.
- **어드민 테이블 (외부 베타 진입 시 활성화, M1.7 Step 1~6 보류)**: `(auth.jwt() ->> 'role') = 'admin'` — `user_allowlist`, admin 집계 뷰 등. JWT claim 경유로 DB round-trip 없이 판정.
- **`user_allowlist` (외부 베타 진입 시)**: SELECT 는 admin 만. signup 직전 invite 게이팅은 service_role 경유 server action 으로 (프론트 anon 에서는 읽기조차 불가 → 정보 누출 차단).
- **Rate limit 쿼리 (외부 베타 진입 시)**: `/api/orchestrate` 진입 시 route.ts 에서 service_role 로 `log_chat` count. user 자신은 RLS 로 본인 행만 보이므로 기능상 동일하지만, 성능·일관성 위해 service_role 경유.
- **자동 RLS 활성화 안전망 (`rls_auto_enable()` event trigger)**: Supabase 가 자동 설치 — `public` 스키마에 새 테이블 생성 시 RLS 자동 활성화. M1.4 Step 4.5 "RLS 켜고 policy 0개 → deny-all" 트랩의 부분 방어선. 세부: `docs/DB_SCHEMA.md §함수 및 트리거`.

---

## 8. 확장 패턴

모든 확장은 동일한 패턴을 따릅니다:

| 확장 대상              | 필요한 작업                                     |
| ---------------------- | ----------------------------------------------- |
| 새 거래소              | 어댑터 구현 + 레지스트리 등록                   |
| 새 자산군 (options 등) | 기존 어댑터의 마켓 타입 추가 + 관련 메서드 구현 |
| 새 컴포넌트            | React 컴포넌트 구현 + 레지스트리 등록           |
| 새 데이터 소스         | 수집 로직 + Supabase 테이블 + 레지스트리 등록   |
| 새 인터랙션            | 핸들러 구현 + 레지스트리 등록                   |

어떤 확장이든 오케스트레이터 코드 변경은 불필요합니다.

---

## 9. 인프라

| 서비스      | 역할                                                       |
| ----------- | ---------------------------------------------------------- |
| Vercel      | Next.js 프론트엔드 + API Route 호스팅                      |
| Supabase    | DB + Auth + Realtime (Edge Functions는 확장 루프에서 도입) |
| Hetzner VPS | 데이터 수집 워커 + WS 릴레이 서버                          |
| Claude API  | AI 오케스트레이터 (Haiku + Sonnet)                         |
| Tavily      | 웹 검색 폴백 (~5%)                                         |

---

## 10. 데이터 스토리지 확장 전략

TRAVIS는 CoinGlass/CoinMarketCap 수준의 데이터 커버리지를 목표로 합니다. 이 스케일에서는 Supabase(PostgreSQL) 단독 운영이 시계열 데이터 처리에 한계가 있으므로, **단계적 하이브리드 전환 전략**을 채택합니다. 이 전략은 "deferred migration" 원칙을 따라 — 실데이터 증가 패턴을 관찰한 후 올바른 대안을 선택합니다.

### 기본 원칙

| Phase       | 시점           | 스토리지 구성                                                                |
| ----------- | -------------- | ---------------------------------------------------------------------------- |
| **Phase 1** | 초기 단계      | **Supabase only** (단순성 우선)                                              |
| **Phase 2** | 임계점 도달 시 | **하이브리드** — TimescaleDB 또는 ClickHouse (시계열) + Supabase (user data) |
| **Phase 3** | 장기 (선택적)  | **장기 archive 레이어** — S3/R2 Parquet + DuckDB/ClickHouse cold query       |

### Supabase의 초대형 시계열 한계

- PostgreSQL은 **OLTP 최적화**이며 대량 시계열 insert/aggregation에 취약
- **Native 압축 없음** (TOAST 외에는 페이지 수준 압축 부재)
- **자동 파티셔닝 없음** — 단 **retention 은 M2 S3(2026-06-13)에서 `pg_cron` + 배치 DELETE PROCEDURE 로 자동화 구현** (`history_futures_indicator` interval별 14/60/180일, 매일 03:00 KST). native range partition 은 미구현(라이브 무중단 전환 위험 → 억 단위 성장 시 재평가). 상세 = `DB_SCHEMA.md §Retention 정책`
- **Supabase는 TimescaleDB extension 공식 지원을 중단** — Supabase 내부에서 시계열 확장 불가, 별도 인프라 필수

### 대안 비교

| DB                         | 압축률  | Aggregation | SQL 호환                | 적합 상황                               |
| -------------------------- | ------- | ----------- | ----------------------- | --------------------------------------- |
| **TimescaleDB**            | 3~10x   | 중간        | 높음 (PostgreSQL)       | SQL 호환성 우선, 점진 마이그레이션 용이 |
| **ClickHouse**             | 50~100x | 매우 빠름   | 중간 (SQL dialect 다름) | Aggregation-heavy, 초대형 데이터        |
| **InfluxDB**               | ~10x    | 중간        | 낮음 (Flux)             | 시계열 전용 (crypto 생태계 작음)        |
| **S3 + DuckDB/ClickHouse** | 20x+    | 중간 (cold) | 변동                    | 장기 archive (hot storage 축소)         |

### `dataService` Abstraction Layer — 핵심 Safety Net

**프로젝트 초기부터** AI 오케스트레이터와 Hetzner 워커는 Supabase 클라이언트를 직접 호출하지 않고 `dataService` abstraction layer를 경유합니다:

```
AI Orchestrator ─┐
                 ├─→ dataService.query*() ─┬→ Supabase (Phase 1)
Frontend cards ─┘                          └→ TimescaleDB/ClickHouse (Phase 2 이후)
```

- **Phase 1**: `dataService` 내부 구현은 Supabase만 호출
- **Phase 2 전환**: `dataService` 내부 구현만 변경 → AI 쿼리 코드 변경 0건
- **이것이 "deferred migration" 전략의 핵심** — 미래 변경 가능성을 구조적으로 프로젝트 초기부터 열어둠

### 런타임-agnostic 추상 vs env 주입자 — 책임 분리

`dataService`(`packages/data-service`)는 **runtime-agnostic 순수 추상**이어야 합니다. env 읽기·인스턴스 라이프사이클·인증 컨텍스트(브라우저 cookies / 서버 service_role)를 **내부에서 결정하지 않습니다**. 환경별 클라이언트 인스턴스 공급자는 별도 layer로 분리합니다:

- **`apps/web/lib/supabase/browserClient.ts`** — 브라우저 환경의 `NEXT_PUBLIC_*` env로 `@supabase/ssr` `createBrowserClient` 인스턴스 생산 (cookie 기반 세션). M1.6 Step 1 (2026-04-24) 도입. **lazy singleton + 3중 server-only 가드 (env 누락 throw / `typeof window` / 호출 그래프 격리)**. M1.6 Step 3 에서 옛 `apps/web/lib/supabase.ts` (anon `createClient`) 삭제 + `data.ts` dead code 제거 — 다중 GoTrueClient 경고 자연 소멸.
- **`apps/web/lib/supabase/serverClient.ts`** — Route Handler / Server Component 의 `cookies()` 컨텍스트 기반 `createServerClient`. 요청별 인스턴스 (singleton 금지 — A 유저 쿠키 B 유저 재사용 방지).
- **`apps/web/lib/supabase/serviceRoleClient.ts`** — server-only `SUPABASE_SERVICE_ROLE_KEY` lazy singleton. `log_*` INSERT 전용 (RLS bypass). M1.5 Step 2c 도입.
- **`apps/worker/src/supabase.ts`** — Hetzner 워커 환경의 `SUPABASE_SERVICE_ROLE_KEY` env로 RLS 우회 클라이언트 생산. `NEXT_PUBLIC_*` prefix 사용 금지(브라우저 노출 차단).

이 분리 덕분에 `SupabaseDataService`는 외부에서 주입받은 `SupabaseClient`만 알면 되며, 환경별 차이는 공급자 layer가 흡수합니다. M1.6 auth 도입과 Phase 2 스토리지 전환이 양쪽 모두 이 약속에 의존합니다.

### 프론트 dataService (M1.6 Step 3 신설, 2026-04-26)

`packages/data-service` 와 별개로 **`apps/web/lib/dataService/`** 를 신설했습니다 — 프론트 카드의 read 면 + Realtime 구독 면 단일 진입점.

- **`channelManager.ts`**: Supabase Realtime 의 datasource 별 단일 channel 운영. `.on('postgres_changes', ...)` 평생 1회만 호출 (옵션 Z, backend-infra-specialist 자문). 카드 listener 는 manager 의 dispatch table 에만 등록 — channel 손대지 않음. 1초 grace period (Strict Mode + 카드 swap 안전). `[3-33]` M1.4 잠복 버그 (동일 datasource 카드 2개 동시 mount → throw) 의 구조적 해결.
- **`hooks.ts`**: `useDataServiceRow<T>` / `useDataServiceTable<T>` — `useSyncExternalStore` 패턴 (React 19 호환 + tearing 방지, nextjs-frontend-specialist 자문). 옛 `useRealtimeRow` / `useRealtimeTable` 폐기.
- **`supabaseAdapter.ts`**: `getDataSourceClient()` 어댑터 경계 — M2+ GraphQL/WS 직접/TimescaleDB 다변화 시 본 어댑터만 교체.
- **외부 면 (`index.ts`)**: hooks + types only export. internal (channelManager / supabaseAdapter / throttler / payload / **transport / liveConnection / liveTopicManager**) 차단 — 카드가 우회 호출하면 `[3-10]` 위반 재발.

#### 경로 A (WS 프론트 직결) 인프라 (M2 경로 A 테마, 2026-06-23 — 🔄 진행 중. ★ 서버/인프라 라이브 노출 완료, 프론트만 휴면)

PRD §2 경로 A(거래소 WS → 워커 WS 서버 → 프론트 직결, Supabase 미경유)의 프론트 측. **현재 휴면**(ws_direct datasource 0 = ticker realtime 유지 → production 은 경로 B만; 실제 플립은 Step 4). channelManager(경로 B)의 검증된 패턴을 미러:

- **`transport.ts`**: `resolveTransport(datasource)` — datasource 의 `transport` 칸(레지스트리, default `realtime`)을 읽어 경로 A/B 분기. 카드는 transport 를 몰라도 됨(hooks 가 분기).
- **`liveConnection.ts`**: 워커 WS 서버(`NEXT_PUBLIC_WS_URL`, 로컬 `ws://localhost:8081` / 배포 `wss://`)에 단일 연결 + 지수 backoff 재연결. envelope = 프론트 로컬 타입(워커 무접촉, 같은 4필드 wire 계약).
- **`liveTopicManager.ts`**: 토픽 dispatch table = channelManager 쌍둥이(단일 연결 / topic 별 listener / 1초 grace / 재연결 시 활성 토픽 재구독 / listener throw 격리). 토픽은 **불투명 문자열**(운반층 미파싱), `buildLiveTopic`(@travis/shared, 워커·프론트 단일 진실)으로 조립.
- **hooks 분기**: `useDataServiceRow` 가 ws_direct 면 `liveTopicManager`(경로 A), 아니면 `channelManager`(경로 B). 외부 시그니처 불변(`selector?` 추가만).
- **워커 측**: `apps/worker/src/ws-server/`(LiveBus pub/sub + LiveWsServer + envelope + **auth/rateLimiter**). tickerWsHandler 가 enriched 행을 upsert(경로 B)와 **병행** 방송(경로 A). 단일 진실 = `docs/task-record/M2-pathA-ws-direct.md`.

**경로 A 보안 모델 (M2 경로 A Step 2 — Phase 1 설계 2026-06-22 + Phase 2 ✅ 라이브 검증 2026-06-23)**: 경로 A 는 DB(RLS)를 건너뛰는 직결 채널이므로 **WS 핸드셰이크 인증이 유일한 접근 제어선**. ★ **Phase 2 라이브 배포 완료**: `wss://ws.use-travis.com` 외부 노출 + Caddy 2.6.2 Let's Encrypt 인증서(tls-alpn-01) + ufw 8081/2019 외부 차단 + 무토큰 `wscat`→401 실증 + `@security-auditor` 노출-직후 재감사 **0 Critical/4W/9P** (단일 진실 `task-record/M2-pathA-ws-direct.md §2.6.5`). 아래는 설계 모델(전부 라이브 검증됨):

- **TLS**: `ws.use-travis.com`(Cloudflare DNS-only) → Hetzner **Caddy** 리버스 프록시가 Let's Encrypt 자동 발급 → `wss://` 종단 후 내부 `ws://127.0.0.1:8081` 프록시. WS 서버는 외부에 직접 listen 안 함(host 127.0.0.1, 방화벽 8081 차단 = 이중 안전).
- **인증**: 프론트가 Supabase access token 을 `Sec-WebSocket-Protocol` subprotocol(`[travis-live-v1, <jwt>]`)로 핸드셰이크에 실음 → 워커가 **HS256 로컬 검증**(`jose`, algorithms 고정·aud=authenticated·exp). 무효/만료/위조는 `verifyClient` 에서 upgrade 거부(WS 미수립). 만료 시 close(4401) → 재인증. ★ HS256 채택 근거: 워커가 이미 service_role 보유 → 비대칭 키 대비 blast radius 동일(과설계 회피).
- **fail-closed**: `SUPABASE_JWT_SECRET` 미설정 시 WS 서버 미기동(인증 없는 노출 0초) — 단 수집(경로 B)은 무관하게 동작.
- **오남용 방어**: 연결당 구독 cap + 메시지 rate limit(token bucket) + ping/pong 좀비 정리 + maxPayload. 잔여(베타 전): 수집-WS 프로세스 분리(`[10-54]`) / IP·유저당 동시 연결 cap(`[10-56]`) / CF Spectrum(`[10-55]`).

**책임 경계**: `packages/data-service` 는 worker 의 bulk write + AI 오케스트레이터의 read 추상. `apps/web/lib/dataService` 는 프론트 카드의 Realtime 구독 fan-out + 단일 channel 관리(경로 B) **+ WS 직결 토픽 fan-out(경로 A, 진행 중)**. 두 layer 가 같은 `Database` 제네릭 타입은 공유하지만 인스턴스 / 인증 컨텍스트 / 호출 패턴 모두 분리.

### Phase 2 마이그레이션 경로 (임계점 도달 시)

1. **Hetzner 자체 호스팅 TimescaleDB 또는 ClickHouse 구축** (비용 효율, 기존 Hetzner 인프라 활용)
2. **`_history_*` 테이블부터 점진 이전** — 대량 시계열이 하이브리드 DB로
3. **Supabase 유지 대상**: `user_*`, `log_*`, `exchange_*`, 최신 `_now_*` 일부
4. **Dual-write 일정 기간** — zero-downtime 보장
5. **검증 후 구 테이블 drop**

### 트리거 조건 (Phase 2 진입 판정)

모니터링 기반으로 판정:

- Supabase DB 크기 임계점 도달 (구체 수치는 개발 중 결정)
- 쿼리 성능 저하 감지 (aggregation 쿼리 latency 증가)
- 스토리지 비용이 TimescaleDB/ClickHouse 자체 호스팅 비용을 초과하는 시점

### Phase 3 — 장기 archive (선택적)

- 오래된 `_history_*` 데이터 (예: 6개월 이상)를 S3 또는 Cloudflare R2 Parquet 파일로 archive
- DuckDB 또는 ClickHouse S3 engine으로 cold query
- Hot storage를 1/10 수준으로 축소 → 극한 비용 효율

### 개발 중 결정할 사항

- 구체 임계점 수치 (DB 크기, 쿼리 latency 등)
- TimescaleDB vs ClickHouse 선택 (실데이터 쿼리 패턴 분석 후)
- `dataService` abstraction layer interface 상세 형태
- Dual-write 기간
- Archive 보존 기간 정책
- `_now_*` 테이블의 하이브리드 전환 여부 (고빈도만 이전 or 전체 유지)
