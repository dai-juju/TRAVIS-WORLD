# M2 사이클 5 — Stage 1b (BigValue/Detail 일반화) = 격자 완성 게이트 — task-record, 단일 진실

> **상태**: 🔄 **진행 중 (2026-07-14 착수)** — Step 1 ✅ / Step 2~5 대기.
> **확정**: 사용자 확정 2026-07-13 (계획 세션) + 2026-07-14 착수 세션 plan mode 승인. 착수 가이드 = `M2-composable-expressiveness.md §11 항목 7` + `ROADMAP.md §▶ 다음 확정`.
> **목표**: 마지막 데이터-잠금 카드 2종(`ticker-card` 391줄 하드코딩 / `indicator-card` 320줄 절반 일반화)을 모양-제네릭 **BigValueCard**(대표값 강조) / **DetailCard**(전 필드 리스트)로 수렴. 레시피 7벌 × form 2 = 14칸 동시 개방("BTC open interest as big number" = PRD §2 비전 문장 실현). `[10-74]`(단일심볼 descriptor 이중화) 흡수 해소. **완료 시 "격자 완성"(데이터-잠금 부채 0) 선언 → 타 거래소·뉴스·ff#3 개방 재논의.**

---

## 0. 한 줄 요약 (비전공자용)

> **"카드를 '그릇(형태)'과 '음식(데이터)'으로 분리하는 작업의 마지막 회차. 표·차트·피드 그릇은 이미 완성됐고, 남은 두 개 — '큰 숫자 카드'와 '상세 지표 카드' — 가 아직 특정 음식 전용이다. 이 둘을 어떤 데이터든 담는 그릇으로 다시 만들면, '무슨 데이터든 × 무슨 형태든' 격자가 완성된다."**

---

## 1. 사용자 확정 결정 3건 (2026-07-14 착수 세션)

1. **kline-chart-card = 의도된 예외 인정** — PRD §5 차트 정책(가격 캔들 = TradingView 임베드 우선)에 근거한 특화 렌더러. 드리프트(실수)가 아니라 정책적 예외로 명시 분류 → 격자 완성 선언 가능. (자체 metric 차트는 chart-card 가 담당.)
2. **저장뷰 = 전체 삭제** (Stage 1 선례) — Step 4 에서 현재 saved_views 내용 SELECT → 사용자 보고 → `WHERE user_id` 명시 DELETE. 잔존 옛 id 는 기존 graceful-skip 안전망.
3. **scalar shape = record 로 흡수** — "큰 숫자 하나"는 데이터 모양이 아니라 표현 강조(descriptor 의 role 축)다. BigValue 도 `acceptsShapes:["record"]`. scalar enum 은 삭제하지 않고 "진짜 단일값 datasource 등장 시 활성"으로 판정 박제(Step 4 에서 shapeKind.ts 주석). ★ ROADMAP §▶ 다음 확정의 "BigValue[scalar]" 표기는 이 결정으로 **record 로 정정**됨 (본 문서가 정정 기록).

## 2. scope 차단선 (roadmap-mgr 2026-07-14)

- ✅ IN: record 서빙 7종(티커 2 + 지표 5) × 2 form / `[10-74]` 흡수 / 원자적 스왑(등록+폐기 한 커밋) / 라이브 G2(직교 교차 실증 포함).
- ❌ OUT: `[10-107]` defaults.ts 분할(회수 조건 = 타 거래소/뉴스 대규모 확장 — 이번 아님, 격자 완성 후 OKX 선행 게이트로 예약) / symbols_meta pack(Step 4 에서 deferred 신설 예정) / scalar 전용 datasource 신설 / 히트맵·게이지(완성이 아닌 확장) / `[10-109]` UTC UX 3건(G2 합격조건 아닌 병행 관찰).
- `[10-99]` UTC 라이브 확인 4항목은 Step 5 라이브 세션에 **동반 확인**(합격조건과 분리).

## 3. Step 분해 (5-step, 승인된 계획 — plan 파일 `enchanted-hugging-starlight.md`)

