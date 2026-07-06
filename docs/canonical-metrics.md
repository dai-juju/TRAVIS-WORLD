# TRAVIS Canonical Metrics — 거래소별 지표 정의 + 단위 + 정밀도 단일 진실 원천

> **신설**: 2026-05-26 (M1.8 §8.5-c)
> **목적**: 사용자(트레이더)가 거래소 공식 웹사이트에서 직접 보는 모든 지표가 TRAVIS 의 DB / 카드 / AI 응답과 **완전히 일치** 하는 것을 보장하는 영구 reference. CLAUDE.md §데이터 위생 #9 (사이트 = DB 진실 일치 원칙) 의 종단 docs.
> **owner**: `@crypto-domain-expert` (사용자 D5 결정 — 신규 서브에이전트 신설 대신 기존 description 강화 + 메모리 신설). 갱신은 `@crypto-domain-expert` 자문 후.
> **확장 예정**: M2 단계에서 OKX / Bybit / Bitget / CoinGlass 추가 시 §3 거래소별 매핑 표 점진 확장.

---

## 0. 한 줄 요약 (비전공자용)

> **"거래소 사이트에 X 라고 표시되는 모든 숫자가 TRAVIS 카드에도 정확히 같은 X 라고 표시되도록 단위·소수점·라벨 규칙을 한 곳에 모은 docs. M2 에서 새 카드/거래소 만들 때 이 docs 한 번 보면 끝."**

---

## 1. 사이트 = DB 진실 일치 원칙 (CLAUDE.md §9 인용)

> 사용자(트레이더)가 거래소 공식 웹사이트(현재 Binance, 미래 OKX/Bybit/Bitget/CoinGlass 등)에서 직접 보는 모든 데이터가 TRAVIS 의 DB / 카드 / AI 응답과 **완전히 일치해야 함**.

본 docs 의 모든 metric 정의는 이 원칙의 구체화. 한 줄로:
- **카드 표시값 ↔ 거래소 사이트 표시값** 1:1 일치
- **단위 일치** (% / decimal / BTC / contracts / USDT)
- **정밀도 일치** (소수 N자리, 거래소 사이트와 동일)
- **interval 라벨 일치** (`(4h)` / `(8h)` 같은 코인별 분기)

---

## 2. 8 Metric 정의 + 표시 헬퍼 매핑

### 2.1 Funding Rate — Predicted vs Realized (D8 + D15 정합)

★ M1.8 §8.0 자문 + WebFetch spike (2026-05-26) 로 입증된 **두 별개 metric**:

| 영역 | Predicted Next | Realized Last Settled |
|---|---|---|
| **의미** | 다음 정산 시점에 적용될 예상 funding rate | 이전 정산에서 실제 적용된 funding rate |
| **거동** | 1초마다 변동 (mark price - index price premium 의 실시간 가중평균) | 정산 직후 4h(또는 8h) 동안 고정 |
| **Source** | WS `!markPrice@arr@1s` 의 `r` 필드 | REST `/fapi/v1/premiumIndex.lastFundingRate` |
| **DB 컬럼** | `now_futures_indicator.predicted_funding_rate` | `now_futures_indicator.last_settled_funding_rate` |
| **DB 단위** | raw decimal (예: `-0.0000403` = `-0.00403%`) | 동일 |
| **카드 표시** | `formatFundingRate(value, intervalHours)` — **percent 소수 5자리** (2026-06-10 사용자 실측: 사이트 `-0.00403%` vs 기존 4자리 `-0.0040%` 불일치 → 5자리 상향) | 동일 헬퍼, 다른 입력 |
| **사이트 위치** | Binance USDM 페이지 우상단 "Funding / Countdown" 박스의 **큰 숫자** | Historical Funding 페이지 또는 별도 위젯 |
| **포맷 출력** | `"-0.00403% (4h)"` | `"+0.00700% (8h)"` |

> **interval 라벨 (1h/4h/8h) 카드 주입 경로 ([10-9] 회수, 2026-06-10)**: `useSymbolMeta` 훅이 `symbols_meta` datasource (table=`symbols`) 1회 조회 → `funding_interval_hours`/`tick_size`/`base_asset`/`quote_asset` 를 IndicatorCard descriptor 에 주입. Binance 가 코인별 주기를 변경(1h 포함)해도 fundingInfoTask 1h 동기화 (2026-06-10 24h→1h 단축) → DB 값 그대로 표시 (하드코딩 0). 메타 조회 실패 시 라벨 생략 fallback (오라벨보다 무라벨).

