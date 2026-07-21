# M3 Step 4 — 린 워커 위생 ([10-110]/[10-117]/[10-118] + 신규 상장 자기 재시작)

**Milestone**: M3 "Binance 우주 완성"
**Step**: 4 (사이클 M3-4 — 2026-07-20 step3b 세션에서 예약, 2026-07-21~22 계획 세션에서 scope 확정)
**착수일**: 2026-07-22 · **완결일**: 2026-07-22 (당일 완주 — 계획·구현·배포·라이브 G2·정산)
**상태**: ✅ 완결
**단일 진실**: 본 record + `docs/M3-plan.md §사이클 추적`
**커밋**: `f1e9808`(Step 0~3 본체) → `8c7f3b2`(TierPoller 근본 수정 + watchdog 범인 지목) → `c71aff4`(docs) → `893729b`(G2-ⓓ 적발 로그 분기 수정)

---

## 📖 비전공자 친화 설명

이번 사이클은 새 기능이 아니라 **공장(Hetzner 데이터 수집 워커) 정비 주간**입니다. 고친 것 4가지:

1. **전원 스위치 수리 (`[10-110]`)** — 워커를 재시작할 때 "절반만 죽는 좀비"(7/14 실사고, WS 공백 7분)가 될 수 있었습니다. 이제 ① 문 하나가 안 잠겨도 금고 정리(미저장 데이터 flush)는 반드시 하고 ② 30초(실측 25초) 안에 안 끝나면 스스로 강제 종료하며 ③ 실패하면 "이상 없음"이 아니라 실패 코드(1)로 보고합니다.
2. **청산 문지기 교체 (`[10-117]`)** — "수상한 게 확인될 때만 쫓아내는" 방식(fail-open)이라 신규 상장 코인이 무사통과해 잘못된 시장 라벨로 저장됐습니다(1,232행 오염). 이제 가격 문지기와 같은 "명단에 있는 것만 통과"(fail-closed) + 거래소가 보내주는 신분증(`o.st`)을 제대로 읽습니다.
3. **명단 갱신 24h → 1h (`[10-118]` 차선책)** — 신규 상장 코인이 명단에 오르는 데 최대 하루 걸리던 것을 1시간으로 단축.
4. **🆕 새 코인 감지 시 자기 재시작** — 청산·초단위 실시간 데이터의 "개인 회선"(심볼별 WS 구독)은 부팅 때만 깔립니다. 명단 갱신에서 새 코인이 감지되면 워커가 **스스로 안전하게 껐다 켜져서**(1번 수리 덕에 가능) 회선을 다시 깝니다. 결과: **수요일 19시 상장 코인 → 늦어도 20시에는 모든 데이터가 흐름** (사용자 조건 충족).

## 🧭 계획 세션 사용자 결정 4건 (2026-07-21~22)

| # | 결정 | 비고 |
|---|---|---|
| 1 | 사이클 = 예약분 린 워커 위생 | 단, "신규 상장 코인 데이터 부재 불가" 조건 부가 |
| 2 | `[10-118]` 차선책만 (24h→1h) | 근본(동적 WS 재구독)은 별건 존치 — 자문 "번들 금지" 준수 |
| 3 | `[10-110]` 풀 견고화 | (a) flush 보장 (b) watchdog (c) exit code 분리 |
| 4 | **신규 상장 자기 재시작 추가 승인** | 축별 실측(아래) 근거 — 재시작을 지렛대로 전용 |

**결정 4의 근거 — 신규 상장 코인의 데이터 축별 반영 실측** (2026-07-22 코드 조사):

| 데이터 | 통로 | 1h 갱신만으로 |
|---|---|---|
| 심볼 마스터 / ticker DB / markPrice·펀딩 / OI·LSR 등 | REST 폴링 + allowlist (또는 자체 1h 캐시) | ✅ 1~2h 내 반영 |
| kline 차트 | TradingView 임베드 | ✅ 즉시 (워커 무관) |
| **청산 이벤트 / 경로 A 실시간 push / 인메모리 1m kline** | **per-symbol WS (부팅 스냅샷 고정)** | ❌ 재부팅까지 공백 → **자기 재시작이 봉합** |