| Step | 내용 | 핵심 검증 |
|---|---|---|
| 1 ✅ | 통합 record 계약 + pack 7벌 + tone 헬퍼 이동 | 화면 무변경 · 불변식 12 테스트 |
| 2 | 공유 엔진 훅(useSingleRecord/useReconnectIndicator) + BigValueCard (미등록) | TickerCard 능력 무회귀 이식 |
| 3 | DetailCard (미등록) | 지표 5 pack = 옛 IndicatorCard 동일 출력 |
| 4 | 원자적 스왑 — 등록+폐기+마이그레이션+저장뷰 (한 커밋) | 3-자문 0C · 옛 id grep 0 |
| 5 | 라이브 G2 (Vercel) | site=DB + 직교 교차 1+ + 회귀 0 → 격자 완성 선언 |

---

## 4. Step 1 ✅ — 통합 record 계약 + pack 7벌 + tone 헬퍼 이동 (2026-07-14, 화면 무변경)

**무엇을 만들었나** (recordDescriptors 는 아직 어떤 컴포넌트도 미소비 = 화면 0 영향):

- ➕ `apps/web/lib/cards/marketSemantics.ts` (~90줄) — `MetricTone`/`signTone`/`midlineTone`/`asFuturesMarketType`/`basisQuoteForMarketType`/`IndicatorRow` 를 indicatorDescriptors.ts 에서 **이동**. 이유: indicatorDescriptors 는 Step 4 삭제 예정 — 삭제될 파일이 공유 시맨틱(소비처 4곳: tableDescriptors/feedDescriptors/liquidationSemantics/tableCardFormat)의 원천이면 안 됨.
- ✏️ `indicatorDescriptors.ts` — 이동분을 import + **re-export** 로 전환(과도기 호환 — 소비처 4곳 + IndicatorCard 코드 0줄 변경). Step 4 삭제 시 잔여 소비처의 MetricTone import 를 marketSemantics 로 일괄 재지향.
- ✏️ `tableDescriptors.ts` — import 경로만 marketSemantics 로 전환.
- ➕ `apps/web/lib/cards/recordDescriptors.ts` (~490줄) — **단일-record form 의 통합 계약 + pack 7벌**:
  - `RecordField{key, label, value(row,meta?), tone?, intensity?, role?, hint?, hintTitle?}` + `RecordDescriptor{kicker, defaultTitle(문자열|함수), watchColumns?, flashField?, fields}` + `RECORD_CONSUMES_SHAPE="record"` + `defineRecord<Row>` 타입 erasure(테이블 계약 동형).
  - **role 축 (핵심 설계)**: `primary`(대표값)/`badge`(테두리 뱃지)/`secondary`(보조 라인)/`detail`(Detail 전용) — **form 별 descriptor 맵을 만들지 않고**(그러면 [10-74] 가 3중으로 회귀) 두 form 이 같은 pack 을 role 로 다르게 소비. role 은 "이 데이터에서 무엇이 headline 인가"라는 의미까지만, 픽셀(px/뱃지 형태)은 form 소유 — tone/intensity 직교 원칙의 확장.
  - pack 7벌: **티커 공유 1벌**(now_spot_ticker/now_futures_ticker — last_price=primary+flashField / 24h%=badge / range·vol5m(approx)=secondary / 1h변화·open·VWAP·거래량 2종·체결수=detail 순증) + **지표 5벌**(옛 INDICATOR_DESCRIPTORS 라벨/포맷/tone verbatim 이관 + role 태깅: 각 pack 의 옛 primary:true → role:"primary").
- ➕ `__tests__/recordDescriptors.test.ts` — **불변식 12 테스트**: key 7종 등록 정합 / ★shape 정합(pack 보유 ds 전부 servableShapes∋record) / ★역방향(record 미서빙 ds 는 pack 부재 — liquidation·futures_indicators·kline 오추가 시끄럽게) / fields·watchColumns·flashField ∈ 물리 컬럼 / pack 당 primary 정확 1 / label 유일 / 지표 watchColumns 필수·티커 생략 박제 / per-datasource 픽스처 graceful / 티커 null→"—"·neutral / defaultTitle 해석 / self-gate 거울.

