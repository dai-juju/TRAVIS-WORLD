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

---

## 7. Step 4 ✅ — 원자적 스왑 (2026-07-14, 한 커밋 = AI 신·구 공존 창 0)

**등록 (registry 양쪽)**:
- `defaults.ts`: 옛 2 등록 제거 → **big-value-card / detail-card** 등록. dataShapes = record 7종 union(requiredFields 옛 두 카드 verbatim 승계), acceptsShapes ["record"], subscribesByTopic true, value 모드. detail defaultSize=md(전 필드 10줄). **superRefine/렌더 게이트/AI 프롬프트 = 스키마 코드 0줄 자동 파생** (Stage 1 과 동일한 확장성 실증).
- description = **ai-orchestrator-specialist 자문 반영**: 유스케이스 경계("ONE metric at a glance" ↔ "full breakdown of ALL fields") + **상호 참조**(형제 카드 배제 유도) + 키워드 hint 1줄(공통 용어, 규율 내). ★자문 판정: 혼동 쌍(같은 record 7종을 받는 두 form)은 few-shot 앵커링이 한쪽으로 쏠리면 안 됨 → **single-symbol-detail 예시 신규 추가**(premium_index — big-value 예시와 짝으로 "같은 데이터 우주, 명시 단서에 따라 다른 form" 시연, 6→7 예시).
- `registerCards.ts` React 맵 스왑(`feedback_registry_react_ai_sync`) + kline-chart-card "의도된 예외(PRD §5)" 주석 명문.
- `shapeKind.ts`: scalar 판정 박제(사용자 결정 1번 — "record 로 흡수, 진짜 단일값 datasource 등장 시 활성").

**폐기**: 🗑️ TickerCard.tsx(392) / IndicatorCard.tsx(321) / indicatorDescriptors.ts(재-export 껍데기) / indicatorDescriptors.test.ts. MetricTone/IndicatorRow 소비처 4곳(feedDescriptors/liquidationSemantics/tableCardFormat/tableDescriptors.test) import → marketSemantics 재지향. recordDescriptors.test 의 과도기 등가 describe 도 함께 제거(옛 파일과 한 몸 — `feedback_migration_coexistence_equality_test` 규칙 1호 이행).

**불변식 갱신**:
- recordDescriptors.test: **양방향 등치**(descriptor keys ≡ 두 form dataShapes, toEqual — Step 2 W2 이행) + shape 등치(RECORD_CONSUMES_SHAPE ≡ acceptsShapes) 가산.
- renderableDatasource.test: 렌더 매트릭스 정확값 핀 **옛 7쌍 → record 14쌍** 의도 갱신(= "격자 14칸 개방"의 스냅샷 증명) + 폐기 id graceful false 안전망 박제.
- fixture sweep 16파일: componentId 스왑 + ★reject 픽스처 의미 보존 교체("ticker-card+open_interest" 는 big-value 가 이제 정당 지원 → "feed-card+open_interest" 로 — Stage 1 선례) + 현재형 주석 갱신(이력형은 보존 — `feedback_module_deletion_stale_rationale_comments` 분류 적용).

**저장뷰 (사용자 결정 2번)**: SELECT 실측 = **0 행 — 삭제할 저장뷰 없음** (DELETE 불필요, 잔존 옛-id 안전망은 graceful-skip 테스트로 박제).

**검증**: shared 104 / **web 483 green**(488−삭제 7+신설 2, 회귀 0) / 6패키지 type-check / ESLint 0 / 옛 id 기능 참조 grep 0(잔존 = 이력형 주석·의도된 안전망 테스트만).

### 7a. 자문 2종 (Step 4) — **둘 다 0 Critical**