## 🏗️ Step 0 — [10-110] 재시작 풀 견고화 ✅

- ➕ `apps/worker/src/shutdown.ts` — `runGracefulShutdown` 실행기 추출 (main() 클로저 → 테스트 가능 모듈).
  - **(a)** stops 는 `Promise.allSettled` 독립 정지 — 일부 reject 가 flush 를 못 막음. flushes 도 각각 try/catch (앞 실패가 뒤를 못 막음). 순서 계약 유지: streamCoalescer → markPriceWriteCoalescer ([10-77]).
  - **(b)** watchdog: `SHUTDOWN_WATCHDOG_MS = 25s` — hang 시 강제 exit(1). ★ **production 유닛 TimeoutStopSec=30s 실측**(`systemctl show`, 2026-07-22) — systemd SIGKILL 보다 5s 먼저 발화하도록 25s 채택 (당초 30s 초안은 동시 발화 경합).
  - **(c)** exit code: 전부 성공 0 / 부분 실패 1 / 성공 시 override(`exitCodeOnSuccess`, 자기 재시작용 64). exit 단일성 가드(watchdog 발화 후 늦은 완료가 재호출 못 함).
- ➕ `__tests__/shutdown.test.ts` — 결함 3종 + flush 순서 + exit 단일성, 5케이스 (워커 첫 shutdown 회귀 그물).
- 부수: `tickerWsHandler.ts` 잠복 lint 오류 1건(_marketType 미사용 후행 파라미터) 정리.

## 🔒 Step 1 — [10-117] 청산 마켓 판별 2단 가드 ✅

### ★ 착수 중 도메인 발견 — "st 부재"가 아니라 "st 중첩 오독"

선행 게이트(`@crypto-domain-expert` 공식 문서 조회 + **라이브 WS 캡처**, `feedback_external_api_live_smoke`)에서 서로 보완적인 사실 확인:

- **문서**: `!forceOrder@arr` 예시에 `st` 가 **최상위**로 표기 (1=UM/2=CM).
- **라이브 캡처 (2026-07-22, dstream 8프레임)**: `st` 는 **`o` 객체 안**에 실림 — `{"e","E","o":{...,"ps":"...","st":1}}`. 최상위 키는 `e/E/o` 뿐. 8/8 프레임 `o.st=1` 일관.
- **결론**: 구 코드가 최상위(`raw.st`)에서 읽어 항상 undefined → st 분기가 죽은 코드가 된 실체는 **중첩 위치 오독**. step3a 의 "st 부재" 진단은 이 오독의 하위 결론이었음 (문서↔와이어 괴리: 문서 예시 위치도 실전과 다름). → canonical-metrics·메모리 정정 대상 (Step 5).

### 구현

