# TRAVIS — DB Schema

> 이 문서는 개발 진행에 따라 점진적으로 채워집니다.
> 테이블은 데이터 종류별로 카테고리를 나누어 관리하며, 각 테이블의 이름·컬럼·인덱스·RLS 정책은 실제 구현 시점에 하나씩 결정합니다.
> 개발 순서는 `docs/ROADMAP.md`를 참조하세요.

## 네이밍 규칙

```
{시점}_{도메인}_{세부}

시점:   now_     = 최신 스냅샷 (Supabase Realtime 구독 대상, 심볼당 1행 유지)
        history_ = 시계열 축적 (차트, 추이 분석, 패턴 분석)
도메인: spot_    = 현물
        futures_ = 선물 (USDM + COINM 모두)
        (확장 루프에서 추가: news_, onchain_, sentiment_ 등)
세부:   ticker, indicator, kline, liquidation, ...
```

## 다중 거래소 처리

모든 테이블에 `exchange` + `market_type` + `symbol` 공통 컬럼이 존재합니다.
- **같은 종류의 새 거래소** → 기존 테이블에 행 추가 (테이블 구조 변경 없음)
- **기존 도메인의 새 지표** → 컬럼 추가 (ALTER TABLE)
- **완전히 새로운 데이터 종류** → 새 테이블 쌍 (`now_` + `history_`) 생성

## 카테고리

