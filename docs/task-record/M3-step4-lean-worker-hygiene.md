# M3 Step 4 — 린 워커 위생 ([10-110]/[10-117]/[10-118] + 신규 상장 자기 재시작)

**Milestone**: M3 "Binance 우주 완성"
**Step**: 4 (사이클 M3-4 — 2026-07-20 step3b 세션에서 예약, 2026-07-21~22 계획 세션에서 scope 확정)
**착수일**: 2026-07-22
**상태**: 🔄 진행 중 — Step 0~3 코드 완료, 배포·라이브 G2 대기
**단일 진실**: 본 record + `docs/M3-plan.md §사이클 추적`

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

- [x] `pnpm -F @travis/worker test` **288 PASS** (신규 shutdown 5 + symbolRefresh 7 + forceOrder 개정)
- [x] `pnpm -F @travis/worker lint` clean / `pnpm -r type-check` 전 워크스페이스 green
- [x] 라이브 캡처 실측 — dstream `!forceOrder@arr` 8/8 프레임 `o.st=1` 일관 (가드 1단의 실증 근거)
- [ ] code-reviewer 리뷰 반영
- [ ] Hetzner 배포 + 라이브 G2 4종 (§아래)

## 🔬 라이브 G2 (배포 후 — 작성 예정)

계획: ⓐ 재시작 절차(반쪽 좀비 0·exit code·flush) ⓑ 1h refresh 로그 ⓒ fail-closed drop 실측 ⓓ 자기 재시작(DB 심볼 주입 시뮬레이션) — 결과는 여기 채움.

## 📁 관련 파일

**신규**: `apps/worker/src/{shutdown.ts, symbolRefresh.ts}` + 테스트 2종
**수정**: `apps/worker/src/index.ts`(상수 3·shutdown 배선·refresh 재구성) · `ws-relay/streams/forceOrderWsHandler.ts` · `ws-relay/streams/tickerWsHandler.ts`(lint 위생) · `ws-relay/__tests__/forceOrderWsHandler.test.ts`

## 🔗 링크

- **이전**: `M3-step3b-chart-multicolumn.md`
- **계보**: `[10-110]`(7/14 반쪽 좀비) / `[10-117]`·`[10-118]`(step3a §착수 중 발견) / `[10-14]` 상시 감시 3번째 적중의 근본 수정
