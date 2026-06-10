# M2 테마 A — production WS `@arr` 스트림 stall 사고 (수정 코드 완료, 배포 대기)

> **★★ 근본 원인 재규명 (2026-06-10 배포 중 발견, §10)**: 진짜 원인은 "큰 프레임 stall" 이 아니라 **Binance 의 2026-04-23 USDM WS 레거시 URL 폐지** (`fstream.binance.com/ws`·`/stream` → `/market` 경로 이전). §3 의 "큰 프레임" 가설은 결과적으로 오진 — 단 chunked 이전 자체는 여전히 유효·배포 (spot @arr 별개 이슈 + full 승격 + 검증 완료). **수정 = `/market` base URL 1줄 + chunked 이전.**
> **상태**: 🟠 **근본 수정 코드 ✅ 완료 (2026-06-10) / production 배포·검증 대기**. 수정 구현 = §9 + §10. **테마 A Step 3 착수 전 배포 검증(Step 5~6) 필수** (사용자 결정 2026-06-10).
> **단일 진실**: 본 파일 = 사고 전체(증상·증거·근본원인·수정안·결정·수정 구현) 추적처. 발견 맥락 = 테마 A Step 2 라이브 site=DB 검증. 메모리 = `reference_binance_arr_stream_stall.md`(backend-infra-specialist 신설) + `project_m2_themeA_step2.md`.
> **▶ 다음 작업**: §9.5 배포 순서 — production 178.105.38.94 배포 + 서버측 smoke + site=DB 검증(24~48h) → 테마 A Step 2 마무리 → Step 3.

---

## 0. 한 줄 요약 (비전공자용)

> **"바이낸스에서 '전 종목 한 묶음(@arr)'으로 받는 큰 데이터 보따리가 이 서버 연결에서 처음 잠깐만 풀리고 통째로 멈춘다. 그래서 USDM 펀딩·마크·청산이 몇 시간~43일째 옛 값에 얼어붙어 있었다. 잘게 쪼갠 보따리(per-symbol)와 종목 적은 COINM은 멀쩡하다. Step 2에서 만든 지표 카드가 이 잠복 결함을 처음으로 눈에 보이게 했다."**

---

## 1. 발견 경위

테마 A Step 2(IndicatorCard) 배포 후, 사용자가 BTCUSDT funding/OI/LSR 카드를 Binance 사이트와 대조 → **"오묘하게 다르다"** 직감. 진단 결과 **카드는 무결**(DB를 정확히 렌더 + freshness 정직 표시)하고, **DB 자체가 stale**임이 드러남. Step 2의 freshness 라인("UPDATED 4M AGO")과 [10-7] dirty-check가 잠복 결함을 가시화한 것.

---

## 2. 증상 (site=DB 불일치, CLAUDE.md §9 위반)

DB ↔ Binance API 직접 대조 (2026-06-09~10, BTCUSDT):

| Metric | DB (TRAVIS) | Binance 라이브 (`fapi/v1/premiumIndex`) | 판정 |
|---|---|---|---|
| mark_price | 61,387.90 (frozen) | 61,100.40 | ❌ +287 (0.47%) |
| index_price | 61,406.76 (frozen) | 61,115.59 | ❌ frozen |
| predicted_funding_rate | -0.0095% (8h 동일) | +0.0005% | ❌ 부호반전·frozen |
| last_settled_funding_rate | +0.0005% | ≈일치 | ✅ ok (REST) |
| open_interest | 99,574 | 99,686 | ✅ ok (REST 폴링) |
| LSR / taker | 일치 | 일치 | ✅ ok (REST 폴링) |

핵심: `now_futures_indicator`의 `updated_at`은 perSymbolTask(11분)·premiumIndexTask(30분) REST가 계속 올려 **겉보기 살아있음** → 하지만 **markPrice WS가 쓰는 컬럼(mark/index/predicted_funding)만 값이 frozen**. predicted_funding이 8시간+ 소수점 8자리까지 동일 = 1초 WS 값이면 불가능 = 확정 frozen.

---

## 3. 근본 원인 (라이브 ssh 로그로 확정 — 직전 가설 수정)

**최초 가설(틀림)**: "miniTicker는 수신(연결 살아있음), markPrice/forceOrder 스트림만 죽음 → per-stream watchdog 필요."

**라이브 실측으로 확정(맞음)**: **바이낸스 `@arr`(전 종목 배열) 스트림이 이 Hetzner 연결에서 open 직후 짧은 burst만 받고 통째로 stall.** 단발이 아니라 구조적.