**설계 결정 3건 (구현 중 확정)**:
1. **티커 pack watchColumns 의도적 생략** — 티커는 전용 테이블(공유 테이블 fan-out [10-7] 부재)이고, watchColumns 를 걸면 가격 정지 심볼의 `updated_at` freshness 가 push 생존 신호(brownout 방어)를 잃는다(옛 TickerCard = watchColumns 없음 거동 보존). 지표 5벌은 필수(공유 테이블) — 테스트로 양쪽 박제.
2. **★ 불변식 기준 = "같은 물리 table 공유 datasource 들의 queryableFields union"** — 최초 "자기 datasource queryableFields" 기준이 **basis pack 의 Mark/Index price 를 적발**: queryableFields 는 AI 필터/정렬 노출 계약이고, 표시 계층은 같은 물리 행(now_futures_indicator)의 동반 컬럼을 무료로 읽는 것이 옛 IndicatorCard 부터의 정당한 표시. table 단위 union = 물리 컬럼 진실의 근사 — 오타/삭제 drift 는 여전히 어느 union 에도 없어 시끄럽게 실패.
3. **defaultTitle 함수형 허용** — 티커의 자연 타이틀 = symbol (`(ctx:{symbol?})=>ctx.symbol ?? "Ticker"`). descriptor 순수성 유지(config 타입 미의존, 최소 ctx). `resolveRecordTitle` 공용 헬퍼 동봉.

**G2 고지 대상 (미세 의도 변경)**: 티커 pack 에 kicker "TICKER" 기본값 신설 — 옛 TickerCard 는 config.kicker 없으면 kicker 미표시. AI 가 통상 kicker 를 채우므로 실노출 드묾, Step 5 라이브에서 확인.

**검증**: 신규 13 테스트(12 + 등가 1) + **web 전체 478 green(465+13, 회귀 0)** / 6패키지 type-check clean / ESLint exit 0 / recordDescriptors 미소비 = 화면 무변경.

### 4a. code-reviewer 자문 (2026-07-14) — **0 Critical / 4W / 3S**