**Last Settled Funding Time 매핑 (D15)**:
- premiumIndex 응답에 직접 필드 없음 — `nextFundingTime - fundingIntervalHours × 3600 × 1000` 역산
- DB 컬럼: `now_futures_indicator.last_settled_funding_time` (BIGINT, epoch ms)
- 카드 표시: `formatCountdown(nextFundingTime)` 의 역방향 (이미 지난 시간) — 또는 `new Date(last_settled_funding_time).toLocaleString()`

**Funding Interval Identification (D9 + D13)**:
- Source: REST `/fapi/v1/fundingInfo` — 4h 코인만 등재 (default 8h 는 응답 미등재 = negative-space 정의)
- DB 컬럼: `symbols.funding_interval_hours` (SMALLINT, 4 또는 8, NULL = SPOT 또는 미등재 → 8h fallback)
- in-memory Map cache (`fundingInfoTask` 1h reload — 2026-06-10 24h→1h 단축)
- 카드 라벨: `(4h)` / `(8h)` 자동 부착 (formatFundingRate 의 두 번째 인자)

### 2.2 Open Interest

| 영역 | USDM | COINM (deferred `[8-3]` M1.9) |
|---|---|---|
| **의미** | 미결제약정 수량 | 동일 |
| **DB 컬럼** | `now_futures_indicator.open_interest` | 동일 (별도 row, market_type 분기) |
| **DB 단위** | **base asset 수량** (BTCUSDT → BTC 수량) | **contract count** (BTCUSD_PERP → contracts, 1 contract = $100) |
| **카드 표시** | `formatOI(value, "futures_usdm", baseAsset)` | `formatOI(value, "futures_coinm")` |
| **사이트 위치** | USDM 페이지 "Open Interest" 위젯 | COINM 페이지 동일 |
| **포맷 출력** | `"123.45 BTC"` | `"1,234 contracts"` |

USD 환산 컬럼 (`open_interest_usd`) 은 deferred — M2+ 영역.

### 2.3 Top Trader Long/Short Ratio by Accounts vs Positions (D5+D6 정합)

| 영역 | Accounts | Positions | Global |
|---|---|---|---|
| **정의 (verbatim)** | "상위 20% (margin balance 기준) 계정의 **계정수** 비율" | "상위 20% 계정의 **포지션 노출** 비율" | "**전체** 계정의 계정수 비율 (상위 20% 제한 X)" |
| **자본 가중** | ❌ (1 계정 = 1 카운트) | ✅ (포지션 크기) | ❌ |
| **Source endpoint** | `/futures/data/topLongShortAccountRatio` | `/futures/data/topLongShortPositionRatio` | `/futures/data/globalLongShortAccountRatio` |
| **응답 필드** (동일 — 의미 다름) | `longAccount` / `shortAccount` / `longShortRatio` | 동일 | 동일 |
| **DB 컬럼** | `top_long_account` / `top_short_account` / `top_ls_ratio_accounts` | `top_long_position` / `top_short_position` / `top_ls_ratio_positions` | `global_long_account` / `global_short_account` / `global_ls_ratio` |
| **카드 표시 (ratio)** | `formatLSR(ratio)` → `"1.1322"` | 동일 헬퍼 | 동일 |
| **사이트 위치** | "Top Trader Long/Short Ratio (Accounts)" 위젯 | "Top Trader Long/Short Ratio (Positions)" 위젯 | "Long/Short Ratio (All Traders)" 위젯 |

**트레이딩 의미 (advisory)**:
- 셋 다 동시 표시 = 가장 신호 강함 (큰손 의도 vs 군중 심리 vs 자본 가중 분리)
- Top Positions = 자본 가중 → 큰손 의도
- Top Accounts = 머리수 → 상위 트레이더 그룹 합의
- Global = 전체 → 군중 심리

### 2.4 Taker Buy/Sell Volume