증거 (production 워커 `178.105.38.94` ssh, 2026-06-10):
- 5분 status 로그: `WS spot/usdm: connected, lastMsg=138s` **고정**, spot+usdm 매 ~2.5분 `stale 149s → terminate → 재연결` **sawtooth**. coinm `lastMsg=0s` stale 0건.
- **재시작(16:21 UTC, PID 351347) 해도 USDM markPrice 복구 실패** (64s→136s 계속 stale, sawtooth 재현). COINM은 재시작으로 정상.
- **kline relay(chunked per-symbol, 250 streams/conn) stale 0건** (5분) ← 같은 서버·IP·네트워크에서 chunked는 무사고.
- COINM @arr 정상 = 30종뿐 → 작은 프레임 → stall 안 함.
- 리소스 load 0.07 / worker 0% CPU / 59MB RSS → **로컬 backpressure 아님 = 업스트림 대형 단일 프레임 전송 stall**.
- `perMessageDeflate:false` 이미 적용됐으나 미해소.

**메커니즘**: `@arr` 배열 프레임(USDM 608종 = 큰 프레임)이 이 연결에서 전송 중 멈춤. 과거 `[3-50]/[3-52]` "Windows payload-size selective failure"의 **production(Linux Hetzner) 연장선**. 연결단위 watchdog(120s)이 이미 잡아 재연결하지만 **재연결해도 또 stall** → watchdog 촘촘히 해도 주기만 짧아질 뿐 데이터 정상화 안 됨 → **per-stream watchdog는 해법 아님**.

---

## 4. 영향 범위 (전부 `@arr` 소비처)

| 데이터 | 스트림 | 상태 |
|---|---|---|
| USDM mark/index/predicted_funding | `!markPrice@arr@1s` | ❌ frozen (이번 발견) |
| USDM 청산 (history_futures_liquidation) | `!forceOrder@arr` | ❌ **43일 정지** (잠복 대형 누락, 마지막 row 2026-04-27) |
| USDM ticker (now_futures_ticker) | `!miniTicker@arr` / `!ticker@arr` | ⚠️ sawtooth stale 의심 (재연결 직후 sliver만) — **추가 확인 필요** |
| spot ticker (now_spot_ticker) | `!ticker@arr` | ⚠️ 동일 @arr — 영향 확인 필요 (Path A 소비자 별도) |
| COINM 전부 | @arr (30종) | ✅ 정상 |
| kline (spot/usdm) | chunked per-symbol | ✅ 정상 |
| REST 폴링 (OI/LSR/taker/basis/last_settled funding) | REST | ✅ 정상 |

---

## 5. 수정안 (구현 전 승인됨 — "모두 한 번에 근본 수정", 사용자 2026-06-10)

사용자 결정: **테마 A Step 3 착수 전, @arr stall을 근본적으로 모두 한 번에 수정.**

| 옵션 | 내용 | 비고 |
|---|---|---|
| **A (근본)** | `@arr` 소비 스트림(markPrice / ticker / forceOrder)을 **chunked per-symbol 스트림으로 이전** (무사고 `BinanceKlineRelay` 패턴 재사용). `<symbol>@markPrice@1s` 등. 핸들러(normalize)는 payload shape 동일이라 재사용 가능. | 1초 실시간 복원. 신규 relay 배선. **"모두 한 번에"의 핵심** |
| **B (즉효 보조)** | USDM mark/index/predicted_funding을 **batch `premiumIndex` REST 폴링**으로 대체 (전 종목 1콜, weight 낮음, `createPremiumIndexTask` 확장). | ~3-5초 freshness. funding/mark엔 충분. A 완성 전 즉효 완화로 병용 가능 |
| forceOrder/청산 | per-symbol chunk 또는 별도 (sparse라 청크 OK) | 43일 gap 복구 |
| **watchdog 보강** | per-stream watchdog는 이번 해법은 아니나, 향후 단일스트림 사망 대비 **보조 방어선**으로 가치. chunked 이전과 병행/후속 | code-reviewer 보조 |

**범위 결정 필요** (next 세션 roadmap 분해 입력): A를 어디까지(markPrice만 vs ticker·forceOrder 포함 전부), B 병용 여부, spot ticker @arr 처리, COINM은 현행 유지(정상). 검증 = 각 스트림 freshness + site=DB 소수점 일치(BTCUSDT funding/mark + 청산 재개).

---

## 6. 운영 사실 (production 워커 178.105.38.94)