- **W1 즉시 반영 — 티커 공유 pack 의 COINM `volume` 단위 오표기 위험 (위생 #9)**: registry 정의상 `volume` 은 USDM/spot=base 수량, COINM=**계약 수**(+ COINM `quote_volume`=NULL) — "Base volume (24h)" 고정 라벨이면 COINM Detail 에서 계약 수가 base 수량인 척 표시. → 라벨 "Volume (24h)" 중립화 + 값에 단위 명시(COINM `N contracts` / USDM meta.base_asset 라벨). 옛 카드엔 없던 순증 필드라 회귀 아님 — 폼 등장 전 선제 차단. Step 5 G2 에 **COINM 티커 Detail site=DB 대조** 추가.
- **W2 반영 — `$` 접두·단위 없는 금액의 표면 확대**: Detail 순증 필드(open/VWAP/quote_volume)가 비 USD-quote 페어에서 `$` 오표기·단위 미표기 — 기존 한계([3-54] quote_volume_usd)의 표면 확대. → `[3-54-원본]` 에 "record pack 도 회수 시 함께 정공" 1줄 등재.
- **W3 즉시 반영 — 과도기 기계적 등가 테스트**: "verbatim 이관"을 사람 눈이 아닌 equality 로 박제 — 옛 INDICATOR_DESCRIPTORS ↔ 새 RECORD_DESCRIPTORS 를 지표 5 pack × 필드별로 value(meta 유무 양쪽)/tone/라벨 순서/primary↔role 비교(+1 테스트). **옛↔새가 한 코드베이스에 공존하는 지금만 가능한 검증** — Step 4 옛 파일 삭제 시 함께 제거. 메모리 신설.
- **W4 보류 — recordDescriptors.ts ~520줄**: 선언적 데이터 40%+, 스파게티 아님. pack 증가 시 티커 pack 분리 검토 ([10-107] 동류, 낮은 우선순위).
- **S1 (기록)**: union-by-table 불변식은 같은 테이블 6종 datasource 의 어느 컬럼에든 매치되는 오타는 통과 — 더 강한 대안(pack 별 companionColumns allowlist)은 YAGNI, Step 4 등치 테스트와 함께 재검토. **S2 (Step 2 확인 항목)**: form 헤더 조립 순서 `config.title ?? resolveRecordTitle(...)` 준수 확인. **S3 (관찰)**: role=primary 는 descriptor 소유 — 향후 "마크가를 크게" 류 요청 시 AI style 축의 primary 오버라이드 여지([10-101] 계보), 지금 조치 불필요.
- 리뷰 확인 사항: 순환 import 없음(marketSemantics=리프 모듈) / 이관 충실성 수동 대조 동등(→ W3 로 자동 박제) / 하드매핑·큐레이션 없음 / graceful 전 경로.

**다음 = Step 2**: `useSingleRecord`/`useReconnectIndicator` 공유 엔진 훅 + BigValueCard (미등록). 확인 항목 = S2(타이틀 조립 순서).

---

## 5. Step 2 ✅ — 공유 엔진 훅 + BigValueCard (2026-07-14, 미등록 = 화면 무변경)

**무엇을 만들었나** (grep 검증: 자기+테스트만 참조 = 완전 격리):

- ➕ `apps/web/lib/hooks/useSingleRecord.ts` — 단일-record 데이터 엔진. 옛 TickerCard/IndicatorCard 의 동형 중복(~120줄×2: match 콜백 + initialFetch EqFilter 조립 + 경로 A selector + useDataServiceRow + useLoadingTimeout)을 1곳으로 이식. 새 form 2개가 또 복제하면 4중이 될 것을 차단.
- ➕ `apps/web/lib/hooks/useReconnectIndicator.ts` — 옵션 C 재연결 상태기계 verbatim 이식(render-phase 조건부 setState = `feedback_react_hooks_dual_rule_render_setstate` 패턴, W2 가드·5초 유예 포함).
- ➕ `apps/web/lib/cards/recordCardFormat.ts` — form-side 픽셀 순수 함수(toneColor/rawNumber/defaultRecordSubtitle) — tableCardFormat/chartFormat 과 같은 층.
- ➕ `apps/web/components/cards/BigValueCard.tsx` — **모양-제네릭 대표값 강조 form**. 기존 3 form 의 6단계 골격 준수(registry 게이트 + !descriptor 방어선 2중 / config 우선 ?? descriptor 안전망 [S2 순서 준수] / graceful 분기 = 공유 StatusLine/LoadingOrStale). role 소비 = 파일 헤더 규약: primary(huge 48px + flashField raw flash) / badge(테두리 뱃지, 표시문자열 변경 flash·방향 raw = 옛 ChangeBadge) / secondary(mono 라인 + hint 뱃지) / detail(skip — Detail form 소관). `BigValueBody` 순수 표시 export = 테스트 표적.
- ➕ `__tests__/BigValueCard.test.tsx` — role 구동 렌더 5 테스트: 티커(huge $/badge %/range/vol5m approx + detail skip) / premium_index(Funding primary + Mark/Index skip) / **open_interest("OI as big number" — PRD §2 비전 문장의 단위 테스트 실증)** / hint tooltip / null sparse graceful.

**G2 고지 대상 (의도 변경 — Step 5 에서 확인)**: ① primary 위 라벨 신설(티커 "Last price" — 옛 카드는 무라벨 huge) ② badge 0%=neutral(옛 >=0=teal — Stage 1 표와 동일한 의도 개선) ③ 상태 스텁 공유 컴포넌트 통일(문구 미세 차이) ④ range 라인 "24h range" 라벨 프리픽스 ⑤ 티커 kicker 기본 "TICKER"(Step 1 기재).

**검증**: 신규 5 테스트 + **web 전체 483 green(478+5, 회귀 0)** / type-check / ESLint 0(render-phase setState·ref+classList 패턴 통과) / 미등록 = 화면 무변경.

### 5a. code-reviewer 자문 (Step 2) — **0 Critical / 2W / 3S**

- **W1 (Step 4 규율로 승계) — 추출-훅 과도기 3중 중복**: 훅으로 뺐지만 옛 두 카드는 인라인 복제본을 여전히 보유(옛 2 + 훅 1). **규율: Step 4 전까지 옛 TickerCard/IndicatorCard 의 데이터 엔진 동결(수정 금지)** — 훅에만 고치면 카드별 거동이 갈림. Step 4 삭제가 이 부채를 닫음.
- **W2 (Step 4 필수 항목) — 등치 불변식은 양방향으로**: BigValue 는 옛 IndicatorCard 에 없던 registry dataShapes 게이트가 새로 붙음(의도된 강화 — 권한 진실 = registry). Step 4 에서 `dataShapes 키집합 ≡ RECORD_DESCRIPTORS 키집합` 을 **양방향 toEqual** 로 박아야 함 — 단방향(⊆)이면 "registry 누락 → 조용한 coming-soon" drift 못 잡음(`feedback_compat_invariant_overtag_blindspot` 계보).
- **S2 즉시 반영 — null 갭 유령 flash 제거**: 값이 `2.3%→null→2.5%` 로 돌아올 때 stale prev 와 비교해 유령 flash 1회 — 옛 ChangeBadge 잠복 미세 버그. null 분기에서 prevRef 리셋(PrimaryValue/RecordBadge 대칭 적용).
- **S1 보류**: BigValueCard 344줄 — 옛 두 카드(392/321줄)와 관례 일관, 분리는 낮은 우선순위. **S3 확인**: React 19 규칙(render-phase setState 훅화·ref+classList·deps) 전부 유효, deps 는 오히려 개선.
- 리뷰어 위임 제안: 의도 변경 5건의 유저 체감 판정 + "OI as big number" 도메인 타당성 = **Step 5 에서 crypto-trader + crypto-domain-expert** (계획과 일치).

---

## 6. Step 3 ✅ — DetailCard (2026-07-14, 미등록 = 화면 무변경)

- ➕ `apps/web/components/cards/DetailCard.tsx` (~220줄) — **모양-제네릭 전 필드 리스트 form**. BigValueCard 와 동일 골격(게이트 2중/엔진 훅/옵션 C/공유 상태 스텁/S2 타이틀 순서) + 본문 = `DetailBody`: **전 role 필드를 선언 순서대로** MetricLine 렌더(primary=serif 32px 큰 줄 / 나머지=label·value 양끝 mono — 옛 IndicatorCard MetricLine 이식) + hint 뱃지 지원(티커 vol 5m approx 가 Detail 에서도 유지).
- ➕ `__tests__/DetailCard.test.tsx` — 5 테스트: **premium_index 라벨 순서가 옛 IndicatorCard 와 동일**(값 층위 등가는 recordDescriptors 등가 테스트가 이미 박제 — 구조 층위 보완) / primary serif 강조 / **티커 Detail 전 10 필드**(BigValue 가 skip 하는 detail 포함 — 신규 조합 "BTCUSDT 24h stats" 실증) / hint tooltip / sparse graceful.
- **검증**: 신규 5 테스트 + type-check/ESLint 0 + 미등록 격리. 전체 회귀는 Step 2+3 묶음 커밋 전 일괄(§6a).

**다음 = Step 4**: 원자적 스왑 — big-value-card/detail-card 등록 + 옛 2 카드 폐기 + shapeKind scalar 주석 + buildSystemPrompt + fixture sweep + **양방향 등치 테스트(W2)** + 저장뷰 확인→보고→삭제.
