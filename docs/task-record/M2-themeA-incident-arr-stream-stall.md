# M2 테마 A — production WS `@arr` 스트림 stall 사고 (진단 완료, 수정 대기)

> **상태**: 🔴 **진단 완료 / 근본 수정 대기** (2026-06-09~10 발견·진단). **테마 A Step 3 착수 전 근본 수정 필수** (사용자 결정 2026-06-10).
> **단일 진실**: 본 파일 = 사고 전체(증상·증거·근본원인·수정안·결정) 추적처. 발견 맥락 = 테마 A Step 2 라이브 site=DB 검증. 메모리 = `reference_binance_arr_stream_stall.md`(backend-infra-specialist 신설) + `project_m2_themeA_step2.md`.
> **▶ /clear 후 다음 첫 작업**: 본 사고 **근본 수정 (모두 한 번에)** → 테마 A Step 2 마무리(site=DB 회복 검증) → 테마 A Step 3. `@roadmap-milestone-manager` step 분해 후 `@backend-infra-specialist` 구현 (사용자 결정).

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

## 8. 다음 세션 재개 순서 (사용자 지정)

1. 본 파일 + `reference_binance_arr_stream_stall.md` + `project_m2_themeA_step2.md` 읽기.
2. `@roadmap-milestone-manager`로 @arr 근본 수정 step 분해 (범위 = §5 결정 필요 항목).
3. `@backend-infra-specialist` 구현 (옵션 A 중심 + 필요 시 B 병용 + watchdog 보강). production 178.105.38.94 배포.
4. **검증**: 각 @arr 스트림 freshness 1~수초 + BTCUSDT funding/mark site=DB 소수점 일치 + USDM 청산 재개 (DB SELECT).
5. 테마 A **Step 2 마무리** (IndicatorCard 라이브 site=DB G2 육안 통과 선언).
6. 테마 A **Step 3** (IndicatorListCard).
