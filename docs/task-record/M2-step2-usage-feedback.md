# M2-plan §Step 2 — 실사용 피드백 수집 (진행 중)

> **상태**: 🔄 **진행 중** (2026-06-08 진입). 자유 페이스 (며칠~2주 권장 cap).
> **선행**: M1.9 ✅ 완료 (2026-06-06) + COINM 안정성 PASS (2026-06-07). 데이터 인프라 완전체, 실사용 코드 블로커 0건.
> **결정 (2026-06-08, 사용자)**: ① **본인 단독 실사용** — M1.7 Closed Beta Ops 계속 보류 (외부 베타 욕구 발생 시 그때 미니 마일스톤 진입). ② **경량 준비 후 진입** — 본 추적 문서 세팅 = 그 경량 준비.
> **진행 모델 전환 (2026-06-08, 사용자 A-1 결정)**: M2-plan Step 2/3/5 를 **확장 루프로 병합** — "다 모은 후 일괄 계획"(waterfall)이 아니라 **백로그에 계속 추가 + 테마 단위로 한 번에 하나 착수 + 실사용 병렬**. 상세 = 아래 §H.
> **▶ 현재 (2026-06-27)**: 확장 루프 **5회전 = 경로 A fast-follow 트랙 (실시간화 확장)** 진행 중. 완료 누적: 테마 A/B/C ✅ + `[10-33]` "모든 코인 보기" ✅ + 경로 A(WS 직결) ✅ + **fast-follow #1(마크가격/펀딩) ✅ 완결 (2026-06-26)**. **★ 사용자 방향 재확인 (2026-06-27, 전체 docs 파악 세션)**: ① 경로 A fast-follow **계속** — 다음 = **fast-follow #2 (청산 피드 카드)**, 착수 전 `[10-68]`(워커 publish 헬퍼 추출) 선결 + `[10-69]`(basis 418 모니터)/`[10-67]`(crypto-trader advisory) 검토 → ② 그 후 **본 문서대로 실사용 병렬 계속** (불편 발견 → §H 백로그 흡수 → 테마/항목 단위 수정). 단일 진실(경로 A) `M2-pathA-ws-direct.md §4`.
> **(이력 2026-06-12)**: **테마 B (데이터 정합) ✅ 완결 (사용자 선언)** — 게이트 3 전부 통과 (운영 관측 PASS → 워커 배포 → 라이브 G2 5종, F2 회귀 오염 0). 테마 A 는 ✅ 완결 (2026-06-11). 단일 진실 `M2-themeB-quote-asset.md`. **다음 = `[10-33]` "모든 코인 보기" 표현력** (G2 가 가시화한 신규 표현력 갭 — 본 문서 §2 결의 연장).
> **(이력 2026-06-10)**: 테마 A Step 3 (IndicatorListCard — 정렬 랭킹 카드, 기둥1 완결). 직전 이력: `[10-11]` @arr 사고는 **근본 수정·배포·검증 완료** (진짜 원인 = Binance 4/23 레거시 WS URL 폐지 → `/market` + chunked, incident doc §10) → **테마 A Step 2 ✅ 마무리 선언** (사용자 G2 통과 + `[10-9]` 표시 정밀화 + fundingInfoTask 1h 단축). 잔여 = **2026-06-12 안정성 관측** + `[10-11]`/`[3-50]` 묘비 + ticker24hrBatchTask 판단 (incident doc §10.4b). 테마 A 추적 = `M2-themeA-card-expressiveness.md`.
> **(2026-06-10 이력 — 🔴 사고)**: 테마 A Step 2 코드 push(`1f9f448`) 후 라이브 site=DB 검증에서 `[10-11]` 발견(USDM markPrice/funding frozen + 청산 43일 정지, 카드 무결 DB stale). 단일 진실 `M2-themeA-incident-arr-stream-stall.md` + 메모리 `reference_binance_arr_stream_stall.md`.
> **단일 진실 원천**: 본 파일이 Step 2 실사용 발견의 단일 기록처. 실사용 발견 백로그 = §H, 관찰 체크리스트 = §B, 데이터 hotfix = §C. (deferred 검색용 요약 = `deferred-task.md [10-1]`~`[10-6]`.)

