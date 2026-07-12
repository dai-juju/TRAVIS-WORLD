# M2 사이클 4b — 크로스 metric 스크리너 + 스키마 파생 강제 — task-record, 단일 진실

> **상태**: ✅ **완결 (2026-07-12 당일) — Step 3~5 (`634c53f`+`8510e6a`) + 라이브 G2-b 전 게이트 PASS + Stage 4 완료 선언 (§6b/§8).**
> **배경**: 사이클 4(Stage 4 + 쿼리 자유도)의 후반부 — 4a(`[10-101]` 스타일)는 당일 완결. 4b = `[10-102]`(a) "Low LSR × top OI" 한 카드 + `[10-91]`/`[10-78]` 스코프 스키마 강제. **Stage 4 완료 선언 사이클.** 계획 = plan `serialized-wibbling-pebble.md`(상세 실행판, 2026-07-12 승인).

---

## 0. 한 줄 요약 (비전공자용)

> **"창고(지표 테이블 27칸 한 행)는 원래 하나였는데 렌즈 5개가 각자 자기 칸만 보여줘 '두 지표 동시 스크리닝'이 불가능했다. 여섯 번째 통합 렌즈를 등록하고, 표의 컬럼은 코드 큐레이션 없이 'AI 가 필터/정렬 건 그 숫자가 그대로 화면에 뜨는' 규칙으로 파생시켰다. 동시에 '단일 심볼 카드는 심볼·마켓 필수' 를 스키마가 강제해 AI 가 빼먹으면 스스로 고치게 됐다."**

## 1. 사용자 결정 (2026-07-12)

- **컬럼 순서 = sort 먼저 + 나머지 참조 등장순** (crypto-trader: 트레이더는 첫 값 컬럼을 세로로 훑으며 랭킹 검증).
- **★ 무참조 기본 컬럼 = 폐기 (큐레이션 금지)**: "하드코딩되어서는 안 됩니다. AI 가 유저의 쿼리에 따라 적합한 데이터×컴포넌트를 조합" — **CLAUDE.md §코드 스타일에 영구 명문화** + `feedback_card_default_overrides_ai_intent` 메모리 보강. 무참조 = graceful 안내("no metrics referenced — filter or sort by an indicator field").
- **분수/비율 dedup 안 함**: 참조된 필드 그대로 표시(필터 술어 투명성) — 분수는 % 포맷.

## 2. Step 3 ✅ — `futures_indicators` 통합 datasource (`634c53f`)

- defaults.ts: 5 family 값필드 → **명명 const 5개**(모듈 레벨, 선언 텍스트 불변) + 확장 규약 주석("새 metric 필드는 여기 한 곳에만"). `futures_indicators` 신설 — `table: now_futures_indicator`(channelManager 물리 테이블 기준이라 Realtime 채널 자동 공유, 신규 채널 0), `servableShapes: ["set"]`(record 는 family 소관), union spread, 크로스-family 유스케이스 description. table-card dataShapes +1(requiredFields []).
- registries.test: dsShapes 핀 +1 + **[불변식 4b] "통합 ≡ 5 family union" 등치**(size 30 핀) — 미래 family 필드 한쪽만 갱신 시 시끄럽게 실패(확장성 장치).

## 3. Step 4 ✅ — dynamicColumns + `[10-79]` 가상화 헤더 (`634c53f`)

- tableDescriptors.ts: `DynamicColumnsBinding` + `TableDescriptor.dynamicColumns?`(스크리너 1곳 한정 명기) + **SCREENER_COLUMN_CATALOG 27필드**(num()/formatFraction 헬퍼, family 포맷터·tone 재사용 = site=DB 단위 정합) + screener descriptor(`columns: []`, defaultSort/flashColumn 없음 — 정렬·flash 도 AI sort 파생만). 파생 = sort 먼저 → filters 등장순, 식별축(exchange/market_type/symbol) 제외, dedupe, **상한 4**(카드 폭 물리 제약 — 필터링 자체는 전 필드 적용).
- TableCard.tsx: `effectiveDescriptor` 파생(ChartCard 4a 동형 패턴) + `noMetricColumns` graceful 안내+fetch 차단 + **[10-79] 회수**: 가상화(>100행) 경로 sticky 헤더(행과 동일 gridTemplate = 폭 정합, bg+z-10).
- 테스트: 9종 키/두 게이트 등치/카탈로그 27 등치("필터는 되는데 컬럼 안 뜸" 반쪽 UX 차단)/전 항목 width·graceful/파생 로직 5케이스/렌더 매트릭스 +1. web 458.

## 4. Step 5 ✅ — superRefine 블록 (3) (`8510e6a`)

- 규칙: `comp.acceptsShapes 전부 ⊆ {record, series}` && `ds.table 존재` → marketType(공통 스코프 축) + symbol(record=직접 / series=직접 OR filters `symbol =/in`) 필수. `resolveChartSymbols` 의미 미러(오버레이 보존, [10-104] 동시 지정은 form union 해석). (2.5)와 `issuedScopeFields` dedupe. **kline = table 부재 registry 파생 자연 면제** / set·events = 조건 자연 면제(심볼-less tape/스크리너 보존).
- 효과: `[10-91]`(chart-card marketType 누락 풀스캔 500)·`[10-78]`(경로 B indicator symbol 미강제)이 **스키마 단계 차단 = self-correction 작동**, 렌더 가드("missing scope")는 2차 방어로 강등.
- 테스트 +9(shared 104): reject/오버레이 통과/동시 지정 통과/record 필터 대체 불가/kline 면제 핀/dedupe 핀/면제 확인 + ★ futures_indicators 크로스 필터(LSR<1 × ΔOI>0 × sort OI) 스키마 통과. **false-positive 0**: 기존 전 테스트 + few-shot 자동 감사 green. 저장 뷰 격리 = serialize.ts 카드별 safeParse + skipped 배너(기확인 — 스킵은 이미 missing-scope 로 깨져 있던 카드 한정).