- **zod-schema-architect — 전 항목 PASS**: ① superRefine 4블록 자동 편입 실코드 추적 확인 — 특히 **detail-card × basis(경로 B)도 commonFields 머지 덕에 블록(3)이 marketType+symbol 강제**(`feedback_commonfields_merge_overlay_coupling` 계보의 순기능 방향), 2.5↔3 중복 issue 는 dedupe 로 차단 ② 불변식 3파일(recordDescriptors/renderableDatasource/registries.test)이 서로 다른 축을 교차 핀 — 빠진 drift 축 없음, requiredFields ⊆ queryableFields 는 전 컴포넌트 루프라 자동 편입 ③ promptInjection 직렬화 이상 없음(신규 필드 leak 0) ④ few-shot 2건 safeParse 수동 추적 + 기계 감사(buildSystemPrompt.test) 자동 커버. 비블로킹 관찰: subscribesByTopic=true 카드가 경로 B datasource 4종 동시 소비 = 옛 IndicatorCard 거동 계승(신규 리스크 아님).
- **code-reviewer 0C / 2W / 3S — 전부 반영**: **W1(핵심 적발)** = AI 프롬프트에 주입되는 영어 설명글 2곳에 옛 이름 잔존(spawn description "spawns a TickerCard" + updateMode 프로즈 "one TickerCard") — 자기검증이 grep 매치를 "이력형 주석"으로 오분류해 흘려보낸 케이스, **AI-facing 주입 문자열은 주석과 별개 grep 클래스**(메모리 보강 1) → 즉시 수정. **W2** = marketSemantics 헤더의 "삭제 예정/과도기 re-export" 미래시제 주석 stale(**과도기 시제 주석** 패턴 — 메모리 보강 2) → 과거완료로 갱신. S1(e2e 테스트 제목)·S2(globals.css flash 주석 소유자 병기) 반영. S3 = 렌더 매트릭스 14쌍 byte 일치·requiredFields 승계 정합·reject 픽스처 교체 타당성·양방향 등치·안전망 전부 정합 확인(조치 불필요). 도메인 심화 자문 불필요(형태 교체만).
- 메모리: `feedback_module_deletion_stale_rationale_comments` 에 보강 2건 추가(신규 파일 아님 — 기존 패턴의 정밀화).

**Step 4 반영 후 최종 검증**: web 483 + shared 104 green / type-check / lint 0.

**▶ 남은 것 = Step 5 (라이브 G2)** — Vercel 배포 후 사용자 실측: ⓐ BigValue×티커 site=DB + flash·approx·재연결 무회귀 ⓑ Detail×지표 5종 site=DB(펀딩 predicted 트랩 재점검) + **COINM 티커 Detail 단위 대조**(Step 1 W1) ⓒ 직교 교차 실증("BTC open interest as a big number" → log_chat 박제) ⓓ AI 자율 분기 관찰("BTC price"/"BTC funding details"/"top gainers"→table 회귀/"OI trend"→chart 회귀) ⓔ 콘솔 0 ⓕ crypto-trader UX(의도 변경 5건 체감 판정) + G2 고지 항목 확인. **동반 확인(합격조건 아님)**: `[10-99]` 라이브 4항목 + `[10-109]` 관찰. 통과 시 **격자 완성 선언**.

---

## 8. Step 5 — 라이브 G2 (2026-07-14 사용자 실측, 진행 중)

**사용자 실측 결과 (1차)**: 게이트 ⓐⓑⓓⓔ + 고지 항목 = **"나머지는 모두 잘되었습니다"**. 게이트 ⓒⓓ 스크린샷 판정:
- **ⓒ 직교 교차 ✅ PASS**: "OI as a big number" → BigValue×open_interest — primary "106,743.62 BTC"(symbols 메타 base asset 라벨 정상) + secondary OI 1H(+6.60% teal)·MARK PRICE 만 표시(5m/15m/4h detail 필드 skip = role 소비 정확) + freshness. **형태 축 자유의 라이브 실증.**
- **ⓑ' COINM Detail 단위 ✅**: "BTCUSD_PERP 24h Stats" — `4,669,723 contracts` 정확 표기(Step 1 reviewer W1 수정의 라이브 검증).

