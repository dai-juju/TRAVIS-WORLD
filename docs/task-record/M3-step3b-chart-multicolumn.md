# M3 Step 3b — 청산 롱/숏 다이버징 한 차트 ([10-121]) · Phase 2 완결

**Milestone**: M3 "Binance 우주 완성"
**Step**: 3b (사이클 M3-3 Phase 2 — Phase 1 = `M3-step3a-liquidation-series.md`)
**착수일**: 2026-07-20 · **완결일**: 2026-07-21 (라이브 G2 익일 완료 — Vercel 배포 불발 이월)
**상태**: ✅ 완결
**단일 진실**: 본 record + `docs/M3-plan.md §사이클 추적`
**Plan**: `~/.claude/plans/crystalline-scribbling-bentley.md` (사용자 승인 2026-07-20)
**커밋**: `d8031c4`(Step 0 분할) → `3f2598c`(본체 Step 1~4) → `ceb7677`(농도 로그) → `c583ba7`(리뷰 W1·W2) → `d35e757`/`a100070`(G2 서술 보완)

---

## 📖 비전공자 친화 설명

Phase 1(step3a)이 만든 "청산 합산 계산기"는 매번 **롱·숏·합계 3개 숫자를 전부** 돌려주고 있었지만, 화면은 그중 하나만 골라 그릴 수 있었습니다. 이번 작업은 **주방(DB·워커)을 전혀 안 건드리고** 화면이 롱(위)·숏(아래)을 한 차트에 마주보게 그리게 했습니다.

왜 마주보게 그리나 — 청산의 진짜 신호는 절대량이 아니라 **롱:숏 비대칭의 전환**인데, 롱 카드·숏 카드를 따로 띄우면 y축 자동 스케일이 서로 달라 "롱 $30M vs 숏 $2M"이 비슷한 높이로 보입니다(**못 보는 것보다 나쁜 오독** — crypto-trader 07-19 판정). 한 차트에서 y축을 공유하면 비대칭이 실제 비율로 보입니다.

시작 전에 커진 파일 2개(chartFormat 579줄 / ChartCard 457줄)를 서랍별로 정리(Step 0)해 놓고 새 로직을 부었습니다 — 두 번 미루면 죽는 규약([10-98])의 이행이기도 합니다.

---

## 🔒 큐레이션 금지 준수 (사용자 재강조 2026-07-20 반영)

> "이런 데이터 → 이런 카드 식 하드코딩은 안 됩니다. 유저의 요청에 따라 표현돼야 함."

| 축 | 결정 주체 | 통로 |
|---|---|---|
| 다이버징 / 합계 / 롱만 / 숏만 | **AI** | `style.breakdown` + `filters side=` (`resolvePlotSpecs` 진리표) |
| 시간창 | **AI** | `filters bucket_time 범위` → `resolveChartTimeRange` |
| 버킷·기간·심볼·전시장 | **AI** | Phase 1 그대로 |
| 성분의 색·라벨·대향 배치·툴팁 포맷 | 코드(descriptor) | "어떻게 그릴지"만 소유 |

`breakdown.default: "components"` 는 **AI 명시값이 오면 무조건 물러나는 폴백** — `opts.styleBreakdown ?? b.default` 순서가 테스트로 핀됨. G2 에서 AI 가 `total`/`side` 를 명시하자 즉시 그 형태로 갈렸다(아래 게이트).

---

## ✅ Step 0 — 파일 분할 (`d8031c4`, 순수 이동 · [10-98]/[10-120]① 회수)

- `chartFormat.ts`(~579줄) → `chart/` 6모듈: `time`(interval·formatChartTime) / `align`(buildAlignedData·다운샘플) / `theme`(색·var 쌍둥이) / `axisMeasure`(AXIS_FONT export 승격 — 측정↔렌더 커플링 모듈 경계 유지) / `plugins`(midline·tooltip) / `options`(옵션 조립). **chartFormat.ts = barrel 재export** → 기존 import 경로 전부 보존.
- `ChartCard.tsx`(457줄) → `useChartScope`(AI 계약→축 번역, registry 파생 묶음) + `useChartFreshness`(freshness·부분결측) + `ChartStatusOverlay`(오버레이 3겹 JSX). `resolveChartSymbols` 는 ChartCard 재export 로 테스트 무변경.
- **검증 = 기존 테스트 무수정 510 green** + type-check + lint. 거동 변화 0.