- 서비스: systemd `travis-worker.service`, `Restart=always`, `EnvironmentFile=/etc/travis/worker.env`. **재시작됨 2026-06-10 16:21 UTC (PID 351347)** — crash 0, 1주 2일 무재시작이던 것.
- 코드: `/opt/travis` git repo `main` rev **`c35af01` (2026-05-31)** — production 워커 코드는 5/31자 (Step 2는 frontend/Vercel이라 워커 무관, 단 **워커 수정 배포 시 이 repo에 deploy 필요**). `git config --global --add safe.directory /opt/travis` 적용.
- ⚠️ **`TimeoutStopSec` 미설정** (collector 서버엔 `[8-31]`ⓑ 30s 적용됐으나 production은 미동기화) — 워커 배포 시 동기화 고려.
- ssh 3중 인용 함정 주의 (메모리: printf \n 금지 echo 사용, grep 파이프 큰따옴표 소실).

---

## 7. 현재 상태 / 잔여

- **🔴 블록킹**: USDM markPrice/predicted_funding (WS) + USDM 청산(forceOrder) frozen. → 본 사고 근본 수정이 테마 A Step 2 마무리 + Step 3 착수의 선결.
- **현 가동**: 워커 안정(crash 0). COINM 전부 / kline / REST 폴링(OI·LSR·taker·basis·last_settled funding) 정상. USDM의 mark·index·predicted_funding·청산만 결함.
- **Step 2 코드**: ✅ 완료·push(commit `1f9f448`). 카드 자체 무결. 데이터 정확도(site=DB)만 본 사고로 보류.
- deferred: `[10-11]` (본 사고, 🔴 블록킹).

---

## 8. 다음 세션 재개 순서 (사용자 지정) — §9 수정 구현으로 1~3 완료

1. ~~본 파일 + 메모리 읽기~~ ✅
2. ~~`@roadmap-milestone-manager` step 분해~~ ✅ (6-step plan, 2026-06-10 사용자 승인)
3. ~~구현~~ ✅ (§9 — 코드 완료, 커밋 후 배포 대기)
4. **검증**: 각 @arr 스트림 freshness 1~수초 + BTCUSDT funding/mark site=DB 소수점 일치 + USDM 청산 재개 (DB SELECT). ← **다음**
5. 테마 A **Step 2 마무리** (IndicatorCard 라이브 site=DB G2 육안 통과 선언).
6. 테마 A **Step 3** (IndicatorListCard).

---

## 9. 근본 수정 구현 (2026-06-10, plan 승인 후 Step 1~4 완료)

### 9.1 사용자 확정 (2026-06-10)
- §5 의 "범위 결정 필요" 3건 확정: **USDM ticker mini→full 17필드 승격** (`[3-50]` 회수) / **옵션 B(즉효 REST 완화) 생략** / spot ticker 포함·COINM @arr 잔류 ("모두 한 번에" 결정에 포함).

### 9.2 아키텍처 (기존 핸들러 무변경이 설계 핵심)
```
BinanceChunkedRelay (per-symbol, 250 streams/conn — 무사고 kline relay 패턴 일반화)
  → StreamCoalescer (per-symbol 단건을 1초 모아 기존 @arr 배열 모양으로 재조립,
                     synthetic stream name "!ticker@arr"/"!markPrice@arr@1s" 로 라우팅)
  → StreamRouter → 기존 핸들러 4종 (무변경) → dataService upsert
```
- **USDM**: `@ticker`(full) + `@markPrice@1s` + `@forceOrder` × 608심볼 = 1,824 streams ≈ 8연결. 심볼당 suffix **인접 배치** → 모든 chunk 에 markPrice@1s(1초 push) 포함 = 연결 생존 신호 → sparse 한 forceOrder 의 watchdog 오발동 구조적 방지 (테스트로 박제).
- **spot**: `@ticker`(full 21필드) × 1,408 ≈ 6연결.
- **COINM**: `BinanceWsRelay` @arr 3종 잔류 (변경 0).
- **forceOrder**: 기존 핸들러 계약도 단건 객체 → coalescer passthrough (배칭 없음).
- 코얼레싱이 mixed-batch 불변 + 동시 upsert deadlock 금지 + preCompute push 순서 메모리 규율을 자동 보존 (핸들러 무변경이므로).