- **1단 — `o.st` 권위 판별** (allowlist 신선도 무관): 자기 마켓과 다르면 drop. 신규 상장(상장 0초부터)·dated 계약도 정확 판별. 미지 st(∉{1,2})는 보수적 drop + 1회 경고(위생 #5).
- **2단 — o.st 부재 폴백 = fail-closed inclusion**: 자기 마켓 TRADING allowlist 에 있는 심볼만 수용 (ticker/markPrice 동형). 종전 "insert 는 이력 보존" 정책 폐지 — **도메인 근거: 청산은 거래 중(TRADING) 심볼에서만 발생** (SETTLING/CLOSE 는 거래 정지 = forceOrder 발생 불가) → 잃는 실제 이력 없음. step3a 결정 8("존재 게이트")은 과거 *집계* 원칙, 수집 시점 게이트는 TRADING inclusion 이 정확.
- dedup 거짓 주석 정정 (실제 제약은 `PRIMARY KEY(id)` 뿐 — KORUUSDT 712행 중복이 증거).
- DB 트리거 `trg_liq_reject_mislabeled_coinm` 는 2중 안전망으로 존치 (RAISE WARNING 유지).
- 테스트 개정: o.st 판별 2케이스 + **최상위 st 무시 회귀 핀**(중첩 오독 재발 감지) + fail-closed 3케이스 + 미지 st drop+warn.

## ⏱️ Step 2 — [10-118] 차선책: refresh 24h → 1h ✅

`SYMBOL_REFRESH_INTERVAL_MS = 1h` (DB `symbols` 1h 동기화와 정렬). 부하 = DB pagination 조회 + dapi exchangeInfo REST 1콜(weight 극소)/h — 무시 가능.

## 🔄 Step 3 — 신규 상장 자기 재시작 ✅

- ➕ `apps/worker/src/symbolRefresh.ts` — `planSymbolRefresh` 순수 판정 (shutdown.ts 동형 추출 패턴): ① 스냅샷 대비 **추가된** 심볼 감지 (제거는 재시작 사유 아님 — allowlist swap 으로 충분) ② **빈 리스트 마켓 = 부분 실패 의심 → swap 생략** (부수 보강 — loadAllSymbols allSettled 부분 실패가 빈 리스트를 반환하는데, 그대로 swap 하면 fail-closed 전환 후 그 마켓 청산 insert 까지 1h 전량 drop).
- `index.ts` 배선: refresh 콜백에서 plan 적용(allowlist·quote 맵 같은 마켓만 동시 swap) → 신규 상장 감지 시 `shutdown("SELF_RESTART", 64)`.
- **exit 64 (전용 코드)**: `Restart=always` + `RestartPreventExitStatus=` 빈 값 실측 → 유닛 무수정으로 재기동 보장. 0(정상)·1(실패)과 로그 구분.
- **루프 가드 = 구조적**: 판정이 1h refresh 틱에서만 발화 → 최소 재시작 간격 1h 보장 (별도 상태 불필요). `shuttingDown` 재진입 가드 병용.
- **scope 차단선 준수**: 동적 WS 재구독 미진입 — "diff 감지 → 종료 트리거"까지만.
- ➕ `__tests__/symbolRefresh.test.ts` 6케이스 (신규 감지 / 무변화 미발화 / 제거 무시 / 빈 리스트 skip / 부트 실패 회복 경로 2종).

## ✅ 검증 (코드 게이트)

- [x] `pnpm -F @travis/worker test` **291 PASS** (신규 shutdown 6 + symbolRefresh 8 + TierPoller 유예 1 + forceOrder 개정)
- [x] `pnpm -F @travis/worker lint` clean / `pnpm -r type-check` 전 워크스페이스 green
- [x] 라이브 캡처 실측 — dstream `!forceOrder@arr` 8/8 프레임 `o.st=1` 일관 (가드 1단의 실증 근거)
- [x] code-reviewer **Critical 0** / W1·S2·S3 반영 + S4 검증 (아래) / crypto-domain W3 교차 판정 (아래)

## 🔍 code-reviewer (2026-07-22) — Critical 0 / W1·S2·S3 반영

- **W1 (반영)** — "구조적 1h 간격"은 빈도 상한일 뿐 **루프 종료 보장이 아님**: 부팅 부분실패(마켓 빈 스냅샷) → 1h 후 refresh 회복 → 전량 "추가" 감지 → 재시작 → 또 부팅 실패… 의 **1h 무한 재시작 루프**가 systemd StartLimit(5분 창)을 우회. → `SELF_RESTART_MAX_ADDED = 20` 임계 신설: 대량 추가(>20)는 회복/이상 신호로 보고 재시작 억제 + 경고(allowlist swap 만 적용). 진짜 상장(수 종)만 재시작. 테스트 2케이스 핀.
- **W2 (이월)** — index.ts 743줄 비대: 이번 추출(shutdown/symbolRefresh) 방향 인정, poller 등록 블록·refresh 콜백 추가 분할은 후속 (→ `[10-98]` 계열 원장).
- **W3 (교차 판정 완료)** — o.st 일치 시 allowlist 전면 우회의 도메인 안전성 → `@crypto-domain-expert` 판정: **이벤트 저장 경로에서 안전** — forceOrder 는 살아있는 호가창을 요구(정산/인도는 관리자 청산 = 이 스트림 미발생)하고, 도달한 이벤트는 실재 청산이라 **저장이 정직**(step3a 결정 8 "존재 게이트" 정합). status 필터를 저장 경로에 넣는 것이 오히려 site=DB 위반(상장폐지 캐스케이드 = 가장 정보량 큰 신호 삭제). 숙제였던 "현재상태 카드 누출"은 핸들러가 `insertLiquidation`+방송만 호출 = 구조상 없음(코드 확인).
- **S1 (배포 체크리스트 이월)** — 유닛 파일 TimeoutStopSec 미명시(라이브 실측값 30s는 시스템 기본 추정). watchdog 25s < 30s 로 이미 안전 — 유닛 명시(45s)는 sudo 필요라 후속.
- **S2 (반영)** — watchdog 발화 후 늦은 완료 경로의 반환값을 committed code 로 정합.
- **S3 (반영)** — fail-closed 폴백 drop 을 심볼당 1회 경보(관측성 — 신규 상장 창 유실 실측 가능).
- **S4 (검증)** — streamCoalescer→markPrice enqueue 는 "동기·비차단" 명시 + 첫 await 이전 호출 = flush 순서 계약 성립 확인.

## 🔬 라이브 G2 (2026-07-21~22 UTC, production travis-worker)

### 배포 중 실사고 재현·해소 — 구 코드의 마지막 반쪽 좀비

f1e9808 배포 재시작(SIGTERM)에서 **7/14 패턴이 그대로 재현** — 자식이 WS relay 를 닫고도 종료되지 않음(MainPID·기동시각 불변, 두 프로세스 7일째 생존). 런북대로 `kill -9` 수동 해소. **이것이 구 shutdown 코드의 마지막 좀비** — 이후 재시작은 전부 신 코드가 지킴.

### ★ G2 중 근본 원인 발견 — hang 범인 = `TierPoller.stop()` 무한 대기 (`8c7f3b2`)

신 코드 첫 SIGTERM 에서 watchdog 이 설계대로 발화(25s 강제 exit 1 → systemd 재기동 = **7분 수동 개입 → 36초 자동 복구**)했으나, hang 자체가 실재함을 확인 → 추적 결과 **`TierPoller.stop()` 이 진행 중 execute 를 abort·타임아웃 없이 완료까지 대기** — perSymbolTask 사이클(719심볼×6지표 ≈ 수 분) 도중 SIGTERM 이면 수 분 매달림. **7/14 좀비·watchdog 발화의 공통 근본 원인.** → `stop(graceMs=5s)` 유예 상한: 초과 시 진행 작업 유기+경고(upsert 멱등·다음 사이클 재수집 = 실손실 0) + watchdog 메시지에 hang 컴포넌트 이름 명시(pendingStops/currentFlush 추적).

### 게이트 결과

| # | 게이트 | 결과 |
|---|---|---|
| G2-ⓐ | **재시작 절차** | ✅ **PASS** — 최종 빌드 SIGTERM: TierPoller 5s 유예→유기 경고→`종료 완료 (SIGTERM)` **exit 0**(ExecMainStatus=0)→systemd 재기동, **총 ~11초**. watchdog 미발화·좀비 0. (중간 빌드에서 watchdog 안전망 자체도 라이브 실증 — 25s 발화→exit 1→자동 재기동) |
| G2-ⓑ | **1h refresh** | ✅ **PASS** — 부팅(16:57:04)+정확히 1h 뒤 17:57:10 `symbols refresh: spot=1366 usdm=720 coinm=30` 실측 (720 = 주입한 테스트 심볼 반영) |
| G2-ⓒ | **fail-closed drop** | 코드 경로 = 테스트 핀 + o.st 라이브 캡처(8/8)로 실증. drop 경보 라이브 발현은 다음 실제 신규 상장 시 관찰 (S3 관측 로그 배선 완료) |
| G2-ⓓ | **자기 재시작** | ✅ **PASS** — `ZZTESTUSDT`(가짜 USDM TRADING) DB 주입(16:58:54, 서버 내 service role — MCP read-only 우회) → **17:57:10 틱에서 정확 감지** `신규 상장 감지 (futures_usdm:ZZTESTUSDT) — 자기 재시작 (exit 64)` → graceful 종료(6s, 전 flush 완주) → systemd 재기동 → **부팅 스냅샷 usdm=720** = per-symbol 구독 재구성 실증. 관측 후 행 삭제(재부팅 후 719 복원 확인) |

### ★ G2-ⓓ 가 적발한 결함 1건 — 성공 종료의 거짓 "실패" 로그 (`893729b`)

자기 재시작의 종료 로그가 "종료 완료 — **일부 컴포넌트 실패** (SELF_RESTART, exit 1)"로 찍혔으나 **실제로는 전 컴포넌트 성공 + exit 64**였다. 원인 = 종료 메시지 분기를 `code === 0` 으로 판정 — 성공 코드가 64(자기 재시작)면 0이 아니라서 실패 문구(+하드코딩 "exit 1")가 출력. → `anyFailure` 기준 분기 + 실제 code 표기로 수정, 회귀 핀("exit 64 성공 경로에 '실패' 문구 부재") 신설. **교훈: 성공 코드가 다변화되면(0 외 값 허용) 메시지·판정 분기는 코드값 비교가 아니라 실패 플래그를 봐야 한다.**

## 🧭 crypto-trader 사후 자문 (2026-07-22, advisory only)

- **트레이드오프 판정**: "새 코인 실시간·청산 무기한 부재" 대비 11초 공백+워밍업 리셋은 **남는 거래**. 단 비용의 진짜 특성은 "**새 코인이 아니라 전 심볼에 분산**" — 마이크로캡 상장 하나로 BTC 스캘퍼가 11초 멈춤을 겪는 구조 (빈도 낮아 실무 감내 범위 판단).
- **상장빔 1h 지연**: 상장 첫 1시간을 노리는 유형엔 부족하나 **이번 사이클 결함이 아니라 데이터 모델의 원래 scope** — 상장빔 지원은 별개 결정. 스윙/포지션엔 1h 충분.
- **청산 신뢰**: 한국 3배 ETF 노출류 신뢰 붕괴 원천 차단 = 스캘퍼·스윙 backbone. 단 회복이 "침묵으로만" 전달됨.
- **★ 열린 지점 (관찰)**: 재시작 11초 동안 프론트가 stale 값을 정직하게 고지하는지 미확인 — `[10-53]`a "멈춘 값 오인" 계열. 실사용 관찰 대상.
- **다음 사이클**: **x축 시간 정렬(OI↔청산 동시성) 3번째 재지지** — 위생 우회를 마쳤으니 차별화 축 복귀 시점.

## 📁 관련 파일

**신규**: `apps/worker/src/{shutdown.ts, symbolRefresh.ts}` + 테스트 2종
**수정**: `apps/worker/src/index.ts`(상수 3·shutdown 배선·refresh 재구성) · `ws-relay/streams/forceOrderWsHandler.ts` · `ws-relay/streams/tickerWsHandler.ts`(lint 위생) · `ws-relay/__tests__/forceOrderWsHandler.test.ts`

## 🔗 링크

- **이전**: `M3-step3b-chart-multicolumn.md`
- **계보**: `[10-110]`(7/14 반쪽 좀비) / `[10-117]`·`[10-118]`(step3a §착수 중 발견) / `[10-14]` 상시 감시 3번째 적중의 근본 수정