| 영역 | 정의 |
|---|---|
| **의미** | 시장가 체결을 매수(taker buy) vs 매도(taker sell) 거래량 기준 비율 — **순간 체결 방향** 신호 |
| **Source** | `/futures/data/takerlongshortRatio` |
| **DB 컬럼** | `taker_buy_sell_ratio` / `taker_buy_vol` / `taker_sell_vol` |
| **단위** | ratio (decimal) + 거래량 (contracts) |
| **카드 표시** | ratio = `formatLSR(ratio)` (LSR 패턴, 1.0 중립선). buy/sell 거래량 = `formatAmount(vol)` (M2 테마 A Step 2 신설 — 라벨 없는 천단위 콤마 수량 헬퍼) |
| **사이트 위치** | "Taker Buy/Sell Volume" 위젯 |

### 2.5 Basis / Basis Rate / Annualized Basis Rate (D16 정합)

| 영역 | Basis | Basis Rate | Annualized Basis Rate |
|---|---|---|---|
| **공식** | `futuresPrice - indexPrice` | `basis / indexPrice` | docs 침묵 (PERPETUAL 환경) |
| **DB 단위** | USD 절대값 | decimal (예: `-0.0006` = `-0.06%`) | decimal **but `""` 빈 문자열 → null 변환** |
| **DB 컬럼** | `basis` | `basis_rate` | `annualized_basis_rate` |
| **카드 표시** | `formatBasis(value, quote)` | `formatBasisRate(raw)` | **카드 노출 X** (D16 + WebFetch spike: PERPETUAL 빈 문자열 = Binance 의도적 비움) |
| **포맷 출력** | `"-35.68 USDT"` | `"-0.0600%"` | (DB 저장만) |
| **사이트 위치** | 차트 Basis 위젯 (있을 시) | 동일 | — |

### 2.6 Mark Price / Index Price / Estimated Settle Price (D11 정합)

| 영역 | Mark Price | Index Price | Estimated Settle Price |
|---|---|---|---|
| **의미** | funding/liquidation 기준가 (premium index + interest rate 가중) | 현물 바스켓 가중평균 (oracle) | 추정 정산가 |
| **DB 컬럼** | `mark_price` | `index_price` | `estimated_settle_price` |
| **카드 표시** | `formatPrice(value, tickSize)` | 동일 | **USDM 카드 hide** (D11: 인도 1h 전에만 유의미, USDM PERPETUAL 무의미) |
| **사이트 위치** | "Mark Price" 위젯 | "Index Price" 위젯 | COINM 인도 직전만 |

### 2.7 24h Ticker (Price / Volume / Change)

| 영역 | last_price | price_change_pct | volume / quote_volume |
|---|---|---|---|
| **DB 컬럼** | `last_price` | `price_change_pct` (이미 percent 단위, raw decimal 아님) | `volume` (base) / `quote_volume` (quote) |
| **카드 표시** | `formatPrice(value, tickSize)` | `formatPct(value)` | (TRAVIS 미정 — M2 카드 신설 시) |

### 2.8 Countdown (다음 정산까지)

| 영역 | Countdown |
|---|---|
| **Source** | `next_funding_time` (epoch ms) — DB 컬럼 또는 WS `markPriceUpdate.T` |
| **카드 표시** | `formatCountdown(nextFundingTime)` |
| **포맷 출력** | `"2h 14m"` / `"2m 30s"` / `"now"` |
| **사이트 위치** | USDM 페이지 우상단 funding(4h)/Countdown 박스의 카운트다운 |

---

## 3. 거래소별 매핑 표

### 3.1 Binance USDM (M1.8 시점 — 본 마일스톤 cover)