**★ G2 가 가시화한 신규 결함 2건 — 당일 근본 수정 완료 (§8a/§8b)**:
1. **COINM 티커 필드 결측 (데이터 결함 C, 위생 #9)**: Detail 카드가 노출 — COINM 전 심볼에서 `price_change`/`price_change_pct`/`weighted_avg_price`/`trade_count` **null**(DB 실측 확정) + `quote_volume` 에 base 수량 의심(BTCUSD_PERP: 4,655,946 계약×$100÷$62,460 ≈ 7,454 ≈ quote_volume 7,456 — base_volume 13,611 은 별도 출처 불명). null 패턴 = **miniTicker 축약 페이로드 서명**. `feedback_new_card_surfaces_latent_data_defect` 5호.
2. **차트 툴팁 우측 도달 불가 재발 (사용자 명시 요청 — 전 컴포넌트 해결)**: OI Trend 1D 차트에서 선은 7/12 까지, hover 는 ~7/4-7/6 까지만. `ec4bb06`(RF 줌 시각/논리 보정)이 있는데 재발.

### 8a. 툴팁 도달 불가 — 근본 수정 (nextjs-frontend 실소스 진단 → 당일 구현)

- **근본 원인 (uPlot 1.6.32 실소스 확정)**: uPlot 은 over 의 rect 를 **캐시**하고 window resize/scroll/**mouseenter** 에만 갱신(L2829-2833/L5698) — RF pan·zoom(CSS transform)과 **setSize 는 캐시를 무효화하지 않음**. ★특히 `ec4bb06` 이 함께 도입한 **동적 yAxisSize** 가 첫 렌더 직후 setSize 를 일으켜 캐시 rect(위치+크기)가 hover 내내 stale — 1차 수정(배율만 나누기)은 넘어온 left 에 이미 박힌 **위치(offset) 오염을 구조적으로 못 고침**. 커서 점선과 idx 는 같은 mouseLeft1 을 쓰므로(내부 일치) 사용자가 본 "점선≠idx" = mouseLeft1 자체가 오염됐다는 증거. 07-10 G2 가 통과한 이유 = 카드 밖에서 진입(mouseenter fresh) 조건이었기 때문.
- **수정 (`chartFormat.ts` cursor.move)**: **원본 이벤트 `u.cursor.event.clientX` 를 그 순간 새로 잰 rect 로 직접 환산** — 캐시 의존 완전 제거(offset+scale 동시 교정), 우측 물리 끝 = 논리 100% 도달 보장. 이벤트 부재(프로그램적) 폴백은 1차 수정과 수치 동일(`left×kx ≡ left/sx`) = 기존 테스트 무변경 통과. + `useUplot.ts` setSize 직후 `syncRect(true)` 명시 무효화(이중 방어, public API 실재 확인). 신규 핀 테스트 +1(stale left 를 줘도 event 경로가 정답).
- 툴팁 플러그인은 교정된 cursor.left/idx 만 읽으므로 자동 동반 해소 — **캔버스 차트를 쓰는 모든 컴포넌트에 일반 적용**(현재 chart-card 유일 캔버스 form, 미래 히트맵 등도 이 cursor.move 상속). 메모리 `feedback_css_transform_canvas_cursor` 갱신.

### 8b. COINM 티커 결측/오적재 — 근본 수정 (backend-infra 진단 → 당일 구현)

- **근본 원인 3건 (100% 코드 확정)**: ① COINM 만 `!miniTicker@arr` 잔존(canHandle 분기) — mini 에 없는 P/p/w/n 을 normalize 가 **매초 명시 null 기입** → full upsert 가 REST 1분 보강(ticker24hrBatchTask)을 클로버링. spot(M1.6 §3.5)·USDM(테마 A §2.5)과 동일 메커니즘의 잔여분 ② WS normalize 가 marketType 무관 `q→quote_volume` — COINM 의 q 는 **base 자산 수량**(inverse 계약) → 오적재 ③ base_volume 은 활성 writer 0 = 개발 스모크 1회분 박제.
- **★ 라이브 스모크 결정 발견 (2026-07-14, `feedback_external_api_live_smoke` 이행)**: dstream `!ticker@arr` = **UM+CM 병합 스트림**(프레임 173심볼 중 UM 162, `st` 1=UM/2=CM 실측) — **2026-06-30 forceOrder CM migration 이 ticker 에도 도달 = `[10-14]` 상시 감시 적중**. fstream `/market` 에도 CM 행(st=2) 혼입 실측(USDM ticker 는 per-symbol chunked 라 무영향). BTCUSD_PERP q=7,423 ≈ 계산값 = 단위 의심 100% 확정.
- **수정 (`tickerWsHandler.ts` + `index.ts`)**: ① COINM `!ticker@arr` full 승격(COINM ~40심볼 소형 @arr = stall 무관) ② **st 2단 가드**(normalize 이전 필터 — 타 마켓 행의 quote lookup miss 경고 오염도 차단, st 부재=통과+allowlist 2차 방어) ③ `quote_volume: COINM→null(오적재 청소) / base_volume: COINM→q 라이브` 매핑 정정(registry 서술에 코드를 정합 — registry 무변경) + 위생 #8 근거 주석. 신규 테스트 +3(COINM 매핑/USDM 대칭/st 가드) + canHandle 핀 갱신.
- ticker24hrBatchTask 는 fallback 존치(제거 판단은 안정 관측 후 별도).
- **검증**: worker 275 green(+3) / web 484 green(+1) / 6패키지 type-check / lint 0. 배포 = 워커 재시작(sudo-free kill) + DB 실측(§8c).