### 9.3 산출물
- ➕ `apps/worker/src/ws-relay/BinanceChunkedRelay.ts` (+ `buildPerSymbolStreams`/`chunkStreams` 순수 헬퍼)
- ➕ `apps/worker/src/ws-relay/streamCoalescer.ts` (generic rule 기반 — 새 스트림 = rule 1줄)
- ✏️ `apps/worker/src/ws-relay/streams/tickerWsHandler.ts` (canHandle: usdm 도 `!ticker@arr` full, coinm 만 mini)
- ✏️ `apps/worker/src/index.ts` (WS_SUBSCRIPTIONS spot/usdm 비움 + CHUNKED_STREAM_SUFFIXES + COALESCER_RULES + 생성/시작/CHK status 로그/shutdown 배선)
- ✏️ `apps/worker/src/ws-relay/index.ts` (배럴)
- ➕ 테스트 27: `streamCoalescer.test.ts`(10 — shape 동등성·dedupe·passthrough·graceful) / `BinanceChunkedRelay.test.ts`(6 — 조합·chunk·생존신호·backoff) / `tickerWsHandler.test.ts`(11 — canHandle 매트릭스·full 매핑·allowlist)
- ➕ `apps/worker/src/scripts/smokeArrMigration.ts` (read-only 라이브 smoke)

### 9.4 검증 (코드 게이트)
- `pnpm -r type-check` 6패키지 green / worker lint green / worker **161 test PASS** (기존 134 + 신규 27, 회귀 0).
- **로컬 라이브 smoke**: SPOT per-symbol `@ticker` 실증 — median **1022ms**, 23키(`b/B/a/A` 포함 full). USDM fstream 은 로컬 Windows 의 알려진 침묵 증상으로 측정 불가 → **서버측 smoke 를 배포 게이트로 이월** (ticker 주기 1000/2000ms + markPrice `ap` 필드 확정. 단 markPrice normalize 는 `s/p/i/P/r/T` 만 읽어 `ap` 유무 무관 — code-reviewer 확인).
- **code-reviewer: Critical 0.** W1(COALESCER_RULES 타입 명시) 즉시 반영. W2+W4 → deferred `[10-12]` (relay 3중복 + rule 선형 탐색). W3 → deferred `[10-13]` (spot 저유동성 chunk watchdog 관측). S6(shutdown flush race — 기존 @arr 와 동일한 1초 미세 유실) 인지만.
- crypto-domain-expert 사전 검증 (2026-06-10): per-symbol payload = @arr 원소 동일 (공식 docs URL 코드 주석 인라인).

### 9.4b 데이터 위생 9항목 체크 (CLAUDE.md 의무)
1. lifecycle status: 기존 TRADING allowlist 유지 (구독 대상 = loadAllSymbols TRADING, 변경 0) ✅
2. REST+WS allowlist: tickerWsHandler/markPriceWsHandler 의 allowlist 필터 무변경 경유 ✅
3. 주기 재로드: allowlist Set swap 24h 유지. chunked 구독 심볼은 부트 스냅샷 (kline relay 와 동일 정책 — 신규상장 반영은 재시작, 한계 명시) ✅
4. stale row 정리: 변경 없음 (기존 정책 유지) ✅
5. 극단값 guard: 계산식 무변경 ✅
6. 워밍업 가드: preCompute 경로 무변경 ✅
7. RLS: DB 변경 0 ✅
8. 공식 문서 주석: BinanceChunkedRelay/tickerWsHandler 에 URL+조회일자(2026-06-10) 인라인 ✅
9. site=DB: **배포 후 검증이 본 수정의 종료 게이트** (BTCUSDT funding/mark 소수점 일치 + 청산 재개) — §9.5

### 9.5 배포 순서 (Step 5, 다음 작업) — §10 의 /market 수정 포함 후 진행
1. commit + push (main) → production `178.105.38.94` ssh → `/opt/travis` git pull + pnpm install.
2. **systemd 재시작 전 서버측 smoke**: `pnpm -F @travis/worker exec tsx src/scripts/smokeArrMigration.ts` — USDM ticker 주기 + markPrice `ap` + forceOrder sparse + 다중 연결 확정 (Step 1 이월분).
3. `travis-worker.service` 에 `TimeoutStopSec=30` 동기화 ([8-31]ⓑ collector 와 정합) → restart.
4. 검증: 부팅 로그 (COINM=@arr 1연결 / CHK usdm 8·spot 6연결) → 5분 status `maxSilence` 수초 유지 + sawtooth 소멸 → DB SELECT (mark_price/predicted_funding 갱신 + `history_futures_liquidation` 신규 INSERT) → **BTCUSDT site=DB 소수점 일치** (비교 URL + 수치 기록).
5. 24~48h: NRestarts=0 / -1003 ban 0 / DB 무구멍 / USDM ticker 24h 컬럼 NULL 0% (full 승격 실증) / `[10-13]` spot maxSilence 관측.
6. 통과 시 → Step 6 (테마 A Step 2 마무리 선언 + `[10-11]`/`[3-50]` 묘비 + ticker24hrBatchTask 제거·하향 판단).