| Metric | source (REST/WS) | DB 컬럼 | 단위 | 채움 task |
|---|---|---|---|---|
| Mark Price | WS `!markPrice@arr@1s.p` | `mark_price` | USD, tickSize | markPriceWsHandler |
| Index Price | WS `!markPrice@arr@1s.i` | `index_price` | USD | 동일 |
| Predicted Funding | WS `!markPrice@arr@1s.r` | `predicted_funding_rate` | raw decimal | 동일 |
| Realized Funding | REST `/fapi/v1/premiumIndex.lastFundingRate` | `last_settled_funding_rate` | raw decimal | premiumIndexTask (30분) |
| Last Settled Time | 역산 (`nextFundingTime - intervalHours × 3600 × 1000`) | `last_settled_funding_time` | epoch ms | premiumIndexTask |
| Interest Rate | REST `/fapi/v1/premiumIndex.interestRate` | `interest_rate` | decimal | premiumIndexTask |
| Funding Interval | REST `/fapi/v1/fundingInfo.fundingIntervalHours` | `symbols.funding_interval_hours` | 4 또는 8 | fundingInfoTask (24h) |
| Open Interest | REST `/fapi/v1/openInterest.openInterest` | `open_interest` | base asset 수량 | perSymbolTask |
| Top LSR Accounts | REST `/futures/data/topLongShortAccountRatio` | `top_long_account` / `top_short_account` / `top_ls_ratio_accounts` | ratio | perSymbolTask |
| Top LSR Positions | REST `/futures/data/topLongShortPositionRatio` | `top_long_position` / `top_short_position` / `top_ls_ratio_positions` | ratio | perSymbolTask (M1.8 §8.2a-2 신설) |
| Global LSR | REST `/futures/data/globalLongShortAccountRatio` | `global_long_account` / `global_short_account` / `global_ls_ratio` | ratio | perSymbolTask (M1.8 §8.2a-2 신설) |
| Taker Buy/Sell | REST `/futures/data/takerlongshortRatio` | `taker_buy_sell_ratio` / `taker_buy_vol` / `taker_sell_vol` | ratio + contracts | perSymbolTask |
| Basis | REST `/futures/data/basis` (pair 필수, contractType=PERPETUAL, period=1h) | `basis` | USD 절대값 | perSymbolTask (M1.8 §8.2a-2 신설) |
| Basis Rate | 동일 응답 | `basis_rate` | decimal | 동일 |
| Annualized Basis Rate | 동일 응답 (PERPETUAL 환경 빈 문자열) | `annualized_basis_rate` | null | 동일 (DB 저장만, 카드 노출 X) |

### 3.1.1 Binance USDM **history** (M1.8.5 시점 — 시계열 backfill, 2026-05-31 신설)

`history_futures_indicator` 의 시계열 영역. `now_futures_indicator` 보다 **leaner** — long/short account 분해 컬럼 없이 ratio 3종 + taker 3종 + basis 3종 + open_interest 만 보유. 9 interval (5m/15m/30m/1h/2h/4h/6h/12h/1d) × 6 metric. 채움 = M1.8.5 Step 4 `historyBackfillTask` (실 backfill).

| Metric | source (REST) | DB 컬럼 | 단위 | normalize |
|---|---|---|---|---|
| Open Interest 시계열 | `/futures/data/openInterestHist` (sumOpenInterest) | `open_interest` | base asset 수량 | `normalizeUsdmOpenInterestHist` |
| Top LSR Accounts 시계열 | `/futures/data/topLongShortAccountRatio` | `top_ls_ratio_accounts` | ratio | `normalizeUsdmTopLongShortAccountHist` |
| Top LSR Positions 시계열 | `/futures/data/topLongShortPositionRatio` | `top_ls_ratio_positions` | ratio | `normalizeUsdmTopLongShortPositionHist` |
| Global LSR 시계열 | `/futures/data/globalLongShortAccountRatio` | `global_ls_ratio` | ratio | `normalizeUsdmGlobalLongShortHist` |
| Taker Buy/Sell 시계열 | `/futures/data/takerlongshortRatio` (★ symbol 없음, 주입) | `taker_buy_sell_ratio`/`taker_buy_vol`/`taker_sell_vol` | ratio + vol | `normalizeUsdmTakerLongShortHist` |
| Basis 시계열 | `/futures/data/basis` (★ pair, contractType=PERPETUAL) | `basis`/`basis_rate`/`annualized_basis_rate` | USD/decimal/null | `normalizeUsdmBasisHist` |

**공통 제약** (crypto-domain-expert 자문 2026-05-31, live smoke 실측): weight 0 / IP 1000 req/5min / limit 최대 **500** / 데이터 최근 30일. 5m 14일=4032행 → 9 페이지 분할.