## ✅ Step 1~3 — breakdown 계약 + 픽셀 + 배선 (`3f2598c`, 원자 배포 한 커밋)

- **계약**: `cardStyle.ts` 에 `style.breakdown: "total"|"components"` 가산 (describe = 기능 사실만). `bucket_time` 연산자에서 `"="` 제거(RPC 등치 인자 부재 = 광고하면 silent-wrong — `symbol contains` 선례). 정확값 핀 [불변식 4g] 신설.
- **descriptor**: `breakdown`(성분 컬럼·라벨=liqSideLabel 단일진실·direction·invert) + `tooltipMeta`(event_count "N events") + `disclosureShort`("Lower bound · sampled feed") + `formatAxisValue`(축 1자리) 4필드 가산 — 기존 7종 무변경.
- **`resolvePlotSpecs` 진리표** (4b dynamicColumns 의 차트판): breakdown 미선언→단일(기존 불변) / side 필터→단일(subset 이 이미 좁힘) / 오버레이→total 폴백(2심볼×2성분 판독 불가 — form 픽셀 정책, 스키마 describe 에 광고) / AI 명시 ?? 도메인 기본.
- **`buildAlignedData` 다중 필드 + invert**: 숫자만 `-v`, **null 은 null 그대로**(gap — "0으로 plot 금지" 무충돌). 인덱스 단위 일괄 결정 구조 유지 + null 꼬리 x↔y 길이 핀.
- **렌더**: 다이버징 = 숏 음수 반전 + **y축 공유 단일 스케일**(별도 축 기각 — 오독 재생산). components 는 bars 유지(stepped 전환은 오버레이 대책 한정) + 시리즈 색=방향색(`directionStroke`/`directionStrokeVar` 캔버스↔범례 쌍둥이, UI-3 2색 예외의 본래 용도) + disp.fill 부호색 강제 off(invert 음수는 표시층 대향이지 방향이 아님) + midline 0 파생(원본 descriptor 불변 — style override 선례 동형) + 축 `Math.abs`(아래 막대는 음수 금액이 아니다).
- **툴팁**: invert **원값 복원**("-$1.2M" 거짓 함의 차단) + "N events" 병기. ★ 카운트는 Map 직캡처가 아닌 **getter**(ref+useEffect) — uPlot 옵션은 생성 시에만 읽히는데 데이터는 주기 pull 갱신이라 Map 캡처는 첫 fetch 값으로 stale 박제된다.
- `seriesKey` 에 breakdown 모드 승계(total↔components 전환 재생성 보장).

## ✅ Step 4 — 시간축 범위 필터 배선 ([10-120]②, 같은 커밋)

- `resolveChartTimeRange`(카드 층 순수 함수): `>=`/`>`→from(max=교집합) / `<=`/`<`→to(min). `>`·`to` 경계는 ≤1버킷 inclusive 근사(주석 명시).
- `fromIso/toIso` 관통: types→훅(deps 포함)→seriesFetch — **rpc 경로** `p_from/p_to` 직결(rpcSpec 매핑 기존재 — 마지막 한 뼘) + **table 경로** gte/lte RangeFilter 가산 = **history 6종 `recorded_at` 선재 갭 동시 해소**. fromIso > lookbackMs 우선.
- 근거: `[10-81]` 현재시각 주입으로 AI 시간창 emit 증가 — G2 에서 실제로 상대시간("last 24 hours")까지 절대 필터로 emit 하는 것 실측.

## ✅ Step 5 — [10-83] UX 결정 3건 (`ceb7677`, 사용자 결정 2026-07-20)

| # | 결정 | 처분 |
|---|---|---|
| ① 농도 포화 | **로그 스케일 채택** | `liqNotionalIntensity` 선형(n/5M)→log1p — $1K≈0.45/$100K≈0.75/$1M≈0.90/$5M+=1.0(포화 앵커 유지). feed·table 동시 반영(시맨틱 단일진실). 핀 테스트 4건 |
| ② VALUE 맨 오른쪽 | **기존 충족 확인 = no-op** | `tableDescriptors` 실측: SYMBOL\|TIME\|SIDE\|VALUE — 이미 맨 오른쪽 |
| ③ tape 심볼 위치 | **현행 유지** | 시각\|배지\|심볼\|금액 — 실사용 불편 미실증이라 유지 |