---

## A. 이 문서의 사용법 (실사용 중 발견 → 어디에 기록?)

실사용 중 무언가 발견하면 **2갈래로 분류**합니다 (M2-plan 규율: 즉시 vs 누적):

| 분류 | 정의 | 행동 |
|---|---|---|
| **(C) 데이터 정확도 결함** | 거래소 공식 사이트 ↔ TRAVIS 카드/DB 값 불일치 (가격/funding/OI/LSR/basis 등). 폴링 stale / 단위 불일치 / 계산법 차이 포함 | **즉시 hotfix** (CLAUDE.md 위생 #9). §C 로그 + 별도 task-record |
| **(D) UX / 제품 판단** | "쓸 만한가 / 답답한가 / 더 필요한가". 카드 톤, 필터 스코프, 로딩 피드백, 새 카드 욕구 등 | **누적** (§B 체크리스트 + §D 자유 발견). Step 3 에서 일괄 판단 |

**기록 원칙** (CLAUDE.md `feedback_docs_record_per_substep`):
- 발견 즉시 본 파일에 기록 (몰아 쓰기 금지).
- 새 deferred 발생 시 `docs/deferred-task.md` 에 등재 (출처 = "실사용 피드백 2026-06-XX") 후 본 파일에서 ID 참조.
- 데이터 결함 hotfix 는 즉시 → 그 commit + task-record 를 §C 에 링크.

---

## B. `[9-10]` 관찰 체크리스트 (crypto-trader advisory 검증 대상)

> 출처: `docs/deferred-task.md [9-10]` + M2-plan §Step 2 관찰 체크리스트. **실사용으로 검증할 가설들** — 추측이 맞았는지 실측으로 확인.
> 각 항목: 실사용에서 의식적으로 시도 → 관찰 결과 1~2줄 기록 → 판단(유지/변경/deferred 승격).

| # | 관찰 포인트 | 관련 deferred | 실측 결과 (실사용 중 채움) | 판단 |
|---|---|---|---|---|
| O1 | **English 쿼리 수용성** — 토큰 쿼리(`BTCUSDT price`, `top gainers`)가 사실상 DSL 로 자리잡나, 자연어를 더 쓰나 | [9-10] 관찰1 | _(미기록)_ | |
| O2 | **동일 쿼리 2회 UX** — 카드 2개 생성 vs 기존 카드 업데이트. 실제 중복 Enter 빈도 | [9-10] 관찰2 | _(미기록)_ | |
| O3 | **Fallback 토스트 행동 유도성** — `"Couldn't build a valid response..."` 발생률 + inline 예시 필요성 | [9-10] 관찰3 / Step3d Q1 | _(미기록)_ | |
| O4 | **카드 생성 3~7초 체감** — 지연 자체 vs 로딩 피드백 부재 중 무엇이 주 불만인가 | [9-10] 관찰4 / [4-21] | _(미기록)_ | |
| O5 | **3카드 집합의 한계** — Ticker/List/Kline 외에 funding/OI/호가/청산 카드가 언제 아쉬운가 (페르소나별) | [9-10] 관찰5 / [3-40] | _(미기록)_ | |
| O6 | **카드 타이틀 심볼 2중 노출** — `kicker:"BTCUSDT · SPOT"` + `title:"BTCUSDT"` 가 안전장치인가 공간낭비인가 | [9-10] 관찰6 | _(미기록)_ | |
| O7 | **"24h Volume Leaders" 용어 모호성** — base(수량) vs quote(거래대금) 해석 갈림 | [9-10] 관찰7 / [3-50] | _(미기록)_ | |
| O8 | **3 카드 제목 톤 일관성** — 심볼-only / descriptor-only / 혼합 세 패턴의 스캔 리듬 | [9-10] 관찰8 | _(미기록)_ | |
| O9 | **Top N 필터 스코프** — USDT-only vs 전체. 기본 quote 필터 승격 여부 | Q1 / [4-19] | _(미기록)_ | |
| O10 | **empty 응답 UX 힌트 강도** — 미지원 쿼리 시 안내 충분한가 | Q2 / [4-20] | _(미기록)_ | |

### B-2. crypto-trader 추가 관찰 (2026-06-08 자문, 페르소나별)

> 위 O1~O10 이 "기존 advisory 검증"이라면, 아래 O11~O15 는 crypto-trader 가 **실사용 진입 직전 새로 제안**한 포인트. O11(워크플로 대체)이 최상위 — 나머지가 다 OK여도 O11 이 NO면 제품이 안 쓰임.

| # | 관찰 포인트 | 페르소나 | 실측 결과 | 판단 |
|---|---|---|---|---|
| O11 | **워크플로 대체 여부 (최우선)** — TRAVIS 가 기존 도구(바이낸스 앱 / TradingView / CoinGlass)를 실제로 **대체/병행**하나, 아니면 신기해서 한 번 열고 마나 | 공통 | _(미기록)_ | |
| O12 | **신선도 체감** — 카드 숫자가 "지금 이 순간"으로 느껴지나 (stale 의심 순간 = 신뢰 즉사). _now WS/폴링 체감 | 공통 | _(미기록)_ | |
| O13 | **멀티카드 부하** — 카드 여러 장 동시 띄울 때 렌더/반응 부하 (Intel UHD 620 저사양 기준). 스캘퍼는 화면 가득 띄움 | 스캘퍼 | _(미기록)_ | |
| O14 | **세션 지속성** — 뷰 저장/복원이 며칠 단위 워크플로에 실제로 쓸 만한가 (스윙은 같은 뷰 재방문) | 스윙 | _(미기록)_ | |
| O15 | **한 장 요약 욕구** — 카드 여러 장 대신 "한 화면 핵심 요약" 을 원하게 되나 (포지션은 모니터링 위주) | 포지션 | _(미기록)_ | |

> **crypto-trader 우선순위 관찰** (자문): O6/O7/O8(타이틀 톤·용어)은 **첫날 결론** 나는 항목 — 빨리 닫고 넘어갈 것. O5/O11(funding·OI 욕구, 워크플로 대체)은 **시장 국면 의존** → 끝까지 열어둘 것 (변동성 큰 날 vs 잔잔한 날 다름).
> **carry-over (이미 §E 반영)**: 카드 없어 가장 답답할 metric = **1위 OI+가격 다이버전스** (매 진입판단 소환), **2위 Funding Rate** (보유비용·쏠림, 단 8h/1h 단위 표기 주의 — canonical-metrics.md).

---

## C. 데이터 정확도 hotfix 로그 (사이트 = DB 일치)

> 발견 즉시 hotfix → 여기에 1줄 + task-record 링크. CLAUDE.md §데이터 위생 #9 의무 (비교 URL + 수치 일치 검증 기록).

| 날짜 | 증상 (사이트 값 vs DB/카드 값) | 원인 | commit / task-record |
|---|---|---|---|
| 2026-06-09~10 | BTCUSDT funding 부호반전(-0.0095% vs +0.0005%) + mark/index frozen + 청산 43일 정지 (`[10-11]`) | **Binance 2026-04-23 USDM WS 레거시 URL 폐지** (brownout — "@arr 큰 프레임" 가설은 오진) | `a506ca0` (`/market`+chunked) / `M2-themeA-incident-arr-stream-stall.md` §9~§10. 검증: funding site=DB **8자리 일치**, 청산 재개 |
| 2026-06-10 | BTCUSDT funding 카드 -0.0040% vs 사이트 -0.00403% (표시 자릿수) | `formatFundingRate` 4자리 반올림 | `d24fd61` (5자리 + interval 라벨 + tickSize/baseAsset — `[10-9]` 회수) / `canonical-metrics.md §2.1` |
| 2026-06-11 | funding 랭킹에 BTWUSDT/SKHYNIXUSDT(실랭킹 2위, +0.31%) 등 누락 (`[10-22]`) | **symbols 마스터 2달 stale** — 04-19 일회성 시드 후 exchangeInfo→DB 동기화 태스크 부재 (위생 #3 위반 잠복, 카드 무결) | `26a7ba5` (syncSymbolsTask 24h + 부팅 1회) / `M2-themeA-card-expressiveness.md §4.8`. 검증: usdm +80 심볼, SKHYNIX 랭킹 2위 진입 |

---

## D. 자유 발견 로그 (체크리스트 밖 + 새 카드/기능 욕구)

> O1~O10 에 안 들어가는 발견. 특히 **"이 데이터/카드가 있으면 좋겠다"** 욕구는 M2 후보 직결.

| 날짜 | 발견 / 욕구 | 분류(C/D) | deferred ID | 비고 |
|---|---|---|---|---|
| 2026-06-11 | flash/순위 슬라이드 "좋네요" — 단 Binance/Coinglass 처럼 흐르지 않고 **"바뀌다 말다" 박동** 체감 | D | `[10-1]` (a) 잔여 | 경로 B (WS→DB→Realtime→500ms throttle) 구조 한계 — **근본 해법 = 경로 A WS 직결, M2 테마 후보 승격** (§E) |
| 2026-06-11 | IndicatorListCard advisory 3건 (funding flash 임계값 / desc vs \|절대값\| 정렬 / MARK 컬럼) | D | `[10-21]` | 실사용 체감 후 사용자 결정 |

---

## E. 실사용 발견 → M2 후보 매핑 (Step 3 입력용)

> future.md 확장 로드맵 우선순위(추측)가 실사용으로 검증되는지 추적. Step 3 우선순위 재배치의 직접 입력.

| future.md M2 후보 | 추측 우선순위 | 실사용 검증 신호 (관련 O# / 발견) | 실측 우선순위 (Step 3 확정) |
|---|---|---|---|
| **Composable/표현력 (§2)** 전 metric 카드 + GenericChart | 3 (추측) | **F1/F3 (세션#1 압도적 1순위 실증)** | **★ 1위 — 테마 A ✅ 완결 (2026-06-11)** |
| **경로 A — WS 프론트 직결** (PRD 3 데이터 경로) | (미계획) | ★ 테마 A 완결 후 실측 (2026-06-11): flash 가 "박동" — 경로 B 1~2초 뭉텅이 구조 한계. liveness 의 나머지 절반 | **★ 4회전 — ✅ 완료 (2026-06-24)**. Step 1+3a+3b + Step 2 Phase 1/2(wss 라이브) + **Step 4 Phase A/B(ticker transport ws_direct 플립)**. 라이브 G2 PASS: 박동 소멸(가격 ~1초 매끄러움 사용자 실측) + site=DB(24H low/high 소수점 일치) + 토큰 통과. ★ 라이브 정정 = ES256 비대칭 서명(워커 JWKS 검증 전환, Step 2 HS256 가정 정정). `[10-1]`(a) 묘비. **= PRD 3대 경로 전부 구현.** ▶ 다음 = fast-follow 3종(funding/마크→청산→trade+호가, 사용자 결정) 후 새 테마. 단일 진실 `M2-pathA-ws-direct.md §3 Phase B 라이브 완결` |
| 세션 컨텍스트 (§4) "거기에 ETH 추가" | 1 (추측, 난이도 낮음) | O2 / F4 와 연관 | 4위 — 테마 C (F4 와 묶음) |
| 혼합 응답 (§3) 카드+텍스트 | 2 | O10 (empty/설명 욕구) | _(미정)_ |
| Multi-provider fallback (§6) `[4-28]` | 4 (incident 1회 또는 베타 직전) | O3 (transient 빈도) | _(미정)_ |
| 온디맨드 데이터 소스 (§1) / CoinGecko·CMC | 5 | 사용자 사전 직관 (D 로그) — **표현력 갭 이후** | _(미정, 창고 신설은 표현 이후)_ |
| 거래소 다변화 (OKX/Bybit/Bitget) | 별도 트랙 ([8-27] 빚 #5/#6 선결) | D 로그의 "타 거래소" 욕구 | _(미정)_ |

> **★ 실측이 추측을 뒤집음 (2026-06-08 세션#1)**: future.md 는 "세션 컨텍스트(§4)"를 M2 1순위로 추측했으나, 실사용 첫 세션은 **"표현력 갭(§2) — 전 metric 카드 + 리스트 liveness"** 를 압도적 1순위로 실증. M2-plan §Step 2 의 존재 이유 (추측 금지·실측 우선) 정확히 입증.

---

## F. 진입/종료 게이트

**진입 게이트 (✅ 통과, 2026-06-08)**:
- [x] M1.9 ✅ 완료 + COINM 안정성 PASS — 데이터 인프라 완전체
- [x] 실사용 코드 블로커 0건 (잔여 `[8-31]`ⓓ / `[8-22]` 는 차단 아님)
- [x] 본 추적 문서 세팅 (경량 준비)
- [x] Vercel 배포본 가동 (실사용 진입점)

**종료 게이트 (Step 3 진입 조건, M2-plan 종단 검증 인용)**:
- [ ] O1~O10 관찰 결과 누적 (의무적 8항목 시도)
- [ ] "쓸 만한가 / 무엇이 답답한가 / 무엇이 더 필요한가" 정성 판단 정리
- [ ] §E M2 후보 실측 우선순위 채워짐 → Step 3 우선순위 재배치 입력 충분
- [ ] (timeline cap) 약 2주 시점에 피드백 충분 여부 자체 판단

---

## H. 실사용 백로그 + M2 테마 (2026-06-08 1차 정리)

> **진행 모델 (사용자 합의 2026-06-08)** — ROADMAP §M2 "확장 루프(Extension Loop)" 그대로 실행:
> ① 본 백로그에 실사용 발견 **계속 추가** (살아있는 문서) → ② 의존성 기반 **테마로 묶음** → ③ 테마 단위로 **한 번에 하나** 착수 (plan→구현→검증→docs→commit, CLAUDE.md) → ④ 실사용은 **계속 병렬**, 새 발견은 백로그 대기 또는 관련 테마 흡수.
> **착수 전 계획 규율**: 즉흥 수정 금지. 각 테마는 `@roadmap-milestone-manager` 로 검증 가능 단위(3~7 step) 분해 후 착수. 의존 항목(예: F1 liveness + F3 metric 카드 = 같은 공통 row 컴포넌트)은 반드시 한 테마로 묶어 재작업 방지.

### 실사용 발견 — 세션 #1 (2026-06-08, 6건, 코드·DB 확정 진단)

| ID | 증상 | 근본 원인 (확정) | 규모 | 테마 |
|----|------|------|------|------|
| **F1** | gainers 리스트 "살아있는 느낌" 약함 | (a) ticker 경로 B (WS→Supabase→Realtime 500ms throttle) + 24h변화율 1분 REST 보강 (PRD 경로 A=WS 직결 미구현) / (b) ★ 시각 신호 0 — CoinListCard `<tr>` 텍스트 교체만, flash/순위모션/tick 부재. crypto-trader: 체감 ~80%가 (b) | 중 | **A** |
| **F2** | spot "USDT pair" 안 걸러짐 (TRY/BNB/USDC 섞임) | now_spot_ticker 에 `quote_asset` 컬럼·queryableField **부재** (DB 28컬럼 직접 확인) → AI 가 필터 생성 불가. symbol 은 `=`/`in` 만. description 은 "filter by quote_asset" 약속 = **구현과 모순** | 중 | **B** |
| **F3** | top OI / funding+LSR → "realtime error" | datasource id(`open_interest`/`long_short_ratio`/`premium_index`) ≠ 실테이블(`now_futures_indicator`). CoinListCard 가 `from(datasource)` 직접 → 테이블 없음 → `status="error"` (CoinListCard.tsx:167). + CoinListCard 는 ticker 필드 전용. **`[8-27]` 빚 #1(id=테이블명 강결합)·#4(카드 바인딩 거래소 잠금) 실전 발현** | 큼 | **A** |
| **F4** | 차트 timeframe/지표 매번 설정 귀찮음 → 유저별 프롬프트(CLAUDE.md 식) | `buildSystemPrompt` 에 user preference 주입 메커니즘 **0** (locale 만, 미사용). ⚠️ TradingView 기본 iframe widgetembed 는 studies(MA 등) 주입 제한 → Advanced Chart 위젯 업그레이드 선결 가능 (timeframe/거래소 기본값은 현 구조로 가능) | 중 | **C** |
| **F5** | 코인 로고 표시 욕구 (디자인 무미건조) | 로고 데이터/표시 없음. crypto-trader: 티커가 1차 식별자·로고는 보조/장식(스캘퍼 노이즈/포지션 유용). UI-3 흑백 충돌 + 1400심볼 누락/CDN 리스크 → grayscale + 모노그램 fallback. **로고 URL 은 CoinGecko/CMC 메타데이터에 동반** | 소 | **D**(흡수) |
| **F6** | crude oil 등 비크립토 차트 거부 | GUARDRAILS "no datasource fits → cards:[] + notes" + tvSymbolMap 4개 크립토 거래소만(`EXCHANGE_PREFIX`). ★ TradingView 자체는 `TVC:USOIL`/`SPX`/DXY 지원 → "passthrough"(차트는 datasource 불필요)로 쉬운 확장. 크립토 트레이더에게 매크로 상관 참고 가치 | 중 | **D** |

### ▶ 테마 A 착수 (2026-06-09) — `@roadmap-milestone-manager` 6-step 분해 완료

**단일 진실 = `docs/task-record/M2-themeA-card-expressiveness.md`** (테마 A 전체 추적처).

- 6-step 분해: Step 0(즉시 안전망 ✅) → 1(`[8-27]`#1·#4 배관 분리) → 2(IndicatorCard) → 3(IndicatorListCard, 기둥1 완결) → 4(공통 LiveRow flash+FLIP, 기둥2) → 5(통합검증+docs). 예상 13~18h.
- **Step 0 ✅ 완료 (2026-06-09)**: F3 깨진 "realtime error" → graceful "this data view is coming soon" (표시 계층 allowlist 가드, CoinListCard+TickerCard). type-check/lint/138 test green. code-reviewer Critical 0(W1/W2/S1 반영) + crypto-trader advisory.
- **Step 1 ✅ 완료 (2026-06-09)**: datasource id ≠ 물리 테이블명 분리(`[8-27]`#1 `table` 분리 회수). `DatasourceEntrySchema.table` + `resolveDatasourceTable` + dataService(initialFetch/channelManager) table 기준 운영(채널 공유). 6 패키지 type-check + web 139/shared 30 test green. ★ scope 정정: #4/fetchKind 제외(비-거래소용), allowlist 제거는 Step 3. code-reviewer Critical 0 → W1(`[10-7]` fan-out, Step 2 선결)·S1(`[10-8]` table 검증) deferred.
- **★ crypto-trader 우선순위 신호 (Step 0 자문)**: 막힌 두 metric(OI / funding+LSR)이 "카드 없어 답답함" 1·2위와 일치 → 잔잔한 장 며칠로 "버틸 만하다" 결론 위험. 변동성 큰 날 답답함 1회 발생 시 Step 2(IndicatorCard, OI 우선) 당길 신호.
- **Step 2 ✅ 마무리 선언 (2026-06-10, 사용자)**: IndicatorCard(단일 심볼 지표 카드) — 색 2색 일관 + 데이터소스별 5종(Funding/Basis/OI/LSR+taker/Taker). generic 카드 + descriptor. `[10-7]` dirty check + premium_index drift 재정합 + basis datasource 신설 (`1f9f448`). 라이브 검증에서 발견된 `[10-11]` 사고를 **Step 2.5 로 해소**한 뒤 사용자 G2 육안 통과 + `[10-9]` 표시 정밀화(funding 5자리·interval 라벨·tickSize·baseAsset, `d24fd61`) + fundingInfoTask 1h 단축.
- **Step 2.5 ✅ (2026-06-10, 긴급 삽입)**: `[10-11]` 근본 수정 — **진짜 원인 = Binance 4/23 USDM WS 레거시 URL 폐지** → `/market` + BinanceChunkedRelay + StreamCoalescer + USDM full 승격(`[3-50]`) 배포(`a506ca0`). 청산 43일 만에 재개, funding site=DB 8자리 일치. 단일 진실 `M2-themeA-incident-arr-stream-stall.md` §9~§10. 잔여 = 2026-06-12 안정성 관측 + 묘비.
- **다음 = Step 3 (IndicatorListCard)** — /clear 후 첫 작업 (사용자 결정 2026-06-10).

### M2 테마 1차 묶음 (의존성 기반 — `@roadmap-milestone-manager` 분해 대상)

- **테마 A — 카드 표현력 확장** (F3 + F1): `now_futures_indicator` **전 metric 전용 카드** (funding predicted/realized · OI · **top LSR by accounts** · **top LSR by positions** · global LSR · taker · **basis**) + 리스트 **liveness**(flash + 순위 FLIP 모션). **데이터 이미 있음 = 최고 체감·최저 비용 → 최우선.** 사용자 요구 #1(모든 데이터 표현) = 본 테마 scope. **선결**: datasource→table 매핑 분리(`[8-27]`#1) + CardDataBinding 일반화(`[8-27]`#4). **자문**: crypto-domain-expert(metric 정의/단위) + crypto-trader(metric별 표현 형태) + nextjs-frontend(공통 row + 저사양 UHD620 모션 절제). **결정 필요**: UI-3 흑백 vs flash 색(방향성) — crypto-trader Q2.
- **테마 B — 데이터 정합** (F2): `quote_asset` 컬럼 신설(워커 symbol 파싱 또는 exchangeInfo) + DB + registry queryableField + AI 필터. 독립적, A와 병행 가능, 신뢰 직결. (`[3-50]` quote_volume 단위 트랩 같은 뿌리.) **✅ 완결 (2026-06-12, 사용자 선언)** — 코드+DB → 워커 배포 → 라이브 G2 5종 PASS (F2 오염 0). 단일 진실 `M2-themeB-quote-asset.md`. ★ Q1 결정: 기본 quote 스코프는 description 단서가 아니라 **테마 C 유저 프리퍼런스** 영역 (소프트 하드코딩 기각). 후속 = `[10-33]` "모든 코인 보기" 표현력.
- **테마 C — UI 셸 + 유저 프리퍼런스** (F4 + PRD §5): 좌측 "My views"(저장 뷰) + 우측 세션 채팅/AI 로그 패널 + 유저 프리퍼런스(`user_preferences` 테이블 + `buildSystemPrompt` `<user_preferences>` 섹션 주입). 사용자 요구 #2(프리퍼런스를 패널 작업과 묶음). 큰 작업. F4 의 차트 studies 는 위젯 업그레이드 선결 확인.
- **테마 D — 차트 확장** (F6 + F5): TradingView passthrough(비크립토 자산 — kline-chart-card datasource-less 렌더 + tvSymbolMap 자산 매핑 확장) + 로고(CoinGecko/CMC 메타데이터 동반). **PRD 비전(크립토 타겟) scope 논의 필요.**
- **즉시 안전망** (테마 A 착수 전 임시): F3 깨진 "realtime error" → AI 가드 또는 컴포넌트-datasource 매핑 제약으로 graceful "card coming soon" notes. 사용자가 계속 마주칠 UX 결함 차단.

---

## G. 비전공자 한 줄 요약

> **"부엌이 완성됐으니 사장이 직접 며칠 자기 음식을 만들어 먹어보는 단계. 이 노트는 '먹어보니 짜다 / 이 메뉴가 빠졌다'를 적는 수첩이고, 적힌 내용이 다음에 진짜로 늘릴 메뉴 순서를 정한다."**