> **★ basis `-1003` 메커니즘 확정 (2026-06-06, crypto-domain + 라이브 smoke)**: 통계 5종(OI/LSR/taker)은 위 'IP 1000 req/5min' 카운터지만 **`/futures/data/basis` 는 예외**. fapi basis **weight=0**(`X-MBX-USED-WEIGHT-1M` 헤더 미반환으로 입증)이라 우리가 한도에 기여하는 양이 ≈0인데, `-1003 "2400 requests per minute"` 의 2400 은 raw 요청 수가 아니라 **REQUEST_WEIGHT 풀**(fapi exchangeInfo 에 RAW_REQUESTS 한도 부재). 에러 메시지의 `10.119.x.x` 는 RFC1918 사설=**Binance 내부 LB 노드**(우리 공인 IP 아님, 매 에러 가변). → **basis -1003 = 그 순간 우리를 받은 Binance LB 노드 weight 풀이 타 트래픽 합산으로 순간 포화. 우리 위반 아님(basis weight 0), 폴링 측 한도 조정으로 근절 불가 — graceful backoff 가 흡수(데이터 정확, M1.9 G2 site=DB 소수점 일치로 입증).** 단일 진실 `task-record/M1.9-complete.md §4`.

**recorded_at 매핑**: 각 응답의 `timestamp`(epoch ms) → `recorded_at`(ISO). 자연 키 5축 (exchange, market_type, symbol, interval, recorded_at) 의 한 축. timestamp 이상 시 row 폐기 (now() 오염 차단).