## 5. 자문

- **code-reviewer 0C/2W/3S (push 승인)**: ① false-positive 0 실추적 확인(few-shot/devInject 정합 + ★commonFields 머지가 오버레이 화이트리스트를 살리는 암묵 결합 발견 — 메모리 후보) ② sticky 헤더 겹침/폭 안전 ③ 등치 불변식 2개 방향 올바름(전체 집합 등치 = 과다·누락 양방향) ④ W1 = defaults.ts 1078줄·tableDescriptors 616줄 비대 → deferred 등재 ⑤ W2 = 5개+ 참조 시 4컬럼 절단로 "필터한 지표가 안 보일" UX → crypto-trader 자문 대상 ⑥ S1 = 가상화 scrollMargin 미세 오프셋(overscan 8 이 흡수, 무해).
- **crypto-trader (컬럼 정책)**: sort-first 권고 채택 / "참조 필드가 곧 컬럼" = 스크리너 투명성 강점 / 분수 % 표시.

## 6. 라이브 G2-b ✅ — 전 게이트 PASS (2026-07-12, playwright + log_chat 박제)

| # | 쿼리 | 결과 |
|---|---|---|
| 1 | "coins with low long short ratio and rising open interest" | ✅ **futures_indicators** + `global_ls_ratio < 1` × `oi_chg_1h > 0` 크로스 필터 + sort oi_chg_1h(log_chat 박제) — 컬럼 = ΔOI 1H(sort 먼저)+GLOBAL, LSR<1 적색 톤. **구 5종 체제에선 disjoint 로 표현 불가였던 조합.** |
| 2 | "top 10 open interest where funding is negative" | ✅ sort OI + predicted_funding 음수 필터 + limit 10 — 컬럼 OI 먼저 + FUNDING 적색. |
| 3 | "all coins with positive funding sorted by OI" (수백 행) | ✅ **가상화 경로 sticky 헤더**(SYMBOL·OI·FUNDING) 표시 = `[10-79]` 라이브 실증. |
| 4 | "top open interest" | ✅ 기존 `open_interest` family + table-card — **통합 오유입 0** (description 변별 작동). |
| 5 | "chart the top trader long short ratio trend" (심볼/마켓 불명시) | ✅ AI 가 **1차 시도부터 symbol+marketType 완비** emit (attempt 1, log_chat) — 스키마+프롬프트가 이끈 최선 결과. 거부→재시도 경로는 단위 테스트 핀. |
| 6 | 회귀 | ✅ kline TradingView 정상(marketType 없이 면제 렌더 = 면제 라이브 실증) + LSR 라인 차트 + 기존 family 표. 저장 뷰 = N/A(저장 뷰 0개 상태 — 스킵 배너 경로는 serialize 테스트 기확인). |

## 6b. Stage 4 완료 선언 🎉 (Composable Expressiveness — AI 계약 축)

**"AI 계약이 Form/Data/Query 자유도를 표현·검증한다"** 4요건 충족으로 Stage 4 완료:
① **style 축** — 카드 레벨 `style.series`(4a, 라이브 실증) ② **스코프 파생 강제** — 단일 대상 카드 marketType/symbol 이 registry(acceptsShapes×table×queryableFields) 파생 superRefine 으로 일반화, self-correction 작동(렌더 가드 2차 강등) ③ **크로스 metric 자유도 + 참조 필드 표시 반영** — 통합 스크리너 + dynamicColumns(표시 = AI filters/sort 파생, 큐레이션 0) ④ **shape 명시 필드 = YAGNI 판정 기록** — component+datasource 선택이 shape 를 결정(acceptsShapes 전부 단일 원소 핀), 도입 트리거는 `[10-106]` 등재.
잔여 원장: `[10-106]`(data.fields 완전판/shape 트리거) · `[3-46]`(연산자 깊은 검증) · kline symbol 미강제(현상 유지) · `[10-107]`(파일 분할) · `[10-108]`(4컬럼 절단 관찰) · `[10-98]`(chartFormat 분할).

## 7. 진행 로그

| 날짜 | Step | 결과 |
|---|---|---|
| 2026-07-12 | 계획 | ✅ plan mode 재진입(상세 실행판) + Explore 정찰([10-79]/저장뷰 격리/채널 공유/kline 면제 근거) + 사용자 결정 3건(컬럼 정책 — ★큐레이션 금지 재강조 = CLAUDE.md 명문화) + 승인. |
| 2026-07-12 | Step 3+4 | ✅ 통합 datasource + 카탈로그/dynamicColumns + [10-79] sticky 헤더. shared 95 / web 458. `634c53f`. |
| 2026-07-12 | Step 5 | ✅ superRefine (3) + dedupe + 테스트 +9(shared 104, false-positive 0). reviewer 0C push 승인. `8510e6a` push. |
| 2026-07-12 | G2-b | ✅ 라이브 전 게이트 PASS(§6 — 크로스 필터 실증/가상화 헤더/오유입 0/스코프 1차 완비) + **Stage 4 완료 선언**(§6b). deferred 회수 5건([10-102a]/[10-91]/[10-78]/[10-79]/[10-104] 잔여) + 신설 3건([10-106]~[10-108]). **사이클 4b = 사이클 4 완결.** |