---

## 10. ★ 근본 원인 재규명 — Binance USDM WS 레거시 URL 폐지 (2026-06-10, 배포 게이트 중 발견)

### 10.1 발견 경위 (서버측 smoke 게이트가 잡아냄)
배포 전 서버측 smoke 에서 **production 서버조차 fstream per-symbol 신규 연결이 메시지 0건** (SPOT 은 정확히 1000ms 정상). "로컬 Windows 환경 탓" 가설 즉시 기각 → 정밀 진단(`smokeFstreamDiag.ts`):
- 레거시 `fstream.binance.com` 의 `/ws`·`/stream` 어느 방식이든 (raw 단일 / combined / **SUBSCRIBE 메시지** 까지) **구독 ACK·`LIST_SUBSCRIPTIONS` 등록은 정상인데 데이터 프레임 0건** — 로컬(한국 가정망)과 production(독일 Hetzner) 동일.
- dstream(COINM) 은 완벽 (1초 29프레임). fstream3 은 302 (사망).

### 10.2 근본 원인 (공식 공지)
**Binance 가 2026-04-23 에 USDM 레거시 WS URL 을 폐지**하고 카테고리 경로로 이전:
- 공지: `developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/Important-WebSocket-Change-Notice` (2026-06-10 조회) — "Legacy URLs will remain available until 2026-04-23, after which they will be permanently decommissioned... connections not migrated will ONLY be able to receive data from public endpoint."
- 분류 (공식 Excerpt): ticker/miniTicker/markPrice/forceOrder/kline/aggTrade → **`/market`** / bookTicker/depth → `/public`.
- **COIN-M(dstream) 은 동일 공지 없음 (404, 2026-06-10)** → 레거시 유지 = "COINM 만 멀쩡" 미스터리 해소.

### 10.3 타임라인 재해석 (기존 진단의 정정)
| 사건 | 기존 진단 | 재규명 |
|---|---|---|
| 4/27 청산(forceOrder) 정지 | 잠복 누락 | **폐지일(4/23) 직후 brownout 1단계** |
| 4/28 "Windows payload-size selective failure" ([3-50]/[3-52]) | Windows+압축+큰 프레임 | **상당 부분 폐지 brownout 오진 가능성** (COINM 정상 = dstream 미폐지와 정합). 단 spot(미폐지 호스트) @arr 실패는 별개 — 큰 프레임 가설 잔존 |
| 6/9~10 markPrice frozen + sawtooth | @arr 큰 프레임 stall | **brownout 진행 단계** (제어 채널 정상·데이터만 차단) |
| 기존 kline 연결 생존 | chunked 라 무사고 | **grandfathered 레거시 연결** — 24h 강제 단절 시 사망 예정이었음 (긴급성 근거) |

### 10.4 수정 (코드 1줄 + 검증)
- `types.ts` `BINANCE_WS_BASE.futures_usdm` → **`wss://fstream.binance.com/market`** (chunked relay + usdm kline relay 가 같은 상수를 쓰므로 한 곳 수정으로 전 소비처 이전). COINM dstream/spot 불변.
- 회귀 방어선: `BinanceWsRelay.test.ts` 의 endpoint 단언을 `/market` 으로 갱신 (레거시 회귀 시 테스트 실패).
- **검증 (로컬, 2026-06-10)**: 레거시 0 frames ↔ **`/market` 95 frames/30s**. smokeArrMigration 완결 — markPrice `ap` 포함 9필드 ✅ / **USDM per-symbol ticker 주기 = 2003ms 확정** (문서 충돌 해소, 코얼레서 1초 flush 라 설계 영향 0, 심볼당 2초 갱신) / 다중 연결 ✅.

### 10.5 chunked 이전은 그대로 유효한가? — Yes
/market 이전만으로 @arr 도 살아나지만 chunked 유지 결정: ① spot @arr sawtooth 는 폐지 공지가 없는 호스트에서 발생 = 별개 결함 가능성 (큰 프레임 가설 잔존) ② USDM full 승격 + 연결당 blast radius 축소 ③ 리뷰·테스트 완료 자산. 잔여 모니터링: dstream/spot 의 향후 동일 공지 여부 (deferred 등재).