**Sanity guard 범위** (위생 #5, `normalize/historyFutures.ts`):

| metric | 가드 | 동작 |
|---|---|---|
| open_interest | `sumOpenInterest ≤ 0` | → null (행 유지) |
| LSR 3종 | `longShortRatio < 0.1 또는 > maxRatio` (USDM 10 / **COINM 20**) | → console.warn (값 저장). ✅ **`[8-34]` 회수 (2026-06-07)**: COINM 저유동 심볼(SUIUSD/FILUSD)은 실제 LSR 8~12 가 정상(저유동 long 편향, dapi 대조 확정)이라 상한 10 이 false positive(라이브 27h 로그의 ~40%) → `warnIfRatioOutOfRange(label, symbol, ratio, maxRatio=10)` 파라미터화, COINM 3 호출부는 `COINM_MAX_LSR=20` 전달. 하한 0.1 은 공통. |
| basis_rate | `\|raw\| > 0.05 (±5%)` | → console.warn (값 저장) |
| basis | `futuresPrice ≤ 0 또는 indexPrice ≤ 0` | → row 폐기 (null) |
| 전체 | `timestamp ≤ 0 또는 누락` | → row 폐기 (recorded_at 유도 불가) |

### 3.2 Binance COINM (✅ `[8-3]` 회수 — M1.9 forward-fill 가동 2026-06-06)

USDM 동일 패턴 + 단위 차이 (M1.9 라이브 site=DB 입증: BTCUSD_PERP 18셀 + SUIUSD 6셀 dapi 소수점 일치):
- `volume` = contract count (NOT base asset)
- `quote_volume` 없음 / `base_volume` 별도 컬럼
- `open_interest` = **contract count** (BTCUSD_PERP 10.8M contract vs base 17.8K BTC — DB 는 contract 저장 = dapi `sumOpenInterest`)
- COINM fetcher 6종 (`coinmHistoryFetchers.ts`) = dapi(`dapi.binance.com`) + `pair`+`_PERP` 심볼 규약 + forward-fill `symbolFilter` PERPETUAL **20심볼**(2026-06-07 라이브 실측, 분기물 제외). 단일 진실 `task-record/M1.9-complete.md`.

### 3.3 OKX / Bybit / Bitget (M2+ 거래소 다변화)

**Funding rate 매핑 청사진** (M1.8 §8.0 자문 결과):
- **OKX**: `/api/v5/public/funding-rate.fundingRate` (realized) + `.nextFundingRate` (predicted) — 한 endpoint 두 값
- **Bybit v5**: `tickers.fundingRate` (predicted) + `funding/history` (realized) — 분리
- **Bitget**: `current-fund-rate` (predicted) + `history-fund-rate` (realized) — 분리

**TRAVIS 의 D8 두 컬럼 분리 결정이 4 거래소 공통분모로 작동**.

**Basis / LSR 매핑**: 거래소별 endpoint 다름 — M2 진입 시 자문 + WebFetch spike 후 본 §3 표 확장.

---

## 4. 단위 + 정밀도 표준

### 4.1 가격 (price / mark / index / basis)

| 영역 | 표준 |
|---|---|
| Source | `symbols.tick_size` (예: BTCUSDT = 0.10, DOGEUSDT = 0.00001) |
| 헬퍼 | `formatPrice(value, tickSize)` |
| 미주입 fallback | adaptive (< 1 = 6자리 / < 100 = 4자리 / else 2자리 + 천단위 콤마) |
| 사이트=DB 일치 검증 | Binance USDM BTCUSDT mark price 표시값 ↔ TRAVIS 카드 표시값 ±tickSize 이내 |

### 4.2 수량 (volume / quantity)

| 영역 | 표준 |
|---|---|
| Source | `symbols.step_size` |
| 헬퍼 | `formatOI` (Open Interest) — TRAVIS read-only 라 주문 수량은 미사용 |
| 정밀도 | step_size 기반 또는 천단위 콤마 |

### 4.3 비율 (funding / LSR / basis_rate)

| 영역 | 표준 정밀도 |
|---|---|
| Funding rate | percent 소수 4자리 (예: `0.0100%`) + interval 라벨 `(4h)` / `(8h)` |
| LSR ratio | 소수 4자리 (예: `1.1322`) |
| Basis rate | percent 소수 4자리 |
| 24h price change | percent 소수 2자리 (사이트 표시와 동일) |

### 4.4 시간 (countdown / last settled)

| 영역 | 표준 |
|---|---|
| Countdown | `formatCountdown` 의 적응적 표시 (`Xh Ym` / `Ym Zs` / `now`) |
| Last settled time | `Date(epoch_ms).toLocaleString()` 또는 ISO 8601 |

---

## 5. 사이트 URL × DB 컬럼 매핑 (BTCUSDT 기준)

종단 게이트 (M1.8 §종단) 의 **13 셀 현재 스냅샷** 검증 매트릭스의 단일 진실 원천. Binance USDM BTCUSDT 페이지의 모든 표시 위치 ↔ TRAVIS DB 컬럼 대응. (본 13 행은 모두 `now_futures_indicator` + `symbols` 현재값.)
>
> **63 셀 시계열 검증 ✅ M1.8.5 완료 (2026-06-01)**: 6 metric × 9 interval `history_futures_indicator` backfill (4,098,247 distinct row / 1.5GB) + G1 site=DB 사용자 표본 검증 (BTC/ETH × OI/LSR × 1h "대충 맞아"). 단일 진실: `task-record/M1.8.5-complete.md` + §3.1.1. ⚠️ forward-fill(`[8-26]`) 미구현 → history 정지(05-31 스냅샷).

| # | 사이트 URL / 위치 | metric | DB 컬럼 | 표시 헬퍼 | 검증 방법 |
|---|---|---|---|---|---|
| 1 | https://www.binance.com/en/futures/BTCUSDT 헤더 좌측 | Mark Price | `mark_price` | `formatPrice` | 사이트 = DB ±tickSize |
| 2 | 동일 헤더 | Index Price | `index_price` | 동일 | 동일 |
| 3 | 우상단 박스 라벨 | Funding Interval | `symbols.funding_interval_hours` | (헤더 텍스트) | `(4h)` / `(8h)` 일치 |
| 4 | 우상단 박스 큰 숫자 | Predicted Funding | `predicted_funding_rate` | `formatFundingRate` | 사이트 = `raw × 100`% |
| 5 | 우상단 카운트다운 | Time to next | `next_funding_time` | `formatCountdown` | now → next 시간 일치 |
| 6 | Historical Funding 페이지 | Last Funding | `last_settled_funding_rate` | `formatFundingRate` | 마지막 정산값 일치 |
| 7 | Open Interest 위젯 | Open Interest | `open_interest` | `formatOI` | 사이트 BTC 수량 일치 |
| 8 | LSR 위젯 (Accounts) | Top LSR Acc | `top_ls_ratio_accounts` | `formatLSR` | 사이트 ratio 일치 |
| 9 | LSR 위젯 (Positions) | Top LSR Pos | `top_ls_ratio_positions` | `formatLSR` | 동일 |
| 10 | LSR 위젯 (Global) | Global LSR | `global_ls_ratio` | `formatLSR` | 동일 |
| 11 | LSR 위젯 (Taker) | Taker B/S | `taker_buy_sell_ratio` | `formatLSR` | 동일 |
| 12 | 차트 Basis 위젯 | Basis Rate | `basis_rate` | `formatBasisRate` | 사이트 = `raw × 100`% |
| 13 | 차트 Basis 위젯 | Basis (USD) | `basis` | `formatBasis` | 사이트 = USD 절대값 |

---

## 6. PHAROSUSDT 4h Funding Smoke (D14)

종단 게이트의 4h funding edge case 자동 검증.

**검증 방법**:
```sql
SELECT symbol, market_type, base_asset, funding_interval_hours
FROM symbols
WHERE symbol = 'PHAROSUSDT';
```
**기대**: `funding_interval_hours = 4` (M1.8 §8.0 WebFetch spike 입증) — 단 본 마일스톤 시점 PHAROSUSDT 가 symbols 테이블 미등재 가능성 (syncSymbolsTask 24h reload 후 회수).

**fundingInfoTask 검증**:
```sql
SELECT
  COUNT(*) FILTER (WHERE funding_interval_hours = 4) AS interval_4h,
  COUNT(*) FILTER (WHERE funding_interval_hours = 8) AS interval_8h
FROM symbols
WHERE exchange = 'binance' AND market_type = 'futures_usdm';
```
**기대 (M1.8 §8.4-d hotfix² 적용 후)**: 4h ~411 + 8h ~107 = 약 518 (USDM 712 의 72.7%).

---

## 7. 향후 확장 (M2+)

### 7.1 거래소 다변화 (M2 후보)
- OKX / Bybit / Bitget / Crypto.com / CoinGlass 등
- 본 docs 의 §3 거래소별 매핑 표를 점진 확장
- Funding rate 의 두 컬럼 분리 (D8) 가 4 거래소 공통분모 — 매핑 자연

### 7.2 새 metric 후보 (M2+)
- `open_interest_usd` (USD 환산 컬럼) — `[8-x]` deferred
- Order Book 호가 (`<symbol>@bookTicker` WS) — `[8-6]` deferred
- **Liquidation feed (`!forceOrder@arr` WS)** — 🔄 ff#2 진행 중 (단일 진실 `task-record/M2-pathA-ff2-liquidation.md`). **Canonical 정의 (crypto-domain-expert 자문 확정)**:
  - `side` = 청산 **주문** 방향 → **SELL = 롱 포지션 강제청산 / BUY = 숏 포지션 강제청산** (직관과 반대 — 카드는 LONG/SHORT 라벨로 변환 표시).
  - 표시가 = `ap`(평균 체결가 = 실제 청산가). `p`(주문/파산가)를 청산가로 쓰면 오류. 실제 청산물량 = `z`(누적 체결).
  - **✅ `notional`(USD 명목가) canonical (2026-07-05 `[10-72]` 회수, crypto-domain 라이브 검증)**:
    - **USDM = `z × ap`** → (ap 결측) `z × p` → (z 결측/0) `q × p` — 체결분(z) 우선 원칙.
    - **COINM = `zEff × contractSize`** (인버스 계약 — **가격을 곱하지 않음**. zEff = z>0 ? z : q). contractSize 는 dapi exchangeInfo 동적 조회(하드코딩 금지) — 라이브 실측 BTCUSD_PERP=100 / ETHUSD_PERP=10 USD (2026-07-05).
    - 계산 위치 = 워커 `forceOrderWsHandler`(방송 payload + `history_futures_liquidation.notional` DB 양쪽 동일값 = drift 0). contractSize 미보유/sanity 상한($1B) 초과 → **null**(오산 대신 결측, 위생 #5). NULL = 2026-07 rollout 이전 행.
    - COINM forceOrder `o.s` = dapi exchangeInfo `symbol` verbatim(`BTCUSD_PERP`) → symbols 마스터 allowlist 정확 일치 검증 완료. dated 계약(`BTCUSD_260925`) 청산은 allowlist 에서 **의도적 드롭**(TRAVIS = perpetual 중심).
  - **★ under-report (구조적 한계, 버그 아님)**: `@forceOrder` 는 심볼당 **1초 최대 1건** throttle → **sampled**(전량 아님). "총 청산액" 표방 금지 — 거래소 사이트 합계와 달라도 정상. 고지 방식 = registry description 명시 → AI subtitle 자연어 고지(사용자 결정 2026-07-05, 하드 뱃지 대신 — 라이브 실측: AI 가 "LIVE SAMPLED STREAM (≤1 EVENT/SEC PER SYMBOL)" 자작).
  - **★ CM migration (2026-06-30 발효, ⚡[10-14] 적중)**: Binance UM/CM 아키텍처 통합으로 `!forceOrder@arr` 가 fstream·dstream 양쪽에서 **UM+CM 병합** push + 신규 `st` 필드(1=UM/2=CM)·`ps`. **마켓 판별은 연결 호스트가 아니라 `st` 가 권위** — 워커 2단 가드(st 우선/멤버십 폴백)가 교차 오염·중복(double-count)을 차단. ref: All-Market Liquidation Order Streams + change-log 2026-06-10 (조회 2026-07-06). 다른 dstream @arr 스트림으로의 확대 여부는 `[10-14]` 상시 감시.
- Long/Short Ratio 시계열 (history_futures_indicator 의 9 interval backfill — `[8.3a]` 진행 예정)

### 7.3 자동 site-vs-db consistency probe (M2+)
- Playwright 또는 직접 스크래핑으로 거래소 사이트 위젯값 추출 → DB 컬럼과 ±tickSize 이내 일치 자동 검증
- 정기 실행 (1h 주기) + 실패 시 Slack/Discord 알림
- `[8-1]` deferred — M2 거래소 다변화 시점에 가치 ↑

### 7.4 본 docs 의 갱신 규율
- 새 metric 추가 시: `@crypto-domain-expert` 자문 → §2 정의 추가 + §3 거래소별 매핑 + §4 정밀도 표준 + §5 매트릭스 행 추가
- 새 거래소 추가 시: §3 표 행 추가 + 정의 차이 명시 (예: OKX funding 8h vs Bitget 1h)
- 새 표시 헬퍼 추가 시: `apps/web/lib/format/marketUnits.ts` + `__tests__/marketUnits.test.ts` + 본 docs §2 동시 갱신

---

## 8. 관련 docs

- **CLAUDE.md §데이터 위생 #9** — 사이트 = DB 일치 원칙 (본 docs 의 상위 영구 규율)
- **docs/PRD.md §7 데이터 아키텍처 원칙** — 동일 원칙 명문화
- **docs/Architecture.md §2 사이트=DB 박스** — M1.8 적용 사례 cross-link
- **docs/DB_SCHEMA.md** — 컬럼별 의미 + 채움 경로 표 (now_futures_indicator §컬럼 의미)
- **docs/task-record/M1.8-step0-pre-infra.md §3 Q1~Q11** — 자문 결과 영구 기록
- **docs/task-record/M1.8-step5-market-units-canonical.md** — 본 docs 신설 시점 작업 영구 기록
- **.claude/agent-memory/crypto-domain-expert/CANONICAL_METRICS.md** — agent 메모리의 동일 영역 (M2 거래소 다변화 시 같은 호흡)

---

## 9. 갱신 이력

- **2026-06-09** (M2 테마 A Step 2 — IndicatorCard): registry↔DB 컬럼명 drift 회수. `premium_index` datasource 가 predicted/realized funding 2분리 노출(옛 `last_funding_rate` 제거) + `basis` datasource 신설(table=now_futures_indicator 공유). `formatAmount` 헬퍼 신설(§2.4 taker 거래량). interval(4h/8h) 라벨 + OI baseAsset 라벨은 symbols 조인 필요 → deferred `[10-9]`. IndicatorCard 가 §5 매트릭스의 펀딩/OI/LSR/basis 행을 단일 심볼 카드로 렌더(라이브 site=DB G2 = Vercel 배포 후).
- **2026-05-26** (M1.8 §8.5-c): 신설. Binance USDM 시점 + 7 metric 정의 + 매핑 표. `@crypto-domain-expert` 자문 (M1.8 §8.0) + WebFetch spike (2026-05-26) 결과 영구 기록.
- (예정) M1.9 또는 M2 초반: COINM dapi 매핑 추가 (`[8-3]` 회수 시점).
- (예정) M2 거래소 다변화: §3 OKX/Bybit/Bitget 매핑 표 행 추가.