- `now_*` — 최신 스냅샷 테이블 (워커 폴링 결과, Supabase Realtime 구독 대상). **거래소 원시 데이터와 사전 계산된 가공 값이 같은 행(row)에 컬럼으로 함께 저장됨.** 컬럼은 3가지 카테고리로 구성됩니다:
  - **원시 데이터**: 거래소 API에서 직접 수집한 값 (가격, 거래량, OI, 펀딩레이트 등)
  - **단순 변화율**: 시간대별 변화율 (가격·거래량·OI 등의 N분/N시간 변화율)
  - **핵심 기술 지표 현재값**: 실시간 스크리닝에 필요한 핵심 지표 (구체 지표 종류는 개발 중 결정)
  
  사전 계산 범위는 **실시간 스크리닝에 필요한 핵심만**으로 한정하여 컬럼 수를 관리합니다. 워커가 메모리의 롤링 윈도우에서 지표를 계산하여 원시 데이터와 함께 한 번의 upsert로 저장. Supabase Realtime 한 번의 행 변경 알림으로 원시값+가공값 모두 프론트엔드에 도달. 별도 가공 테이블 분리 금지 — JOIN 비용과 구독 복잡도 방지. 사용자 로그 분석을 통해 특정 지표가 반복적으로 스크리닝에 사용되면 사전 계산 대상으로 승격 가능.

  **M1.3 Step 5 기준 실제 채움 타이밍 (2026-04-20, WS 전환 완료)**:
  - `now_spot_ticker`의 `price_chg_{5m,15m,1h,4h}` / `volume_chg_{5m,15m,1h}` / `volume_ratio` → **tickerWsHandler** 가 WS `!miniTicker@arr` (1초 push) 수신 → tickerWindow 에서 과거 값 조회 → pctChange 계산 → 원시 row에 merge → upsert.
  - `now_futures_ticker`(USDM+COINM)의 동일 컬럼들 → 동일 tickerWsHandler 가 marketType 분기로 처리. age 1~3초 유지.
  - `now_futures_indicator`의 `mark_price` / `index_price` / `last_funding_rate` / `next_funding_time` → **markPriceWsHandler** 가 WS `!markPrice@arr@1s` 수신 → partial UPDATE (interest_rate/OI/LSR/Taker 컬럼 미포함 → 기존값 유지).
  - `now_futures_indicator`의 `open_interest` / `top_ls_ratio_accounts` / `taker_buy_sell_ratio` / `oi_chg_*` → perSymbolTask(직선 순회 실질 주기 ~341초, REST)가 indicatorWindow 에서 과거 값 조회 → 같은 row에 merge. **WS 스트림 없음** (Binance 제공 안 함).
  - `history_futures_liquidation` → **forceOrderWsHandler** 가 WS `!forceOrder@arr` 이벤트성 INSERT. 청산 발생 시에만 단일 객체로 push.
  - **volume_chg_5m 해석 전환 (2026-04-20 완료)**: Step 4에서 해석 A(24h rolling 차분, 근사)였던 것이 Step 5 에서 **해석 B(1m kline 최근 5개 합 vs 직전 5개 합)** 로 전환. klineWsHandler 가 `<symbol>@kline_1m` 을 `volumeKlineWindow` (in-memory, DB 저장 X) 에 push → preComputeTicker 가 window 에 10개 이상 sample 있으면 자동 해석 B 계산. 10개 미만이면 해석 A fallback. 컬럼명 유지, 데이터 의미만 정확.
  - **WS 전환 배경 (2026-04-20)**: Step 4 REST 폴링이 Binance SPOT IP weight 한도 200~260% 지속 초과. 주기 3차 조정(6s→20s→30s)에도 수렴 불가. Binance 공식 권고대로 WS Streams 로 전환 → weight 카운터와 무관, IP ban 위험 완전 해소. 상세: `docs/task-record/M1.3-step5-ws-relay.md`.
  - **WS 구독 대상 심볼 수 (2026-04-20 hot-patch MCP 실측)**: SPOT TRADING **1,408** / USDM TRADING **608** / COINM TRADING **30**. `symbols` 테이블 전체는 4,309 row (SPOT BREAK 2,151 + USDM SETTLING 102 + COINM DELIVERING 8 등 비활성 상태 포함). BREAK/SETTLING/DELIVERING 은 Binance WS 에 push 되지 않으므로 구독 대상에서 제외 — `getSymbols` 호출 시 `status="TRADING"` 필터로 처리. `BinanceKlineRelay` 는 CHUNK_SIZE=250 (URL 414 회피) 로 SPOT 6 + USDM 3 + COINM 1 = **총 10개 WS 연결** 로 분할.
  - **24h 변화율 (`price_change_pct`) — M1.6 Step 3.5 hotfix (2026-04-27)**: 이전 (M1.3
    Step 5b ~ M1.6 Step 3) 은 `!miniTicker@arr` (6필드) 라 `priceChangePercent` 미포함 →
    DB 가 M1.3 Step 4 시점 값으로 영구 stale (사용자 발견). **`!ticker@arr` (17 필드)
    로 전환** — 매초 `P` (priceChangePercent) / `p` (priceChange) / `w` (weightedAvgPrice)
    / `n` (tradeCount) / `O` (openTime) / `C` (closeTime) 6 필드 추가 적재. 사이트=DB 일치
    원칙 (CLAUDE.md §위생 #9) 정합. 상세: `docs/task-record/M1.6-step3.5-ticker-stream-hotfix.md`.
  - **M1.6 Step 4 hotfix B (2026-04-28) 임시 롤백**: Windows 환경 payload-size selective
    failure 발견 (USDM 608 + SPOT 1408 심볼 × 17필드 stall) → `!ticker@arr` → `!miniTicker@arr`
    (6필드) 임시 복귀 + **`ticker24hrBatchTask` 신규 — 1분 주기 REST `/api/v3/ticker/24hr` /
    `/fapi/v1/ticker/24hr` / `/dapi/v1/ticker/24hr` 폴링** 으로 P/p/w/n/O/C 6 필드 partial
    upsert 보강. `IDataService.upsertNow{Spot,Futures}TickerPartial` 인터페이스 신규.
    24h 변화율 sync 1초 → 1분 stale 부분 후퇴 (사이트=DB 일치 acceptable level). Hetzner
    Linux 이전 (M1.7 Step 0, `[3.5-8]`) 후 `!ticker@arr` full 복귀 (`[3-50]`). 상세:
    `docs/task-record/M1.6-step4-hotfix-bc.md`.
  - **SPOT 추가 필드 (`bid_price` / `ask_price` 등) — deferred [3-40]**: SPOT 의
    `!ticker@arr` 는 21 필드 (b/B/a/A/x 추가) 지만 USDM 은 17 필드. 일관성 위해 본 hotfix
    에선 미적재. USDM `<symbol>@bookTicker` 별도 stream 동시 도입 시점에 SPOT b/B/a/A/x
    함께 회수.
  - **volume_chg_5m 해석 주의**: Step 4에서는 24h rolling volume의 차분(해석 A 근사)을 사용하며, Step 5 WebSocket(`!miniTicker@arr` 또는 1m kline 스트림) 연결 후 1m kline 5개 합(해석 B)로 자동 전환될 예정. 컬럼명은 유지되고 데이터만 정확해짐.
- `history_*` — 과거 데이터 축적 테이블, **시계열 분석의 핵심 데이터 소스**. 시간에 따른 변화 추이 조회, 차트 데이터 제공, 과거 패턴 분석에 사용됩니다. 데이터 소스 레지스트리에 `_history` 테이블의 특성·용도·queryable fields가 기술되며, AI가 사용자 의도에 따라 `_now`와 `_history` 중 적절한 소스를 스스로 선택합니다. 설계 가이드라인:
  - **인덱스**: 시계열 조회 최적화 복합 인덱스 (구체 구성은 테이블별로 개발 중 결정)
  - **다운샘플링**: 최근 데이터는 고해상도(원본), 오래된 데이터는 저해상도(집계)로 보관하여 스토리지 효율 관리 (구체 티어·보존 기간은 개발 중 결정)
  - **파티셔닝**: PostgreSQL 네이티브 파티셔닝으로 시간 범위별 분할, 쿼리 성능 확보 및 오래된 데이터 효율적 삭제 (구체 기간 단위는 개발 중 결정)
  - **보존 정책**: 다운샘플링 티어별 자동 보존/삭제 정책 적용 (구체 정책은 개발 중 결정)
  - 저장할 컬럼 범위(원시 데이터만 vs 가공 값 포함)는 개발 중 테이블별로 결정
- `symbols` — 전 거래소 심볼 마스터 (1행 = 1거래소 × 1마켓타입 × 1심볼)
- `log_*` — 로그 테이블 (**RLS 필수**: M1.6에서 `auth.uid() = user_id` 추가)
* 위의 종류는 확장 루프에서 추가/변경될 수 있습니다.

각 테이블이 생성되면 이 문서에 (이름, 목적, RLS 정책, 특이사항)을 추가합니다. **컬럼 구조의 진실 공급원은 `supabase/migrations/*.sql` 파일**이고, 본 문서는 (a) 테이블 단위 도메인 해설 + (b) 비전공자(=금융/MBA 트레이더) 친절판 + (c) 함정 박스 위주로 보강합니다.

> **사이트=DB 일치 원칙 (CLAUDE.md §데이터 위생 #9, 2026-04-27 신설)**: 거래소 공식 사이트가 보여주는 모든 metric 은 TRAVIS 의 DB / 카드 / AI 응답과 **완전히 일치해야 함**. 본 문서의 모든 컬럼 해설에서 사이트의 어느 화면 / 어느 필드와 대응되는지 (그리고 단위·계산법 함정이 있다면) 명시합니다.

---

## 테이블 목록 (M1.3 — 2026-04-18 생성)

### 마스터

| 테이블 | 목적 | PK | RLS | 비고 |
|--------|------|-----|-----|------|
| `symbols` | 전 거래소 심볼 마스터 | (exchange, market_type, symbol) | M1.6 | 워커가 exchangeInfo 주기 호출로 신규 상장/폐지 자동 반영 |

#### `symbols` 컬럼별 의미 (15 컬럼)

| 컬럼 | 타입 / NULL / 디폴트 | 도메인 의미 (트레이더 친절판) |
|---|---|---|
| `exchange` | VARCHAR(20) NOT NULL · PK | 거래소 이름. M1 = `'binance'` 만 존재. M2+ OKX/Bybit/Bitget 추가 시 동일 컬럼에 row 만 추가 — 새 테이블 X. |
| `market_type` | VARCHAR(20) NOT NULL · PK | `'spot'` / `'futures_usdm'` / `'futures_coinm'`. USDM = USDT 정산 무기한 (BTCUSDT), COINM = 코인 정산 무기한 (BTCUSD_PERP). 사용자가 거래소 사이트에서 보는 **선물 페이지 두 탭** 과 1:1 대응. |
| `symbol` | VARCHAR(40) NOT NULL · PK | 거래소 원본 심볼 문자열. SPOT/USDM = `BTCUSDT` 형태, COINM = `BTCUSD_PERP` / `BTCUSD_240329` 형태 (만기 분기물 포함). |
| `base_asset` | VARCHAR(20) NOT NULL | "어떤 코인" — `BTC`, `ETH`, `SOL`. 사용자가 "BTC 좀 보여줘" 라고 하면 AI 가 이 컬럼으로 cross-exchange 모음 가능. 인덱스 보유 (`idx_symbols_base_asset`). |
| `quote_asset` | VARCHAR(20) NOT NULL | "무엇으로 가격이 매겨졌는가" — `USDT` / `USD` / `IDR` / `JPY` / `TRY` / `EUR` 등. ⚠️ **함정**: `BTCIDR` 의 `last_price` 1,347,137,652 은 IDR 단위 (USD 환산 약 $86k). 단위 명시 안 하면 사용자가 USDT 로 오해. [3-55] 카드 헤더 badge 작업으로 회수 예정. |
| `status` | VARCHAR(20) NOT NULL · DEFAULT `'TRADING'` | Binance 공식 enum: `TRADING / HALT / BREAK / PRE_TRADING / POST_TRADING / SETTLING / DELIVERING / DELIVERED / PRE_SETTLE / CLOSE / PENDING_TRADING`. ⚠️ **데이터 위생 #1 (CLAUDE.md)**: WS handler 의 normalize 직후에도 `status='TRADING'` allowlist 필터 필수. WS 는 SETTLING/CLOSE 심볼도 계속 push 함 (ALPACAUSDT 사고, M1.4 Step 4.7). 인덱스 보유. |
| `contract_type` | VARCHAR(30) NULL | NULL = 현물. 선물은 `PERPETUAL` / `CURRENT_QUARTER` / `NEXT_QUARTER` 등. 만기물 (분기물) 은 `delivery_date` 와 같이 본다. |
| `onboard_date` | TIMESTAMPTZ NULL | 상장일. 신규 상장 코인 스크리닝 시 "최근 7일 상장" 같은 필터 의도로 사용. |
| `delivery_date` | TIMESTAMPTZ NULL | 만기일. 무기한 (PERPETUAL) 은 매우 먼 미래 또는 NULL. 분기물은 실제 만기. |
| `price_precision` | INT NULL | 가격 소수점 자릿수. UI 렌더 시 `toFixed(price_precision)` 으로 거래소 사이트와 동일한 정밀도 유지. |
| `quantity_precision` | INT NULL | 수량 소수점 자릿수. 동일. |
| `tick_size` | NUMERIC NULL | 최소 가격 변동 단위. M1.3 Step 1 보완 마이그레이션 추가. TRAVIS 는 read-only 라 주문 안 넣지만 카드 표시 정밀도 결정에 사용 가능. |
| `step_size` | NUMERIC NULL | 최소 수량 변동 단위. 동일. |
| `min_notional` | NUMERIC NULL | 최소 주문 금액. "최소 주문 금액 이상인 코인만" 같은 스크리닝 필터링 의도. |
| `updated_at` | TIMESTAMPTZ NOT NULL · DEFAULT NOW() | 워커 마지막 upsert 시각. ⚠️ INSERT 시에만 자동 갱신 — `now_*` 와 달리 BEFORE UPDATE 트리거가 **없음** (symbols 는 변경 빈도 낮고 manual reload 시점 추적이 더 유의미). |

**워커 채움 경로**: `apps/worker/src/poller/tasks/syncSymbolsTask.ts` 가 Binance `/api/v3/exchangeInfo` (SPOT) + `/fapi/v1/exchangeInfo` (USDM) + `/dapi/v1/exchangeInfo` (COINM) 를 호출 → `IDataService.upsertSymbols` → 본 테이블. **1h 주기 자동 reload** (`[10-23]` 1단계 2026-06-12 — 신규상장 11h 누락 실측 후 24h→1h 단축, CLAUDE.md §위생 #3 상한 충족) 로 상장/폐지 lag 상한 1h 보장.

**현재 row 수**: 2026-05-20 기준 `rows=0` 으로 보고됨 (worker in-memory allowlist 유지 운영 모드 영향). 워커 첫 reload 사이클이 돌면 SPOT TRADING ~1,408 + USDM TRADING ~608 + COINM TRADING ~30 + 비활성 status row 가 채워짐.

**사용처**: `getSymbols` API (datasource registry id = `symbols`) → AI 가 base_asset / quote_asset / status 필터로 cross-exchange / cross-market 조회. CoinListCard 의 base_asset grouping.

### _now (최신 스냅샷, Realtime 활성화)

| 테이블 | 목적 | PK | RLS | Realtime |
|--------|------|-----|-----|----------|
| `now_spot_ticker` | 현물 시세 + 사전 계산 (변화율) | (exchange, market_type, symbol) | M1.6 | O |
| `now_futures_ticker` | 선물 시세 + 사전 계산 (USDM + COINM) | (exchange, market_type, symbol) | M1.6 | O |
| `now_futures_indicator` | 선물 지표 통합 (펀딩, 마크, OI, 롱숏, 테이커) | (exchange, market_type, symbol) | M1.6 | O |

#### `now_spot_ticker` 컬럼별 의미 (30 컬럼, rows≈1,441)

**구성**: PK 3 + 거래소 원시 18 + 사전 계산 8 + quote_asset 1 + updated_at = **30**.

| 컬럼 | 타입 / NULL | 도메인 의미 + 사이트=DB 일치 | 채움 경로 |
|---|---|---|---|
| `exchange` / `market_type` / `symbol` | VARCHAR · NOT NULL · PK | 마스터와 동일. `market_type='spot'` 고정. | upsert 시 worker 가 채움 |
| `quote_asset` | VARCHAR(20) NULL | **견적통화** (USDT/TRY/USDC/BTC/IDR/...). **단일 진실 = `symbols.quote_asset` 의 복제** — AI 의 "USDT pairs only" 필터(`[10-2]` F2) + Realtime 페이로드용 최소 denormalization. NULL = symbols 미매칭 고아 row (2026-06-11 backfill 시점 0건). | M2 테마 B (2026-06-11): 마이그레이션 backfill + `tickerWsHandler` 매 upsert (`quoteAssetBySymbol` lookup — allowlist 와 같은 getSymbols 스냅샷). `ticker24hrBatchTask` 는 의도적 미포함 (9-key partial 유지) |
| `last_price` | NUMERIC NULL | 현재가. Binance SPOT 사이트 "Last Price" 와 일치. WS `c` 필드 (1초 push). | `tickerWsHandler` (`!miniTicker@arr` `c`) |
| `price_change` | NUMERIC NULL | 24h 가격 변동 절대값 (현재가 − 24h 전 시가). 사이트 "24h Change" 의 절대값 부분. WS `p` 필드. | M1.6 Step 4 hotfix B 이후 `ticker24hrBatchTask` (REST 1분 주기) |
| `price_change_pct` | NUMERIC NULL | 24h 가격 변동률 (%). 사이트 "24h Change %" 와 1:1. WS `P` 필드. ⚠️ **함정 (M1.6 Step 3.5 hotfix, 2026-04-27)**: `!miniTicker@arr` (6필드) 사용 시 미적재 → DB stale. `!ticker@arr` 17필드 또는 REST 1분 폴링으로 보강. [3-50] M2+ 복귀 예정. | `ticker24hrBatchTask` (REST 1분, partial upsert) |
| `weighted_avg_price` | NUMERIC NULL | 24h 가중평균가. VWAP 변형. WS `w`. | `ticker24hrBatchTask` |
| `prev_close_price` | NUMERIC NULL | 직전 종가. WS `x`. SPOT 21필드 한정 (USDM 미존재). [3-40] 통합 적재 보류. | `ticker24hrBatchTask` |
| `open_price` / `high_price` / `low_price` | NUMERIC NULL | 24h 시가/고가/저가. 사이트 "24h High / Low" 와 일치. WS `o` / `h` / `l`. | `tickerWsHandler` (1초) |
| `volume` | NUMERIC NULL | 24h 거래량 (**base asset** 단위, BTC 수량). WS `v`. | `tickerWsHandler` |
| `quote_volume` | NUMERIC NULL | 24h 거래대금 (**quote asset** 단위). ⚠️ **함정 (quote_volume 단위 다양성 트랩)**: `BTCUSDT` 는 USDT, `BTCIDR` 은 IDR, `BTCJPY` 는 JPY. raw 정렬 시 IDR/JPY 가 USDT 위로 올라옴. default scope 가이드 또는 USD 환산 컬럼이 정공. WS `q`. | `tickerWsHandler` |
| `bid_price` / `bid_qty` / `ask_price` / `ask_qty` | NUMERIC NULL | 최우선 매수/매도호가 + 수량. 사이트 "Order Book" 1번째 row. SPOT 21필드 페이로드 한정 (`b/B/a/A`). [3-40] USDM 동기 적재 보류. | `ticker24hrBatchTask` (현재 NULL 가능) |
| `trade_count` | BIGINT NULL | 24h 체결 건수. WS `n`. | `ticker24hrBatchTask` |
| `open_time` / `close_time` | BIGINT NULL | 24h 통계 윈도우 시작/종료 epoch ms. WS `O` / `C`. | `ticker24hrBatchTask` |
| `price_chg_5m` / `_15m` / `_1h` / `_4h` | NUMERIC NULL | **사전 계산** — 가격 N분/N시간 변화율 (%). 거래소 사이트엔 직접 표시 X → TRAVIS 가공 metric. 워밍업 가드 (`getRecent().length` ≥ STEPS[window]) 미충족 시 NULL. | `preComputeTicker` (`tickerWindow` 롤링 윈도우) |
| `volume_chg_5m` / `_15m` / `_1h` | NUMERIC NULL | **사전 계산** — 거래량 변화율 (%). ⚠️ **함정 (M1.4 Step 4.7 사고)**: 워밍업 부족 시 ±50% 초과 극단값 송출 가능 — 현재는 워밍업 가드로 차단. `volume_chg_5m` 는 M1.3 Step 5 부터 해석 B (1m kline 최근 5합 vs 직전 5합). | `preComputeTicker` + `volumeKlineWindow` (1m kline WS) |
| `volume_ratio` | NUMERIC NULL | 현재 거래량 / 이동평균 거래량. > 1 = 평소보다 활발. | `preComputeTicker` |
| `updated_at` | TIMESTAMPTZ NOT NULL · DEFAULT NOW() | **트리거 자동 갱신** (`trg_now_spot_ticker_updated_at` BEFORE UPDATE → `set_updated_at_now()`). 카드 "몇 초 전 업데이트" 뱃지 + RLS 사용자 단계 stale 필터에 의존. | DB 트리거 (PostgreSQL DEFAULT NOW() 의 UPSERT ON CONFLICT 함정 회피) |

**사용처 (datasource registry)**: `getTopGainers` / `getTopLosers` / `getTopByVolume` / `getSpotTicker` 등. 카드 = TickerCard / CoinListCard / TopMoversCard.

#### `now_futures_ticker` 컬럼별 의미 (26 컬럼, rows≈719 — usdm 689 + coinm 30)

**구성**: PK 3 + 거래소 원시 14 + 사전 계산 8 + quote_asset 1 + updated_at = **26**. SPOT 대비 `bid_price` / `bid_qty` / `ask_price` / `ask_qty` / `prev_close_price` 5컬럼 부재 (USDM `!ticker@arr` 17필드 페이로드 한계, [3-40]) + `base_volume` 1컬럼 추가.

| 컬럼 | 차이점 / 도메인 의미 |
|---|---|
| `market_type` | `'futures_usdm'` (USDT 정산) 또는 `'futures_coinm'` (코인 정산). 사이트의 "USDⓈ-M Futures" / "COIN-M Futures" 탭에 1:1 대응. |
| `quote_asset` | SPOT 와 동일 패턴 (M2 테마 B, 2026-06-11). USDM = USDT 649 / USDC 38 / BTC·USD1 각 1, **COINM = "USD" 단일** (라이브 분포 2026-06-11). "USDC-margined perps only" 류 필터 근거. |
| `volume` | USDM = base asset 수량 (BTC). COINM = **계약 수 (contracts)** — 1 contract = $100 명목 (BTC 외 5/10/20 등). ⚠️ **함정**: COINM 의 volume 을 USDM 처럼 "BTC 수량" 으로 해석하면 도메인 결함. 카드 표시 시 단위 분기 필수 ([3-55] / [3.5-7]). |
| `quote_volume` | USDM 만 채움 (USDT 단위). COINM 은 NULL. |
| `base_volume` | COINM 만 채움 (BTC 단위로 환산된 거래량). USDM 은 NULL. |
| `last_price` / `price_change` / `price_change_pct` / `weighted_avg_price` / `open_price` / `high_price` / `low_price` / `trade_count` / `open_time` / `close_time` | SPOT 와 동일 의미. `price_change_pct` 함정 (M1.6 Step 3.5 hotfix) 동일하게 `ticker24hrBatchTask` REST 1분 보강. |
| `price_chg_*` / `volume_chg_*` / `volume_ratio` | SPOT 와 동일. 사전 계산. |
| `updated_at` | 트리거 (`trg_now_futures_ticker_updated_at`) 자동 갱신. |

**사용처 (datasource registry)**: `getFuturesTicker` / `getTopFuturesByVolume` / `getFundingScreener` 와 join. 카드 = FuturesTickerCard.

#### `now_futures_indicator` 컬럼별 의미 (27 컬럼, rows≈766)

**구성**: PK 3 + 거래소 원시 19 + 사전 계산 4 + updated_at = **27**. 선물 사이트의 **"Funding / Mark Price / OI / Long-Short Ratio"** 패널 전체에 1:1 대응.

| 그룹 | 컬럼 | 도메인 의미 + 사이트=DB 일치 |
|---|---|---|
| **PK** | `exchange` / `market_type` / `symbol` | USDM + COINM 모두 본 테이블에 통합. |
| **마크/펀딩** | `mark_price` | 마크가격 (사이트 "Mark Price"). 청산 계산 기준가 — last_price 와 다를 수 있음. WS `<symbol>@markPrice@1s`. |
| | `index_price` | 인덱스가격 (현물 가중평균, 사이트 "Index Price"). |
| | `estimated_settle_price` | 추정 정산가. **정산 1h 전에만 유의미**, 평소 NULL 또는 무의미값. |
| | `predicted_funding_rate` (M1.8 §8.1 ✅ RENAME 완료 2026-05-25, 옛 이름 `last_funding_rate`) | Predicted next funding rate — **raw decimal** (예: `0.0001` = 0.01%). `markPriceUpdate.r` (WS 1초 push) — Binance 사이트 우상단 funding(4h)/Countdown 박스의 큰 숫자. ⚠️ **함정 (사이트=DB 일치 #9 + [3-48] + [3.5-7])**: 사이트는 `%` 단위 표시. 카드 렌더 시 `*100` 후 `%` 부착 필수. 100배 misread = 트레이더 일수익 1% 의 15% 잠식 시나리오 (crypto-trader Q3 자문). 단위 변환 헬퍼 `formatFundingRate(raw, intervalHours)` M1.8 §8.5 신설 예정. 자문 결과 영구 기록: `docs/task-record/M1.8-step0-pre-infra.md`. **적용 검증 (2026-05-25)**: USDM 720/720 (100%) / COINM 30/46 (65%) — RENAME 후 데이터 보존 확인. |
| | `last_settled_funding_rate` (M1.8 §8.1 ✅ 신설 2026-05-25) | Realized last settled funding rate — raw decimal. 정산 직후 4h(또는 8h) 동안 같은 값 고정. `/fapi/v1/premiumIndex.lastFundingRate` (docs verbatim "Latest funding rate") REST 저주기 폴링 source (M1.8 §8.2 에서 채움 예정). predicted (1초 변동) 와 시간축이 다른 별개 metric — history 시계열에 의미 있게 저장 가능. |
| | `last_settled_funding_time` (M1.8 §8.1 ✅ 신설 2026-05-25, BIGINT) — **매핑 D15 ✅ 2026-05-26**: `nextFundingTime - fundingIntervalHours × 3600 × 1000` 역산 (premiumIndex 응답에 직접 필드 없음, WebFetch spike 2026-05-26 확정). premiumIndexTask 30분 polling 이 채움 (M1.8 §8.2a-2 신설). `last_settled_funding_rate` 와 페어. countdown 계산 보조 데이터. fundingIntervalHours 는 fundingInfoTask Map 의존 (default 8h fallback). |
| | `basis` (M1.8 §8.1 ✅ 신설 2026-05-25) | `futuresPrice - indexPrice` (USD 절대값). Source: REST `/futures/data/basis?contractType=PERPETUAL` (M1.8 §8.2/8.3 에서 채움 예정). 9 interval (5m~1d) 시계열 지원. |
| | `basis_rate` (M1.8 §8.1 ✅ 신설 2026-05-25) | `basis / indexPrice` (decimal, 0.0002 = 0.02%). 카드 표시 시 `*100` 후 `%` 부착. `formatBasisRate(raw)` 헬퍼 M1.8 §8.5 신설 예정. |
| | `annualized_basis_rate` (M1.8 §8.1 ✅ 신설 2026-05-25) | Annualized basis rate (decimal). PERPETUAL 환경 정의는 Binance docs 침묵 — **deferred `[8-2]` M1.8 §8.5 사이트 비교 후 노출 결정**. 잠정 가설: `basisRate × (365 × 24 / fundingIntervalHours)`. |
| | `interest_rate` | 이자율 (펀딩 공식의 interest component). 사이트엔 직접 표시 X — 펀딩 계산 backing data. |
| | `next_funding_time` | 다음 펀딩 정산 시각 (epoch ms). 사이트 "Funding / Countdown" 카운트다운에 사용. |
| **미결제약정** | `open_interest` | OI 수량. ⚠️ **함정**: USDM = base asset 수량 (BTC), COINM = contract count. 사이트는 USDM 을 BTC + USDT 환산 둘 다 표시. 비교 / 정렬 시 USD 환산 필요 ([3-48] M1.7 Step 6 블록킹). M2 에 `open_interest_value` 신설 검토. |
| **상위 LS — 계정수** | `top_ls_ratio_accounts` / `top_long_account` / `top_short_account` | Binance "Top Trader Long/Short Ratio (Accounts)" 패널. long_account + short_account = 1.0. ratio = long/short. |
| **상위 LS — 포지션** | `top_ls_ratio_positions` / `top_long_position` / `top_short_position` | "Top Trader Long/Short Ratio (Positions)" — 포지션 크기 가중. 동일 구조. |
| **전체 LS** | `global_ls_ratio` / `global_long_account` / `global_short_account` | "Global Long/Short Ratio" — 전체 트레이더. |
| **테이커** | `taker_buy_sell_ratio` / `taker_buy_vol` / `taker_sell_vol` | "Taker Buy/Sell Volume". 시장가 매수 vs 매도 — 즉시성 sentiment. |
| **사전 계산** | `oi_chg_5m` / `_15m` / `_1h` / `_4h` | OI N분/N시간 변화율 (%). OI 급증 스크리너의 정공 metric. 워밍업 가드 미충족 시 NULL. |
| **메타** | `updated_at` | 트리거 (`trg_now_futures_indicator_updated_at`) 자동 갱신. |

> 🔴 **데이터 사고 (2026-06-10, `[10-11]`)**: production 워커(178.105.38.94)에서 `!markPrice@arr@1s` (전 종목 배열) 스트림이 **stall** → `mark_price`/`index_price`/`predicted_funding_rate` 컬럼이 **frozen** (값 갱신 정지, `updated_at`은 REST 폴링이 올려 착시). `!forceOrder@arr`(청산)도 동반 stall로 `history_futures_liquidation` USDM 43일 정지. 근본 = `@arr` 대형 프레임 stall(chunked per-symbol·COINM 소형은 정상, 과거 `[3-50]/[3-52]` 연장선). 재시작 복구 불가. **단일 진실 = `docs/task-record/M2-themeA-incident-arr-stream-stall.md`**. 테마 A Step 3 전 근본 수정 예정(@arr→chunked 이전 + premiumIndex REST 즉효 병용).

**채움 경로 (M1.3 Step 5 WS 전환 후, M1.6 Step 3.5 hotfix 반영)**:
- `mark_price` / `index_price` / `estimated_settle_price` / `last_funding_rate` / `interest_rate` / `next_funding_time` → **`markPriceWsHandler`** (`!markPrice@arr@1s`) — 1초 push, partial UPDATE. ⚠️ **현재 `[10-11]` stall로 frozen (위 사고 참조)**.
- `open_interest` / LSR 9개 / Taker 3개 / OI 변화율 4개 → **`perSymbolTask`** (REST 직선 순회, 실질 주기 ~341초). Binance WS 미제공.

⚠️ **partial UPDATE 사고 방지** (CLAUDE.md feedback `ticker_partial_upsert_split`): 두 채움 경로가 같은 row 의 서로 다른 컬럼만 건드림. 일반 upsert 면 한쪽이 다른쪽 컬럼을 NULL 로 덮어씌움. 반드시 `defaultToNull:false` partial upsert.

**사용처**: datasource registry 의 `premium_index` / `basis`(M2 테마 A Step 2 신설) / `open_interest` / `long_short_ratio` / `taker_long_short` 5개 논리 datasource 가 모두 이 한 물리 테이블을 가리킨다(`table` 필드, `[8-27]`#1). 카드 = **IndicatorCard** (M2 테마 A Step 2 ✅ 2026-06-09 — 단일 심볼 지표 카드, datasource 별 적응 렌더). 멀티 심볼 랭킹 리스트(IndicatorListCard)는 테마 A Step 3 예정.
> ⚠️ **registry↔DB 컬럼명 정합 (M2 테마 A Step 2, 2026-06-09)**: M1.8 §8.1 에서 `last_funding_rate` → `predicted_funding_rate` RENAME + `last_settled_funding_rate`/`_time`/`basis`/`basis_rate`/`annualized_basis_rate` 신설됐으나 datasource registry 가 옛 이름을 들고 있던 drift 를 Step 2 에서 수정. `premium_index` 는 이제 predicted/realized 분리 노출, `annualized_basis_rate` 는 queryableField 제외(PERPETUAL 빈값, canonical §2.5).

### _history (시계열 축적)

| 테이블 | 목적 | PK | 인덱스 | RLS |
|--------|------|-----|--------|-----|
| `history_spot_ticker` | 현물 시세 히스토리 | id (auto) | (exchange, market_type, symbol, recorded_at DESC) | M1.6 |
| `history_futures_ticker` | 선물 시세 히스토리 | id (auto) | (exchange, market_type, symbol, recorded_at DESC) | M1.6 |
| `history_futures_indicator` | 선물 지표 히스토리 | id (auto, S2 제거 예정) | **5축 natural_pk UNIQUE (M1.8.5 step2)** + **freshness (M1.9 step3)** (~~4축 lookup~~ M2 S1 DROP `[10-15]`) | M1.6 |
| `history_spot_kline` | 현물 캔들 OHLCV (1m, 5m, 1h, 1d) | (exchange, market_type, symbol, interval, open_time) | PK가 곧 인덱스 | M1.6 |
| `history_futures_kline` | 선물 캔들 OHLCV (1m, 5m, 1h, 1d) | (exchange, market_type, symbol, interval, open_time) | PK가 곧 인덱스 | M1.6 |
| `history_futures_liquidation` | 청산 이벤트 로그 — Binance USDM/COINM 강제 청산 (forceOrder) 이벤트 시계열 | id (auto) | (exchange, market_type, symbol, trade_time DESC), (trade_time DESC) | M1.6 |

#### `history_spot_ticker` 컬럼별 의미 (20 컬럼, rows=0 — snapshot-form M1 미적재)

**테이블 성격**: `now_spot_ticker` 의 주기적 스냅샷. M1 단계에서는 미적재 — M2+ snapshot 워커 도입 시점에 채워짐.

| 그룹 | 컬럼 | 의미 |
|---|---|---|
| PK | `id` BIGINT IDENTITY | DB INSERT 순서. |
| 식별 | `exchange` / `market_type` / `symbol` | `now_*` 와 동일. |
| 원시 시세 | `last_price` / `price_change_pct` / `volume` / `quote_volume` / `high_price` / `low_price` / `trade_count` | `now_spot_ticker` 의 동명 컬럼과 동의어. 스냅샷 시점의 값. ⚠️ 함정: `quote_volume` 단위 다양성은 history 에도 그대로 전파. |
| 사전 계산 스냅샷 | `price_chg_5m` / `_15m` / `_1h` / `_4h` / `volume_chg_5m` / `_15m` / `_1h` / `volume_ratio` | 그 시점의 모멘텀 기록. 시계열 모멘텀 차트 / 백테스트 데이터 소스. |
| 시각 | `recorded_at` TIMESTAMPTZ DEFAULT NOW() | snapshot 적재 시각. 시계열 조회 기준. |

**인덱스**: `idx_hist_spot_ticker_lookup (exchange, market_type, symbol, recorded_at DESC)`.

**M2+ 활용 후보**: 가격 모멘텀 차트, 거래량 패턴 분석, 백테스트.

#### `history_futures_ticker` 컬럼별 의미 (21 컬럼, rows=0 — snapshot-form M1 미적재)

`history_spot_ticker` 와 동일 구조 + `base_volume` (COINM 전용) 추가. 총 = PK 1 + 식별 3 + 원시 8 + 사전계산 8 + recorded_at = **21**.

**인덱스**: `idx_hist_futures_ticker_lookup`.

#### `history_futures_indicator` 컬럼별 의미 (22 컬럼, **rows≈5.4M+ USDM + COINM 누적 — M1.9 forward-fill 24/7 성장 중 (2026-06-06); M1.8.5 1차 backfill 4.1M/1.5GB 기반**, M1.8 §8.1 funding 분리/basis 3종 영역은 `[8-5]` deferred)

> **적재 현황 (M1.8.5 ✅ 2026-06-01)**: 6 metric(`open_interest` / `top_ls_ratio_accounts` / `top_ls_ratio_positions` / `global_ls_ratio` / `taker_buy_sell_ratio` / `basis`) × 9 interval(5m/15m/30m/1h/2h/4h/6h/12h/1d) × 608 symbol × 14일 = **4,098,247 distinct row** (upsert 횟수 23.77M — `defaultToNull:false` ON CONFLICT 자연 키 머지로 distinct ≈ 4.1M). 날짜 범위 2026-05-17 ~ 05-31 12:05 UTC. 6 metric 97~98% dense. 적재 경로 = `apps/worker/src/scripts/runHistoryBackfill.ts` (production 과 다른 로컬 IP one-shot — same-IP `-1003` ban 회피). dataService 메서드: `upsertHistoryFuturesIndicator(rows)` (onConflict 자연 키 5축 + `defaultToNull:false` mixed-batch 안전) + `countHistoryFuturesIndicatorSince(sinceIso)` (head count 검증용). ✅ **M1.9 forward-fill 가동 (2026-06-06 완료, `[8-26]` 회수)**: 별도 Hetzner 서버(49.13.138.121 별도 IP)의 `apps/collector-history` 가 USDM+COINM 새 봉을 24/7 증분 누적 → 05-31 정지 해소. **COINM(`futures_coinm`, `_PERP` 20심볼 라이브 실측) row 도 2026-06-06 부터 누적 시작** (OI=contract 단위, site=DB 입증; 2026-06-07 24~48h 안정성 PASS). 계속 성장 → 수십 GB 도달 시 **native `PARTITION BY RANGE(recorded_at)`** 전환 계획 (TimescaleDB 는 Supabase PG17 deprecated 라 미사용, `[8-18]` sliding window). 단일 진실: `docs/task-record/M1.9-complete.md`.

| 그룹 | 컬럼 | 의미 |
|---|---|---|
| PK + 식별 | `id` / `exchange` / `market_type` / `symbol` | 4개 |
| 마크/펀딩 | `mark_price` / `index_price` / `predicted_funding_rate` / `last_settled_funding_rate` / `open_interest` | 5개. M1.8 §8.1 funding 분리 반영. ⚠️ funding raw decimal 단위 / `open_interest` USDM-COINM 단위 차이는 `now_*` 와 동일. |
| LSR | `top_ls_ratio_accounts` / `top_ls_ratio_positions` / `global_ls_ratio` | 3개 (각 ratio 만 — long/short component 는 미저장). 시계열 LSR 변화만 추적 의도. |
| 테이커 | `taker_buy_sell_ratio` / `taker_buy_vol` / `taker_sell_vol` | 3개. |
| OI 변화율 | `oi_chg_5m` / `_15m` / `_1h` / `_4h` | 4개. |
| Basis (M1.8 §8.1) | `basis` / `basis_rate` / `annualized_basis_rate` | 3개. canonical-metrics.md §2.5 참조. |
| 시각 | `recorded_at` | 1개. |
| **인터벌 (M1.8.5 step2)** | `interval` VARCHAR(5) NOT NULL | **9 enum**: `5m` / `15m` / `30m` / `1h` / `2h` / `4h` / `6h` / `12h` / `1d`. 자연 키 5축 UNIQUE INDEX 의 4번째 축. ON CONFLICT upsert target. |

총 = 4 + 5 + 3 + 3 + 4 + 3 + 1 + 1 = **24** (M1.8.5 step2 후, list_tables 22 = 기존 21 + interval 신규 1). 본 표는 M1.8 §8.1 / M1.8.5 step2 반영 완료 영역만 명시 — 잔여 outdated 영역은 deferred `[8-5]`.

**인덱스 2개 (M2 S2 에서 id PK 제거 + natural_pk → PRIMARY KEY 승격, 2026-06-13)**:
- `history_futures_indicator_pk` **PRIMARY KEY** on `(exchange, market_type, symbol, interval, recorded_at)` — 구 `natural_pk`(M1.8.5 step2 UNIQUE INDEX)를 **M2 S2 에서 PK 로 승격**(`ADD PRIMARY KEY USING INDEX`, 891MB full rebuild 없이 재사용 + 인덱스명 rename). ON CONFLICT upsert target.
- `idx_hist_futures_indicator_freshness` non-unique on `(exchange, market_type, interval, recorded_at DESC)` — **M1.9 step3 신설** (`20260604000001_m1_9_step3_freshness_index.sql`). forward-fill `getMaxRecordedAt(exchange, market_type, interval)` 전용 — symbol 무관 "격자 최신 시각 1개" 조회 (25초→5.9ms).
- ~~`history_futures_indicator_pkey` UNIQUE on `(id)`~~ — **M2 S2 에서 DROP** (`20260613000002`, 337MB). id 컬럼째 제거 (surrogate, FK 0건 + 코드 read 0건 + Realtime 미포함 실측). natural key 가 PK 승계.
- ~~`idx_hist_futures_indicator_lookup` (exchange, market_type, symbol, recorded_at DESC)~~ — **M2 S1 에서 DROP** (`20260613000001`, 534MB). 미사용 확정(getMaxRecordedAt 은 freshness 서빙, 프론트 직접 조회 0). 미래 "심볼별 history 카드" 시 `CREATE INDEX CONCURRENTLY` 재생성(YAGNI).
- **누적 회수(S1+S2+S3)**: 인덱스 1.87GB → 1010MB (~870MB↓) + id heap + 행 **770만→428만**(342만 삭제, S3 retention).

**Retention 정책 (M2 S3 신설, 2026-06-13 — `[8-18]`/`[10-34]` 회수)**:
- **보존 기간 (interval별 차등, 사용자 확정 — 변경 금지)**: 단주기 `5m`/`15m`/`30m` = **14일** · 중주기 `1h`/`2h`/`4h` = **60일** · 장주기 `6h`/`12h`/`1d` = **180일**.
- **메커니즘**: `prune_history_futures_indicator()` PROCEDURE (ctid LIMIT 8000 배치 + **COMMIT 분리** + `pg_sleep(0.5)` + `pg_try_advisory_lock` 겹침 방지) → `cron.schedule('prune-hist-futures-indicator', '0 18 * * *')` 매일 UTC 18:00(KST 03:00) 자동. 마이그레이션 `20260613000003`. pg_cron extension 설치됨.
- **첫 청소(2026-06-13)**: 342만 행 삭제(770만→428만), IO 무사고(lock_waits 0), dead tuple 148만→7만(autovacuum). ⚠️ `table_total`은 즉시 안 줄어듦(DELETE 공간 OS 미반환·재사용) — **평형 유지가 목적**(더 안 자람). 즉시 디스크 축소는 `[10-37]`(pg_repack).
- **방식 근거**: native partition(정공)은 차등 보존 부적합(한 날짜 파티션에 3보존군 혼재) + 라이브 767만 행 무중단 전환 위험 → pg_cron DELETE 채택. 억 단위 성장 시 `[8-18]` 재평가(혼합 = 신규만 파티션).

**M2+ 활용 후보**: 펀딩 시계열 차트, OI 누적 차트, LSR 변동 패턴.

#### `history_spot_kline` 컬럼별 의미 (15 컬럼, rows=0 — snapshot-form M1 미적재)

| 컬럼 | 의미 |
|---|---|
| `exchange` / `market_type` / `symbol` / `interval` / `open_time` | **5-tuple PK**. `interval` ∈ {`'1m'`, `'5m'`, `'1h'`, `'1d'`}. |
| `close_time` | 봉 종료 epoch ms. |
| `open_price` / `high_price` / `low_price` / `close_price` | **OHLC** — 트레이딩 차트의 정공. 모두 NOT NULL. |
| `volume` | base asset 거래량. |
| `quote_volume` | quote asset 거래대금. |
| `trade_count` | 봉 내 체결 건수. |
| `taker_buy_base_vol` / `taker_buy_quote_vol` | 봉 내 시장가 매수 거래량/대금 — 봉 단위 sentiment. |

**M1 미적재 사유**: `klineWsHandler` 가 `<symbol>@kline_1m` 을 in-memory `volumeKlineWindow` 에만 push (M1.3 Step 5 WS 릴레이 E1 scope). kline DB 저장은 M2+ 이월. ([3-67] 의 self-correction 과 별개로 kline 저장 자체가 별도 deferred.)

**M2+ 활용**: 차트 카드 (kline-chart-card 의 backing data), 백테스트, 패턴 매칭.

#### `history_futures_kline` 컬럼별 의미 (16 컬럼, rows=0 — snapshot-form M1 미적재)

`history_spot_kline` + `base_volume` (COINM 전용) 추가. PK 동일.

#### history_futures_liquidation 도메인 보강 (2026-05-02 추가)

**테이블 성격**: 다른 5개 history_ 가 **snapshot 형 (주기적 pull, M2+ 채움 예정)** 인 반면, 본 테이블만 **이벤트 형 (event-driven append)** — 청산 발생 시점에 forceOrderWsHandler 가 1 row INSERT. 그래서 M1 단계에서도 정상 채워짐 (2026-05-02 기준 13,811 rows / 4 일).

**컬럼 13개** (마이그레이션 `20260418000003_create_history_tables.sql` §line 142~157, 실측 2026-05-20 `information_schema.columns` 와 일치):

| 컬럼 | 타입 | 도메인 의미 |
|---|---|---|
| `id` | BIGINT IDENTITY PK | DB INSERT 순서 — 시계열 분석 시 trade_time 기준이 더 정확 |
| `exchange` | VARCHAR(20) | 거래소 (M1 = `binance` 만, M2+ OKX/Bybit 추가 예정) |
| `market_type` | VARCHAR(20) | `futures_usdm` / `futures_coinm` (spot 청산은 의미 X — 마진 거래만) |
| `symbol` | VARCHAR(40) | `BTCUSDT` / `ETHUSDT` 등 |
| **`side`** | VARCHAR(10) | ⚠️ **함정 — Binance 의 청산 주문 side**. `BUY` = **숏 포지션 청산** (반대 방향 매수로 강제 종료) / `SELL` = **롱 포지션 청산** (반대 방향 매도로 강제 종료). 트레이더 직관 ("내 롱이 청산" → SELL) 과 정합. forceOrderWsHandler 주석 §line 23~25 에 명시. |
| `price` | NUMERIC | 청산 가격 (USDM = USDT, COINM = USD) |
| `avg_price` | NUMERIC | 부분 체결 시 평균 체결가 (단일 체결이면 price 와 동일) |
| `quantity` | NUMERIC | 청산 수량 (base asset 기준 — USDM 은 BTC 수량, COINM 은 contract count) |
| `last_filled_qty` | NUMERIC | 마지막 partial fill 수량 |
| `accumulated_qty` | NUMERIC | 누적 체결 수량 (= quantity 와 같으면 완전 청산) |
| `order_status` | VARCHAR(20) | 보통 `FILLED` (완전 청산) — 부분 청산은 드물지만 가능 |
| `trade_time` | TIMESTAMPTZ | 거래소 발생 시각 (Binance epoch ms 변환). 시계열 분석의 정공 timestamp |
| `recorded_at` | TIMESTAMPTZ DEFAULT NOW() | DB INSERT 시각. trade_time 과 차이 = WS latency + INSERT lag |

**인덱스 2개**:
- `idx_hist_liq_lookup`: `(exchange, market_type, symbol, trade_time DESC)` — 특정 심볼 시계열 조회 (예: BTCUSDT 의 최근 1시간 청산)
- `idx_hist_liq_time`: `(trade_time DESC)` — 전 시장 시계열 조회 (예: 최근 5분 전체 청산 cluster)

**RLS** (M1.4 Step 4.5, 2026-04-22): `anon + authenticated` 모두 SELECT 허용 — 시장 청산은 공개 정보.

**현재 사용 (M1)**: 데이터 축적만. 카드/AI 응답에서 직접 쿼리하는 컴포넌트 0개. 13,811 rows / 4일 = 일평균 3,453 events ≈ 분당 2.4건 (Binance USDM 정상 빈도 — 큰 swing 발생 시 일 수만 건도 가능).

**M2+ 활용 후보** (확장 루프 카드 등장 시):
- **LiquidationFlow** — 시간대별 long vs short 청산 비율 (sentiment 일방향 신호)
- **LiquidationHeatmap** — 가격대별 청산 cluster (다음 가격 끌림 위치 단서)
- **WhaleLiquidationAlert** — 단일 거대 청산 ($1M+) → 시장 변곡 신호
- **SqueezeIndicator** — 짧은 시간 안 청산 폭증 (= long/short squeeze 진행 중)

**주의 사항**:
- `id` 가 PK 지만 같은 ms 에 다중 청산 들어오면 DB INSERT 순서로만 구분 (정합성 영향 0).
- forceOrderWsHandler 주석 §line 18~21: "한 심볼이 같은 밀리초에 두 번 청산되는 케이스는 극히 드물어 실질 문제 없음".
- side 의미 함정 — UI 표시할 때 `side=SELL` 을 그대로 "매도" 로 보여주면 트레이더가 "롱 청산" 로 오해 가능. **"롱 청산" / "숏 청산" 으로 변환 표시 권장**.

### 로그 (M1.6 Step 2 — 2026-04-25 갱신)

| 테이블 | 목적 | PK | RLS | 비고 |
|--------|------|-----|-----|------|
| `log_validation_failure` | AI Zod 검증 실패 로그 (M1.5 도입 + M1.6 Step 2 컬럼 5개 확장) | id (auto) | ✅ M1.6 Step 2 | 컬럼: id / query_text / ai_response / error_type / error_message / created_at + **신규** user_id (UUID FK ON DELETE SET NULL, NULL 허용) / attempt_number (SMALLINT DEFAULT 1) / model_id / system_prompt_version / user_query_hash. 기존 5 row DELETE. |
| `log_chat` | AI 호출 로그 (1 query = 1 row, 비용·토큰·지연·모델·재시도 포함) | id (auto) | ✅ M1.6 Step 2 | 13 컬럼 — user_id / query_text / ai_response (JSONB) / status (CHECK `success`/`fallback`) / fallback_reason / model_id / input_tokens / output_tokens / latency_ms / attempt_number / system_prompt_version / user_query_hash / created_at. M1.7 rate limit 직접 의존. **M1.6 Step 4 (2026-04-28)**: `fallback_reason` application enum 분할 — `parse_error` (extract 단계) / `schema_drift` (Zod 단계) / `transient_error` / `upstream_error` / `timeout` / `refusal` 6종. 옛 `validation_exhausted` 폐기. DB CHECK 제약은 `[3-29]` deferred (M1.7 Step 0 마이그레이션). |
| `log_behavior` | 운영 이벤트 자유 적재 (UI 클릭/카드 추가 등 — Step 3 채움 시작) | id (auto) | ✅ M1.6 Step 2 | 5 컬럼 — user_id / event_type (자유 문자열, Step 3 enum 결정) / payload (JSONB) / created_at. |

**RLS 정책 패턴 (M1.6 Step 2 일괄)**:
- SELECT: `TO authenticated USING (auth.uid() = user_id)` — 본인 row 만 조회
- INSERT/UPDATE/DELETE: 정책 0개 → service_role 전용 (RLS bypass). 클라이언트 위변조 차단.
- NULL user_id (`ON DELETE SET NULL` 익명화) row 는 자동 차단 (NULL = NULL → false). admin (M1.7) 만 별도 policy 로 봄.
- 인덱스: `(user_id, created_at DESC)` — M1.7 rate limit "오늘 N분 내 user X 호출수" leading column 매칭.

#### `log_validation_failure` 컬럼별 의미 (11 컬럼, rows≈6)

| 컬럼 | 의미 |
|---|---|
| `id` BIGINT IDENTITY PK | INSERT 순서. |
| `user_id` UUID NULL · FK `auth.users(id)` ON DELETE SET NULL | 어느 사용자의 query 가 실패했는지. 사용자 삭제 시 NULL 익명화 — 통계용 row 는 보존, 본인 SELECT 차단. |
| `query_text` TEXT NULL | 유저 입력 원문. 디버깅용. PII 가능 — 운영 노트 필요. |
| `ai_response` JSONB NULL | AI 가 반환한 원본 JSON. Zod 실패 원인 분석용. |
| `error_type` VARCHAR(50) NULL | `'zod_parse'` / `'retry_failed'` 등 분류 키. |
| `error_message` TEXT NULL | 에러 상세 (Zod issue path + message). |
| `attempt_number` SMALLINT NOT NULL · DEFAULT 1 | self-correction 재시도 차수. 1 = 최초, 2 = 1회 재시도 후. |
| `model_id` VARCHAR NULL | 호출된 모델 ID (`claude-haiku-4-5` 등). |
| `system_prompt_version` VARCHAR NULL | 프롬프트 버전 — drift 추적. |
| `user_query_hash` VARCHAR NULL | query 해시 (동일 query 반복 실패 패턴 탐지). |
| `created_at` TIMESTAMPTZ NOT NULL · DEFAULT NOW() | INSERT 시각. |

**인덱스**: `idx_log_validation_failure_user_created (user_id, created_at DESC)`.
**FK**: `log_validation_failure_user_id_fkey → auth.users(id) ON DELETE SET NULL`.
**RLS**: SELECT `auth.uid() = user_id` TO authenticated. INSERT/UPDATE/DELETE 정책 0개 (service_role 전용).

#### `log_chat` 컬럼별 의미 (14 컬럼, rows≈91)

**옵션 B** (M1.6 Step 2 확정): 1 query = 1 row. 재시도 attempt 는 별도 row 안 만들고 `attempt_number` 로 합산.

| 컬럼 | 의미 |
|---|---|
| `id` BIGINT IDENTITY PK | INSERT 순서. |
| `user_id` UUID NULL · FK `auth.users(id)` | 호출 주체. 익명 호출 (M1.6 이전 / dev) 는 NULL. |
| `query_text` TEXT NOT NULL | 유저 입력 원문. |
| `ai_response` JSONB NULL | AI 최종 응답 (성공 시 카드 JSON, fallback 시 NULL 또는 부분). |
| `status` VARCHAR NOT NULL · CHECK ∈ `{'success', 'fallback'}` | 호출 결과. |
| `fallback_reason` VARCHAR(40) NULL | **enum 8종** (단일 진실 `packages/shared/.../orchestrateResponse.ts` `OrchestrateFallbackReasonSchema`): `parse_error` (extract 단계) / `schema_drift` (Zod 단계) / `transient_error` (5xx·network·timeout) / `auth_error` (401·403) / `quota_error` (402·429) / `upstream_error` / `timeout` / `refusal`. **DB CHECK 제약 없음** (의도적 — enum 추가가 마이그레이션 강제 안 하도록, [3-29] 미결정). application enum 만 강제. ✅ **M1.9 Step 0 (2026-06-02, [3-68] 회수)**: 옛 `transient_error` 과적재(401/402/429/5xx 가 한 enum)를 `auth_error`(401/403) / `quota_error`(402/429) / `transient_error`(그 외) 로 3분할 — `log_chat.fallback_reason` 만으로 원인 분류 가능. |
| `model_id` VARCHAR NOT NULL | 호출 모델. |
| `input_tokens` / `output_tokens` INT NOT NULL | 비용 산출. |
| `latency_ms` INT NOT NULL | 응답 지연 (ms). |
| `attempt_number` SMALLINT NOT NULL · DEFAULT 1 | 재시도 차수 합산. |
| `system_prompt_version` / `user_query_hash` VARCHAR NULL | drift 추적 / 중복 탐지. |
| `created_at` TIMESTAMPTZ NOT NULL · DEFAULT NOW() | INSERT 시각. |

**인덱스**: `idx_log_chat_user_created (user_id, created_at DESC)`. M1.7 rate limit 의 정공 leading column.
**FK**: `log_chat_user_id_fkey → auth.users(id) ON DELETE SET NULL`.
**RLS**: SELECT `auth.uid() = user_id` TO authenticated. INSERT/UPDATE/DELETE 0개.

#### `log_behavior` 컬럼별 의미 (5 컬럼, rows≈312)

운영 이벤트 자유 적재. M1.6 Step 3 채움 시작.

| 컬럼 | 의미 |
|---|---|
| `id` BIGINT IDENTITY PK | INSERT 순서. |
| `user_id` UUID NULL · FK `auth.users(id)` | 사용자. |
| `event_type` VARCHAR NOT NULL | 자유 문자열. M1.6 Step 3 시작 4종: `chat_submit` / `card_added` / `card_deleted` / `card_layout_summary`. 추가 enum 결정은 운영 중 확장. |
| `payload` JSONB NULL | 이벤트별 자유 필드. ⚠️ **5KB 상한** (client-side 가드, M1.6 Step 3). |
| `created_at` TIMESTAMPTZ NOT NULL · DEFAULT NOW() | INSERT 시각. |

**인덱스**: `idx_log_behavior_user_created (user_id, created_at DESC)`.
**FK**: 동일 패턴.
**RLS**: 동일 패턴.

### 사용자 데이터 (User-Owned Tables — M2 테마 C, 2026-06-15)

마켓 데이터(`now_*`/`history_*`)가 service_role 쓰기 + 전체 읽기인 것과 달리, 이 카테고리는 **유저가 RLS 보호 하에 자기 행을 직접 읽고 쓴다**. 로그 테이블(`log_*`)도 유저 데이터지만 그쪽은 service_role-only 쓰기 + 본인 읽기만인 반면, 여기는 **유저 본인 INSERT/UPDATE 가 허용되는 첫 패턴**이다.

| 테이블 | 목적 | PK | RLS | Realtime |
|--------|------|-----|-----|----------|
| `user_preferences` | 유저별 설정(프리퍼런스) — 유저당 1행 | user_id | M2 테마 C (본인 SELECT/INSERT/UPDATE) | ❌ |
| `saved_views` | 저장 뷰(캔버스 레이아웃) — 유저당 N행 | id (surrogate) | M2 테마 C Step 2 (본인 SELECT/INSERT/UPDATE/**DELETE**) | ❌ |

#### `user_preferences` 컬럼별 의미 (3 컬럼, M2 테마 C Step 1)

| 컬럼 | 타입 / NULL | 도메인 의미 | 채움 경로 |
|---|---|---|---|
| `user_id` | UUID · NOT NULL · PK · FK→`auth.users(id)` | 소유 유저. **ON DELETE CASCADE** — 계정 삭제 시 설정도 함께 삭제(로그 테이블의 SET NULL 익명화와 다름 — 설정은 통계 가치 없어 보존 불필요). PK 라 유저당 정확히 1행. | 프론트 인증 클라이언트 upsert via `/api/preferences` PUT (테마 C Step 4 ✅, user_id = 인증 user.id 만) |
| `preferences` | JSONB · NOT NULL · DEFAULT `'{}'` | 스키마리스 설정 blob. **키 확정 (테마 C Step 4, 2026-06-18)**: `customInstructions`(string, ChatGPT 식 자유텍스트 Custom Instructions, ≤800자 `MAX_CUSTOM_INSTRUCTIONS_CHARS`). 저장은 **raw 원본**(정화 없음) — 정화는 AI 프롬프트 주입 시점 `sanitizeCustomInstructions`(`<>`escape+길이cap+마커제거)가 담당. AI 시스템 프롬프트 `<user_preferences>` 블록에 soft default 로 주입(buildSystemPrompt). ⚠️ 현재 PUT 은 **전체 교체** — 미래 다중 키(quoteScope 등) 추가 시 머지 전환 필요(`deferred [10-51]`). | `/api/preferences` PUT |
| `updated_at` | TIMESTAMPTZ · NOT NULL · DEFAULT NOW() | 마지막 갱신 시각. 공용 `set_updated_at_now()` BEFORE UPDATE 트리거(`trg_user_preferences_updated_at`)로 UPDATE 시 자동 갱신. | DB 트리거 |

**RLS** (마이그레이션 `20260615000001_user_preferences.sql`, 적용 2026-06-15 Dashboard SQL Editor):
- `ENABLE ROW LEVEL SECURITY`.
- SELECT (`TO authenticated`): `USING ((select auth.uid()) = user_id)` — 본인 행만 읽기.
- INSERT (`TO authenticated`): `WITH CHECK ((select auth.uid()) = user_id)` — 남의 user_id 위장 삽입 차단.
- UPDATE (`TO authenticated`): `USING + WITH CHECK ((select auth.uid()) = user_id)` — 본인 행만 + user_id 바꿔치기 차단.
- DELETE: 정책 없음(deny — 계정 삭제 CASCADE 경로만). anon: 정책 0개 deny-all (로그인 유저 전용).
- ⚠️ `(select auth.uid())` 래핑 = initPlan 캐싱(Supabase lint 0003, security-auditor W-1). `saved_views`(Step 2 다행 테이블) 템플릿 정합. **라이브 검증**: `get_advisors` 에서 user_preferences initplan 경고 **0**(반면 로그 3테이블은 raw `auth.uid()` 라 경고 보유 — 기존 빚).
- **보안 감사**: `@security-auditor` **0 Critical APPROVED** (2026-06-15 — 위장삽입·user_id 바꿔치기·anon 우회·DELETE 우회 전부 차단 확인).

**인덱스**: PK(`user_id`) 자동 유니크 인덱스만. 모든 쿼리가 본인 1행 lookup/upsert → 추가 인덱스 불필요.

**사용 패턴**: 프론트 `upsert (ON CONFLICT (user_id) DO UPDATE)` — RLS 가 INSERT/UPDATE 양쪽을 본인 행으로 제한하므로 upsert 안전 (테마 C Step 4 구현).

#### `saved_views` 컬럼별 의미 (7 컬럼, M2 테마 C Step 2 Sub-step 1)

> user_preferences(유저당 1행)와 달리 **유저당 N행** — surrogate `id` PK + DELETE 정책 + 목록 정렬 인덱스가 추가됨.

| 컬럼 | 타입 / NULL | 도메인 의미 | 채움 경로 |
|---|---|---|---|
| `id` | UUID · NOT NULL · PK · DEFAULT `gen_random_uuid()` | 뷰 surrogate 키. 유저당 여러 뷰라 user_id 를 PK 로 못 씀. | DB 기본값 |
| `user_id` | UUID · NOT NULL · FK→`auth.users(id)` | 소유 유저. **ON DELETE CASCADE** — 계정 삭제 시 저장 뷰도 함께 삭제. | 쓰기 API (Sub-step 2) |
| `name` | TEXT · NOT NULL · CHECK(1~200자) | 뷰 이름(좌측 목록 표시). 빈 문자열/과도 길이 차단. | 동일 |
| `cards_config` | JSONB · NOT NULL · DEFAULT `'[]'` | 저장 시점 카드 설정 배열(`AiCardConfig[]`). ⚠️ **내부 구조는 Sub-step 2(직렬화 헬퍼) 확정** — 지금 키 선확정 안 함(deferred decision). 로드 시 `AiCardConfigSchema.safeParse` 재검증. | 동일 |
| `canvas_state` | JSONB · NOT NULL · DEFAULT `'{}'` | 저장 시점 뷰포트(줌/팬 등). ⚠️ 내부 구조 Sub-step 2 확정. | 동일 |
| `created_at` | TIMESTAMPTZ · NOT NULL · DEFAULT NOW() | 생성 시각. 목록 정렬 키. | DB 기본값 |
| `updated_at` | TIMESTAMPTZ · NOT NULL · DEFAULT NOW() | 갱신 시각(rename/덮어쓰기). `set_updated_at_now()` 트리거(`trg_saved_views_updated_at`) 자동 갱신. | DB 트리거 |

**RLS** (마이그레이션 `20260616000001_saved_views.sql`, **적용 완료** Dashboard SQL Editor. **라이브 실측 2026-06-18** `pg_policies`: saved_views **4정책**(SELECT/INSERT/UPDATE/DELETE) 전부 `(select auth.uid())=user_id`, roles=authenticated — Saved Views v2 라이브 G2 에서 create/save/PATCH(자동저장)/delete 전 경로 작동 확인):
- `ENABLE ROW LEVEL SECURITY`. 4정책 모두 `TO authenticated` + `(select auth.uid()) = user_id` (initPlan 캐싱):
  - SELECT `USING` / INSERT `WITH CHECK` / UPDATE `USING + WITH CHECK` / **DELETE `USING`** (뷰 삭제 = 필수 기능, user_preferences 와 차이. DELETE 는 Postgres 상 WITH CHECK 불가 → USING-only 가 정석).
  - anon: 정책 0개 deny-all. service_role: RLS bypass(쓰기 API service_role 경로).
- **보안 감사**: `@security-auditor` **0 Critical APPROVED** (2026-06-16 — 남의 뷰 읽기·위장 저장·user_id 바꿔치기·남의 뷰 삭제 4대 차단 확인. JSONB 저장 계층 sanitize 불필요 = XSS 는 렌더 계층 책임). W-1 = 적용 후 라이브 pg_policy 4행 확인 / Sub-step 2 후속 = cards_config 페이로드 크기 cap(DoS) + 쓰기 route 별도 감사.

**인덱스**: `idx_saved_views_user_created (user_id, created_at DESC)` — 본인 뷰 최신순 목록 조회를 정렬까지 인덱스에서 해결. (+ PK `saved_views_pkey`.)

### 마이그레이션 파일

| 파일 | 내용 |
|------|------|
| `supabase/migrations/20260418000001_create_symbols_and_log.sql` | symbols + log_validation_failure |
| `supabase/migrations/20260418000002_create_now_tables.sql` | now_spot_ticker + now_futures_ticker + now_futures_indicator + Realtime 활성화 |
| `supabase/migrations/20260418000003_create_history_tables.sql` | history 6개 테이블 |
| `supabase/migrations/20260418000004_alter_symbols_add_trading_filters.sql` | symbols에 tick_size/step_size/min_notional 추가 |
| `supabase/migrations/20260420000001_add_updated_at_triggers.sql` | **M1.3 Step 4 사후 발견 반영**: 3개 `now_*` 테이블에 BEFORE UPDATE 트리거 추가 |
| `supabase/migrations/20260422000001_add_anon_read_policies.sql` | **M1.4 Step 4.5 (2026-04-22)**: now_* / history_* / symbols 테이블의 SELECT RLS 정책 (anon + authenticated 모두 read 허용 — 시장 데이터는 공개) |
| `supabase/migrations/20260425000001_m1_6_step2_logs.sql` | **M1.6 Step 2 (2026-04-25)**: log_validation_failure 5 row DELETE + 컬럼 5개 ALTER (user_id / attempt_number / model_id / system_prompt_version / user_query_hash) + log_chat 13 컬럼 신규 + log_behavior 5 컬럼 신규 + RLS SELECT 정책 3개 (`auth.uid() = user_id` 본인만, `TO authenticated`) + 인덱스 3개 (`(user_id, created_at DESC)`). 적용 경로: 사용자 Dashboard SQL Editor 직접 RUN (MCP read-only 모드). |
| `supabase/migrations/20260611000001_m2_themeb_quote_asset.sql` | **M2 테마 B (2026-06-11, `[10-2]` F2 회수)**: now_spot_ticker / now_futures_ticker 에 `quote_asset VARCHAR(20) NULL` ADD + symbols 조인 backfill (고아 0건 사전 실측) + 컬럼 COMMENT. 적용 경로: 사용자 Dashboard SQL Editor 직접 RUN (MCP read-only). 지속 채움 = worker `tickerWsHandler`. |
| `supabase/migrations/20260615000001_user_preferences.sql` | **M2 테마 C Step 1 (2026-06-15)**: `user_preferences` 테이블(user_id PK/FK CASCADE + preferences JSONB + updated_at) + `set_updated_at_now()` 트리거 재사용 + RLS 3정책(본인 SELECT/INSERT/UPDATE, `(select auth.uid())=user_id`, INSERT·UPDATE WITH CHECK 로 위장/바꿔치기 차단, DELETE 없음). **첫 user-owned-write 테이블.** 적용 경로: 사용자 Dashboard SQL Editor 직접 RUN (MCP read-only). `@security-auditor` 0 Critical. |
| `supabase/migrations/20260616000001_saved_views.sql` | **M2 테마 C Step 2 Sub-step 1 (2026-06-16)**: `saved_views` 테이블(surrogate id PK + user_id FK CASCADE + name CHECK(1~200) + cards_config/canvas_state JSONB + created_at/updated_at) + `set_updated_at_now()` 트리거 재사용 + `(user_id, created_at DESC)` 인덱스 + RLS **4정책**(본인 SELECT/INSERT/UPDATE/**DELETE**, `(select auth.uid())=user_id`). 둘째 user-owned-write 테이블(유저당 N행 → DELETE 정책 + 목록 인덱스 추가). 적용 경로: 사용자 Dashboard SQL Editor 직접 RUN (MCP read-only). `@security-auditor` 0 Critical APPROVED. |

> **본 docs 보강 작업 자체는 마이그레이션을 생성하지 않습니다** (2026-05-20). 스키마 변경 0, 컬럼 의미 해설 + 신규 §§ (RLS inventory / 함수·트리거 / Migration 운영노트 / Realtime inventory) 추가만. 새 마이그레이션 row 가 추가되어야 할 시점은 [3-29] (`log_chat.fallback_reason` DB CHECK 제약) / [3-48] (`open_interest_value` 단위 환산 컬럼 신설 검토) 등 deferred 항목 회수 시점.

### 트리거 (M1.3 Step 4 사후 — 2026-04-20 추가)

`updated_at` 컬럼은 `DEFAULT NOW()` 로 선언되어 있지만 PostgreSQL 규약상 **INSERT 시에만 적용**되고 upsert의 ON CONFLICT UPDATE branch에서는 기존 값을 유지한다. 워커가 upsert로 반복 갱신하는 경우 `updated_at` 이 최초 INSERT 시각에 고정되어 신선도 판단 불가. 이를 해결하기 위해 BEFORE UPDATE 트리거를 추가했다.

| 트리거 이름 | 대상 테이블 | 동작 |
|-------------|-------------|------|
| `trg_now_spot_ticker_updated_at` | `now_spot_ticker` | BEFORE UPDATE → `NEW.updated_at = NOW()` |
| `trg_now_futures_ticker_updated_at` | `now_futures_ticker` | BEFORE UPDATE → `NEW.updated_at = NOW()` |
| `trg_now_futures_indicator_updated_at` | `now_futures_indicator` | BEFORE UPDATE → `NEW.updated_at = NOW()` |

**공용 트리거 함수**: `set_updated_at_now()` (`plpgsql`, `NEW.updated_at := NOW(); RETURN NEW;`).

**영향**:
- Supabase Realtime 구독자 + M1.4 카드 "몇 초 전 업데이트" 뱃지 + `WHERE updated_at > now() - 'N seconds'` 신선도 필터가 이제 모두 정확하게 작동.
- `_history_*` 테이블은 INSERT only이므로 영향 없음.
- 확장 루프에서 새 `_now_*` 테이블을 추가할 때 반드시 동일 패턴의 트리거를 함께 생성할 것.

---

## RLS 정책 inventory (M1 final, 2026-05-20 실측)

Supabase MCP `pg_policies` 조회 결과 **총 16 정책** (M1.6~테마 C Step 1 시점) — anon-read 10 + user-scoped-read 3(로그) + **user-owned-write 3**(user_preferences SELECT/INSERT/UPDATE, M2 테마 C 2026-06-15). **테마 C Step 2 적용 완료 → +4 = 20** (saved_views SELECT/INSERT/UPDATE/DELETE — **라이브 실측 2026-06-18: user_preferences 3 + saved_views 4 = user-owned-write 7정책 확인**). (M1 시점은 13: anon-read 10 + user-scoped 3 + 쓰기 0.)

### anon read 10개 — `qual = true` (공개 시장 데이터)

| 테이블 | 정책 동작 |
|---|---|
| `symbols` | TO `{anon, authenticated}` FOR SELECT USING (true) |
| `now_spot_ticker` | 동일 |
| `now_futures_ticker` | 동일 |
| `now_futures_indicator` | 동일 |
| `history_spot_ticker` | 동일 |
| `history_futures_ticker` | 동일 |
| `history_futures_indicator` | 동일 |
| `history_spot_kline` | 동일 |
| `history_futures_kline` | 동일 |
| `history_futures_liquidation` | 동일 |

**의미**: 시장 데이터 (가격, OI, 펀딩, 청산 이벤트) 는 거래소 사이트에 모두 공개되어 있으므로 anon SELECT 허용. 익명 (비로그인) 사용자도 카드 데이터 조회 가능 — 단 AI 호출은 M1.6 이후 인증 필수.

⚠️ **함정 (M1.4 Step 4.5 사고, 2026-04-22)**: RLS 활성화만 하고 SELECT 정책 0개면 **deny-all** → anon 클라이언트가 "200 OK + 빈 결과" 받음. 가장 디버깅 어려운 패턴 — `pg_policies` 조회로만 발견 가능. CLAUDE.md §위생 #7 에 명문화. 본 anon-read 마이그레이션 (`20260422000001_add_anon_read_policies.sql`) 이 그 사고 직후 추가됨.

### user-scoped 3개 — `qual = (auth.uid() = user_id)` (본인 row 만)

| 테이블 | 정책 동작 |
|---|---|
| `log_validation_failure` | TO `{authenticated}` FOR SELECT USING (auth.uid() = user_id) |
| `log_chat` | 동일 |
| `log_behavior` | 동일 |

**의미**: 로그 테이블은 사용자별 privacy 가 필수. 본인 row 만 SELECT 가능. NULL `user_id` row (`ON DELETE SET NULL` 익명화) 는 `NULL = uid` 가 false 라 자동 차단 — admin 만 별도 policy 로 봄 ([3-48] 류 M1.7 운영도구 시점에 추가).

### user-owned-write 3개 — `(select auth.uid()) = user_id` (M2 테마 C, 2026-06-15)

| 테이블 | 정책 동작 |
|---|---|
| `user_preferences` | TO `{authenticated}` FOR SELECT USING / FOR INSERT WITH CHECK / FOR UPDATE USING+WITH CHECK = `(select auth.uid()) = user_id` |

**의미**: 마켓/로그 테이블과 달리 **유저가 본인 행을 직접 INSERT/UPDATE** 하는 첫 패턴. `WITH CHECK` 가 위장 삽입(남의 user_id 로 삽입) + user_id 바꿔치기를 차단하는 핵심 방어선. DELETE 정책은 없음(계정 삭제 CASCADE 만). `(select ...)` 래핑 = initPlan 캐싱(W-1). 상세 = 위 §사용자 데이터.

### INSERT / UPDATE / DELETE 정책 — 마켓·로그 테이블은 0개 (쓰기 = service_role 전용)

**의미**: `now_*` / `history_*` / `symbols` / `log_*` 의 모든 write 는 **service_role 키 (RLS bypass)** 로만 가능. 클라이언트 (anon / authenticated) 의 직접 write 는 거부. 워커 (Hetzner) 와 `/api/orchestrate` Route Handler 만 service_role 보유 → 위변조 방어선. **예외**: `user_preferences` (위 user-owned-write) 는 유저 본인 INSERT/UPDATE 허용 — 유저 설정은 본인이 직접 써야 하므로 의도된 설계.

---

## 함수 및 트리거

### 1) `set_updated_at_now()` — TRAVIS 코드

```sql
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
```

- **언어**: `plpgsql`
- **보안**: NOT SECURITY DEFINER (호출자 권한)
- **소유**: TRAVIS migration (`20260420000001_add_updated_at_triggers.sql`)
- **사용**: `now_spot_ticker` / `now_futures_ticker` / `now_futures_indicator` 의 BEFORE UPDATE 트리거 3개.
- **존재 이유**: PostgreSQL 의 `DEFAULT NOW()` 는 INSERT 에만 적용 + upsert 의 `ON CONFLICT DO UPDATE` branch 에서는 기존 값을 유지 — 반복 갱신 시 `updated_at` 이 최초 INSERT 시각에 고정되어 신선도 판단 불가. 본 트리거 함수가 BEFORE UPDATE 시점에 `NEW.updated_at := NOW()` 로 덮어써서 정확한 신선도 보장.
- **비전공자용 설명**: 행이 "지금 바뀜" 을 시간 도장으로 자동 찍어주는 도우미. 워커가 같은 코인의 가격을 매초 update 해도, 그 매초가 정확히 시계 도장으로 기록됨. 카드의 "2초 전 업데이트" 뱃지가 이 도장을 읽어서 표시.

### 2) `rls_auto_enable()` — Supabase 자동 설치 (사용자 코드 X)

- **언어**: `plpgsql`
- **보안**: SECURITY DEFINER · `search_path = pg_catalog`
- **호출 컨텍스트**: Event Trigger (CREATE TABLE 같은 DDL 이벤트 발생 시 자동)
- **소유**: Supabase 플랫폼 (사용자가 만든 함수 아님)
- **목적**: `public` 스키마에 새 테이블이 생성되면 자동으로 RLS 를 활성화 — 실수로 RLS 안 켠 채 anon 노출되는 사고 방어망.
- **비전공자용 설명**: "새 테이블 만들면 자동으로 문 잠가 두는" Supabase 의 안전망. 사용자가 명시적으로 SELECT 정책을 만들기 전에는 anon 이 못 봄.
- ⚠️ **Supabase Advisor WARN**: anon / authenticated 가 직접 RPC 호출 가능하다는 경고. **실제 위험은 0** — 본 함수는 event trigger 컨텍스트 (CREATE TABLE 시점) 가 없으면 아무 일도 안 함. anon 이 호출해도 NEW 가 없어 즉시 NULL 반환 / no-op. 그래도 advisor 가 표시하는 이유 = "SECURITY DEFINER + public access" 패턴 자체가 표면적으로 위험해 보이기 때문. 운영 노트: WARN 무시 가능.
- **비전공자용 용어 해설**: **Supabase Advisor** = Supabase 가 자동으로 보안·성능 위험을 표시해주는 lint(점검) 도구 (사람이 손으로 안 봐도 자동 경고). **event trigger** = "CREATE TABLE 같은 DDL 사건이 일어났을 때만 작동" 하는 특수 트리거. **SECURITY DEFINER** = 호출한 사람의 권한이 아니라 "함수를 만든 사람의 권한" 으로 실행됨 — 관리자 권한 도용 위험 패턴이라 advisor 가 경계함.

### 3) 트리거 3개 (M1.3 Step 4 사후 — 2026-04-20 추가)

위 §"트리거" 표 참조. `set_updated_at_now()` 를 호출.

---

## 실시간 (Realtime) 활성화 inventory

Supabase Realtime publication `supabase_realtime` 에 등재된 테이블 = **3개**.

| 테이블 | Realtime | 의도된 설계 사유 |
|---|---|---|
| `now_spot_ticker` | ✅ | 사용자 카드가 매초 가격 / 변화율 실시간 업데이트 필요. |
| `now_futures_ticker` | ✅ | 동일. |
| `now_futures_indicator` | ✅ | 펀딩 / 마크 / OI / LSR 실시간 업데이트 (사이트=DB 일치 #9). |
| `history_*` 6개 | ❌ | INSERT-only append rate 가 높아 broadcast 대상 X. 시계열 조회는 폴링 / on-demand SELECT. |
| `log_*` 3개 | ❌ | 로그는 사용자 본인 dashboard 에서만 조회. 실시간 push 의미 X. |
| `symbols` | ❌ | 변경 빈도 매우 낮음 (1h 주기 reload, `[10-23]` 1단계). manual page refresh 로 충분. |

**비전공자용 설명**: "행이 바뀌면 자동으로 프론트에 알림 보내는" 기능. 실시간 가격 카드처럼 매초 변하는 데이터만 켜고, 청산 로그처럼 분당 수십 건 INSERT 되는 테이블은 끔 (켜면 사용자 브라우저가 알림 폭격 받음).

**다중 거래소 확장 (M2+)**: 새 거래소 추가 시 `now_*` 테이블은 row 만 추가 — Realtime 도 따라옴 (publication 추가 작업 X). 새 도메인 (`now_news_*` 등) 신설 시에만 `ALTER PUBLICATION supabase_realtime ADD TABLE ...` 필요.

---

## 운영 노트 — Migration 히스토리 vs 파일

**2026-05-20 신규 발견**: Supabase MCP `mcp__supabase__list_migrations` 가 `{"migrations":[]}` 빈 배열 반환.

**원인**: 모든 DDL 이 **Supabase Studio SQL Editor 에서 직접 RUN** 됐기 때문. MCP read-only 모드 회피 / 빠른 반복을 위해 사용자가 Dashboard 에서 SQL 을 직접 실행한 결과, Supabase 의 공식 migration 히스토리 테이블 (`supabase_migrations.schema_migrations`) 에는 아무것도 등재되지 않음.

**진실 원천 정공**: `supabase/migrations/*.sql` 파일들 (위 §"마이그레이션 파일" 표 참조).
1. `20260418000001_create_symbols_and_log.sql`
2. `20260418000002_create_now_tables.sql`
3. `20260418000003_create_history_tables.sql`
4. `20260418000004_alter_symbols_add_trading_filters.sql`
5. `20260420000001_add_updated_at_triggers.sql`
6. `20260422000001_add_anon_read_policies.sql`
7. `20260425000001_m1_6_step2_logs.sql`

> ⚠️ 위 1~7 은 **M1 시점 스냅샷**. 이후 M1.8~M2 마이그레이션(`20260531`/`20260604`/`20260611`/`20260613` ×3/`20260615` user_preferences 등)은 위 §"마이그레이션 파일" 표가 단일 진실 원천. 전부 동일하게 Dashboard SQL Editor 직접 RUN (MCP read-only) 방식 유지.

**영향**:
- ✅ M1 현 운영: 0 (실제 DB 에 schema 다 들어있음, 파일이 인증된 history).
- ⚠️ M1.7 / M2 에 **staging branch 신설 시**: Supabase 가 자동으로 migration 을 못 따라옴. 두 가지 옵션:
  - **(A) SQL Editor 수동 RUN**: 7개 파일을 순서대로 staging branch 에 적용. M1 현재 방식 유지.
  - **(B) Supabase CLI 백필**: `supabase migration repair` 로 기존 7개 파일을 history 테이블에 등재 → 이후 `supabase db push` 자동화 가능.

**권고**: M2 진입 시 (B) 백필 1회 진행. 이후 모든 신규 마이그레이션은 `supabase/migrations/` 파일 + CLI push 정공 흐름. 본 docs 만으로는 마이그레이션 적용 안 됨.

---

## TypeScript 타입 동기화 (M1.3 Step 2~)

모든 테이블 타입은 `packages/data-service/src/types/database.generated.ts`에서 **자동 생성**하고, `tables.ts`에서 도메인별 짧은 별칭을 붙입니다(예: `NowFuturesTickerInsert`). **진실 공급원은 언제나 이 문서의 마이그레이션 파일**이고, TS는 거울.

### 마이그레이션 추가 시 워크플로
1. `supabase/migrations/` 아래에 새 SQL 파일 추가(또는 `execute_sql`로 DDL 실행).
2. Supabase MCP: `mcp__supabase__generate_typescript_types` 호출.
3. 반환된 타입을 `packages/data-service/src/types/database.generated.ts`에 **전체 덮어쓰기**.
4. 필요하면 `tables.ts`에 새 테이블용 Row/Insert 별칭 추가(보통 1줄씩).
5. `pnpm -r type-check` → 영향 받는 컬러 자동 탐지.
6. `apps/worker smoke` 재실행으로 회귀 확인.

`database.generated.ts`는 절대 수동 편집 금지 — DB와 어긋나면 배포 후 런타임에 터집니다.

### dataService 경유 규칙 (M1.3 Step 2 확정)
- 모든 Supabase 접근은 `@travis/data-service`의 `IDataService` 계약을 통과합니다.
- `apps/web`·`apps/worker` 런타임 코드에서 `.from('table')` **직접 호출 금지**. 예외: smoke/test 스크립트만 허용(파일 상단에 예외 근거 주석 필수).
- 새 테이블에 대한 읽기/쓰기가 필요해지면 **(1) IDataService에 메서드 시그니처 먼저 선언 → (2) SupabaseDataService에 구현 → (3) consumer에서 호출** 순서. 추측성 메서드 선언 금지(deferred decision).