**+ 다이버징 기본 거동 사용자 확정**: side·style 생략 = 다이버징(기존 저장 뷰 청산 차트도 배포 후 전환) — step3a 계약 설계값 그대로.

## 🔍 code-reviewer (2026-07-20) — Critical 0 / W1·W2 반영 (`c583ba7`)

- **W1 시간창 무음 절단**: fetch 두 경로 모두 "창 안 최신 N"(DESC limit)이라 AI 시간창 > limit×interval 이면 창 앞부분이 조용히 잘림 — [10-120]② 배선이 연 신규 표면. → `isSeriesWindowTrimmed` 순수 함수 + subtitle "· window trimmed — latest N points" 온카드 고지 + 테스트 4케이스.
- **W2 오버레이 무음 강등**: 오버레이 진입 시 명시 `breakdown:"components"` 의 total 폴백이 스키마에 미광고 → describe 에 "Ignored when multiple symbols are overlaid" 광고(AI 예측 가능).
- S1(to 경계 주석)·S4(getter 생명주기 무결 확인)·S5(seriesKey 커버리지 충분 확인). 리뷰어 총평: dataService 우회 0 / 큐레이션 경계 준수 / invert 누수 전 표면 차단 확인.

---

## ✅ 라이브 G2 (2026-07-21, travis-web.vercel.app)

### 🔴→✅ G2 착수 장애 — Vercel Git 자동배포 불발 (코드 무관)

07-20 push(5커밋)에 대한 배포가 **아예 생성되지 않음** — 빌드 실패가 아니라 Git 연동 트리거 불발(로컬 `pnpm -F web build` 정상 + `vercel ls` 최신 배포가 2일 전 = step3a 세션분. 실패 시 구 배포가 조용히 서빙되는 `feedback_lockfile_sync_on_manifest_edit` 계보의 **트리거 부재판**). → `vercel link` + `vercel deploy --prod` CLI 수동 배포로 해소. **07-21 push 부터는 자동배포 정상 복귀 실측**(일시 장애 추정) — 교훈: G2 착수 전 "화면이 신 빌드인가"를 축 포맷 같은 결정적 마커로 먼저 확인.

### 게이트 결과

| # | 게이트 | 결과 |
|---|---|---|
| G2-1 | **다이버징 기본 실증** | "Chart BTCUSDT liquidation volume over the last 24 hours"(side·style 무언급) → 롱(위·vermilion)/숏(아래·teal) 대향 + y축 공유(숏 $15M 급증이 실제 비율로) + 범례 LONG/SHORT LIQ + 0 기준선 + 축 절대값 1자리 + 짧은 고지 |
| G2-2 | **3형태 AI 자율 분기** | side=SELL("only long...") → 단일 중립 렌더 + AI 자작 부제 "SELL-SIDE (LONG POSITIONS FORCE-CLOSED)" / breakdown=total("one combined series") → 합계 단일 / 생략 → 다이버징. **매핑 규칙 0** — 단 emit 신뢰도 이슈 별건(아래) |
| G2-3 | **시간창 실반영** | "between 12:00 and 20:00 UTC today" → AI 가 `bucket_time >=/<=` 절대 필터 emit → x축 정확히 12:00~19:55(20:00 미만 = to 경계 정직). **상대시간("last 24 hours")도 [10-81] 주입 기반 절대 필터로 emit 실측** |
| G2-4 | **오버레이 폴백** | 코드 경로 = 단위 진리표 핀(오버레이→total·stepped 미발동). **라이브 미실증** — AI 가 오버레이 계약 자체를 3/3 미emit(아래 [10-122]) |
| G2-5 | **툴팁 + DB parity** | hover 툴팁 "LONG LIQ $365.8K / SHORT LIQ **$1.56M**(양수 = invert 원값 복원) / **534 events**" ≡ 독립 SQL(365,767.6 / 1,557,214.2 / 534) **완전 일치** |
| G2-6 | **회귀 0** | OI 차트 완전 기존 거동(area·모노크롬·raw 축·고지 없음·범례 없음). 콘솔 신규 에러 0(잔존 = 기존 /api/views 404 + 네트워크 순단 — 순단 중 rpc 실패를 훅 soft-fail 이 흡수해 차트 유지 = graceful 부수 실증) |

### ★ AI emit 신뢰도 — miss 3건 실측과 처방 (`d35e757`/`a100070`)

렌더·pushdown·parity 는 계약대로 전부 정확했으나, **AI 가 계약을 안 내는** miss 가 5쿼리 중 3건:

| miss | 증상 | 처방 | 재검 |
|---|---|---|---|
| ① side 누락 | "only long liquidations" 인데 filters null → 제목 "Long" + 렌더는 다이버징 | datasource description 에 side 필터 통로 명시 | ✅ **성공** (plain 문구로 side=SELL emit) |
| ② breakdown 누락 | "one combined series" 인데 style null → 다이버징 | ★ 근본 = **AI 가 도메인 기본(다이버징)을 모름** — descriptor 기본값은 코드 소유라 미노출 → AI 는 "생략=total" 로 합리 추론. description 에 기본 렌더 **사실** + total 통로 1문장 고지 | ✅ **성공** (`style:{breakdown:"total"}` emit) |
| ③ 오버레이 symbol in 누락 | "compare BTC and ETH in one chart" 인데 symbol=BTC 단독 → 제목 "BTC vs ETH" 와 불일치 | description 에 `symbol in [...]` 비교 통로 명시 | ❌ **3/3 지속 miss** → `[10-122]` 등재(관찰) |

처방은 전부 **통로의 존재 사실 서술 완결**(쿼리→값 매핑 아님 — `feedback_llm_declared_contract_nondeterminism` 계보). ②의 교훈이 일반화 가치가 큼: **코드 소유 도메인 기본값이 AI 의 "생략" 의미를 뒤집을 때는 그 기본값을 description 에 사실로 고지해야 한다** — 안 하면 AI 는 자연 의미론("생략=중립")으로 추론해 제목↔렌더 불일치를 만든다.

---

## 🧭 crypto-trader 사후 자문 (2026-07-21, advisory only — 코드+G2 기록 기반)

- **배치 판정**: 현행 롱=위/vermilion 이 CoinGlass 등 관행 정합 + **색이 이미 방향 1차 신호**라 상하 재배치 실익 없음 — 변경 근거 못 찾음.
- **로그 농도**: $1K≈0.45 는 스캘퍼에겐 잡청산 과대 존재감 우려(스윙은 반대로 이득) — 하한 앵커($100~500) 상향으로 저역만 누르는 처방 후보, 실측 선행 → `[10-120]`⑥(f).
- **"N events" 판정**: 매우 유용 — "$10M 이 1건 고래냐 534건 연쇄냐"는 같은 금액도 시장 의미가 정반대. sampled 하한기호("534+") 병기 검토 → ⑥(h).
- **"window trimmed" 문구**: "earlier points hidden" 처럼 잘린 쪽 명시가 오인 여지를 줄일 가능성 → ⑥(g).
- **★ 다음 사이클 입력**: **x축 시간 정렬(OI↔청산 동시성)을 최상위 후보로 강하게 재지지** — "롱청산 폭발+OI 급감 동시 = 진짜 디레버리징 / OI 유지 = 신규 진입이 받아냄 = 바닥 신호". 단 카드 간 동기화는 새 인터랙션 축이라 scope 큼(roadmap-mgr 위임 대상). ※ 예약된 다음 사이클은 린 워커 위생 — x축 정렬은 그 다음 표현력 후보 입력으로 존치.

## 📁 관련 파일

**신규**: `apps/web/lib/cards/chart/`(time·align·theme·axisMeasure·plugins·options·plotSpec) · `useChartScope.ts` · `useChartFreshness.ts` · `ChartStatusOverlay.tsx` · 테스트(`useChartScope.test` · `liquidationSemantics.test`)
**수정**: `chartFormat.ts`(barrel) · `ChartCard.tsx` · `chartDescriptors.ts` · `liquidationSemantics.ts` · `packages/shared/src/{schemas/cardStyle.ts, registries/defaults.ts}` · `dataService/{types,useDataServiceSeries,seriesFetch}.ts` + 테스트 4종
**SQL/워커**: 무변경 (Phase 1 RPC 가 3컬럼 기반환 — 계약 설계가 미래 비용을 선지불한 실증)

## 🔗 링크

- **이전(Phase 1)**: `M3-step3a-liquidation-series.md`
- **다음(예약)**: 린 워커 위생 사이클 — `[10-117]`+`[10-110]`(Step 0 강제)+`[10-118]` 차선책(refresh 24h→1h), **`[10-86]` 제외**(M5 스케일 항목 — scope creep 방지, 사용자 확정 2026-07-20)
