# M2 테마 — Composable Expressiveness (Form↔Data 직교) — 단일 진실

> **상태**: 🔄 **Stage 1 진행 중** — **Step 1 ✅ (2026-06-29, 레시피 계약 + 티커 팩 + 불변식 테스트)**. 다음 = Step 2(모양-제네릭 `TableCard` 신설). Stage 1 5-step 분해 = `ROADMAP.md` (roadmap-mgr append) / 실행 로그 = 본 §10.
> **이 테마는 TRAVIS 의 최상위 개발 중심축의 첫 실현이다.** 중심축 정의 = `CLAUDE.md §최상위 개발 축` + `PRD.md §2 모든 데이터 × 모든 형태` + `Architecture.md §8 Form↔Data 직교`. 본 문서 = 테마 실행 단일 진실.
> **선행 관계**: ff#2(청산 피드) ⏸️ 일시 정지 후 승격. 본 테마 완료 후 ff#2 재개 예정(청산은 본 테마 Stage 3 의 `events` 첫 시민으로 합류 → ff#2 잔여가 자연 흡수). 메모리 = `project_composable_expressiveness_axis` + `project_m2_pathA_ff2`(정지).

---

## 0. 한 줄 요약 (비전공자용)

> **"지금까지는 '청산 카드'·'코인 리스트 카드'처럼 데이터 종류마다 전용 카드를 따로 만들었다. 앞으로는 '표'·'차트'·'피드' 같은 **형태(form)** 를 만들고, 거기에 **어떤 데이터든** 흘려넣는다. 유저는 말로 '무슨 데이터를, 어떤 형태로, 어떻게 걸러서' 를 자유 조합하고, 화면에 쌓아 자기만의 대시보드를 만든다."**

---

## 1. 배경 — 이 결정이 나온 맥락 (2026-06-28 세션)

ff#2 Step 5(`LiquidationFeedCard`) 착수 직전, 사용자가 핵심 지적을 했다:

> "TRAVIS 의 큰 원칙은 '유저가 뭘 원하든, 원하는 모든 정보를, 원하는 모든 형태와 형식으로 보여준다'. 그런데 지금 컴포넌트가 '이 데이터엔 이 컴포넌트' 로 하드코딩돼 있다 — 이건 내 방향이 아니다. 표라고 하면 어떤 데이터든 들어가야 하고, 그래프라고 하면 어떤 데이터든 들어가야 한다."

CTO 검토 결과 **사용자 지적이 맞음**을 확인:
- 현재 6개 컴포넌트는 대체로 **데이터에 잠긴 카드**다 (아래 §5).
- 특히 `coin-list-card`(ticker 전용)·`indicator-list-card`(지표 전용)는 **같은 "표" 인데 데이터별로 쪼개짐** — 사용자가 냄새 맡은 모순.
- `LiquidationFeedCard` 를 일회성으로 또 만드는 것 = 방금 거부된 방향을 한 번 더 쌓는 것.

**중요**: 이 방향은 새 발상이 아니라 **이미 문서에 있던 비전**이다 — PRD §1~4(AI 가 카드별로 form·data·filter·updateMode·interaction 전부 정의) + `future.md §2 Track A`(Composable 컴포넌트 / GenericChart). 구현이 데이터-결합 카드로 **드리프트**했을 뿐. 이 세션은 그 비전을 **정식 중심축으로 승격 + 정밀화**한 것.

**정밀화의 핵심 (CTO 기여)**: "모든 데이터 × 모든 형태" 는 자유 격자가 아니다. **제약 = 데이터 정체성이 아니라 "모양(shape) 호환성"**. 같은 데이터를 snapshot/history/집계로 reshape 하면 거의 모든 데이터가 거의 모든 형태를 먹일 수 있다.

---

## 2. 유저 경험 목표 (사용자 확정 2026-06-28)

CTO 가 그린 "끝났을 때 유저가 겪는 경험" 을 사용자가 **"의도한 것과 같다"** 고 확정:

- **카드 메뉴판이 사라진다**: 유저는 "카드 종류" 를 모른다. 데이터 + 보고 싶은 방식만 말한다.
- **같은 데이터, 원하는 어떤 형태로든**: `BTC open interest`(큰 숫자) / `top 20 by OI`(표) / `BTC OI over 24h`(차트) / `OI change across USDT perps`(히트맵) — 같은 OI 가 의도에 따라 다른 형태.
- **형태 축에서도 자유**: "차트" 하나에 funding/liquidation/taker 등 어떤 지표든.
- **정밀 필터 + 조합**: `liquidations over $100k on VELVETUSDT, as a table` — 데이터·필터·범위·형태를 한 문장에 자유 조합.
- **한 캔버스에 쌓아 저장**: 여러 카드 = 나만의 콕핏 → Saved Views → 매일 복귀. = "Shape your market".
- **인터랙션도 AI 판단**: 카드 터치 → 적절한 상세 정보 / spawn / drill-down 을 AI 가 데이터·의도로 결정해 넣음 (PRD §4).
- **향후(이 축 위)**: 형태 사후 변경("이걸 차트로 바꿔줘") · 카드끼리 연동(클릭→연관 카드) · `reactive` 모드.

**사용자가 확정한 경계** (이견 없음):
- 모양 비호환 조합(예: 현재값 하나를 캔들차트로)은 무의미 = 논리 한계, TRAVIS 결함 아님.
- 새 형태(히트맵·게이지·우리 차트)는 처음 한 번 제작 필요. 단 만들면 모든 지표가 공짜로 유입.
- 도메인 위생(site=DB · sampled 고지 · 상장폐지 allowlist · 단위 정확성)은 어떤 형태로 보여주든 불변.

---

## 3. 설계 — shape taxonomy + 3-layer (단일 진실 = `Architecture.md §8`)

**5 shapes** (데이터를 종류가 아닌 모양으로):

| shape | 뜻 | 서빙 훅 (현황) |
|---|---|---|
| `scalar` | 값 하나 | `useDataServiceRow`(부분) |
| `record` | 한 대상의 여러 필드 | `useDataServiceRow` |
| `set` | 여러 대상 × 필드 (스냅샷) | `useDataServiceTable` |
| `series` | 시간축 위의 값 (history) | **미구현 = 핵심 구멍** (범용 history fetch) |
| `events` | 시간순 도착 사건 | `useDataServiceFeed` ✅ (ff#2 Step 4) |

**3-layer** (BI 도구의 "시맨틱 레이어 + 꽂아 쓰는 시각화" — 검증된 패턴):
1. **시맨틱 레이어** (필드별 단위·색·정밀도·라벨·고지) — **이미 70% 존재**: `canonical-metrics.md` + `apps/web/lib/format/marketUnits.ts` + `apps/web/lib/cards/indicatorListDescriptors.ts`(descriptor = 증명된 축소판).
2. **모양 인식 데이터 레이어** — "datasource X 를 {shape} 로 줘". scalar/record/set/events 존재, **`series` 가 빠진 핵심 작업**.
3. **모양 소비 form 컴포넌트** — "나는 set 받는 Table" 선언 + 컬럼은 시맨틱 레이어 파생. `indicator-list-card` 가 이미 이 방식 → 일반화.

---

## 4. Stage 계획 (실 step 분해는 §8 에서 roadmap-mgr)

- **Stage 1 — 스냅샷 form 통합** (위험 0, 즉시 비전 체감): `coin-list-card` + `indicator-list-card` → **하나의 모양-제네릭 Table**(`set` 소비 + descriptor 팩). BigValue/Detail(`scalar`/`record`)도 동일 패턴 정리. **이미 라이브인 데이터로 검증, 새 배관 0** → 추상화 모델을 큰 베팅 전에 증명.
- **Stage 2 — 모양 인식 데이터 레이어**: `series`(범용 history fetch — 어떤 metric 이든 시간축으로) + `events` 정식화. `_history` 테이블이 `series` 공급원 (`DB_SCHEMA.md §_history` 전방 노트).
- **Stage 3 — 새 form 을 프레임워크 위에**: 우리 소유 **GenericChart**(OI/펀딩/LSR history 차트 — TradingView 외주가 아닌 우리 차트, future.md §2 호명) → **청산을 `events` 첫 시민으로**(ff#2 재사용 자산 합류) → 이후 히트맵/게이지는 싼 추가.
- **Stage 4 — AI 계약**: AI 가 {datasource, form, shape, fields, transform} **독립 선택**, 레지스트리 파생 검증(`aiCardConfig` superRefine 확장).

> ★ Stage 1 을 먼저 하는 이유: 라이브 데이터로 위험 없이 비전을 즉시 증명. 청산(새 shape=events)은 검증된 프레임 위 Stage 3 에서 더 견고하게.

---

## 5. 현재 컴포넌트 현황 (= 수렴 대상, 2026-06-28 실측)

| 컴포넌트 | 형태 | 묶인 데이터 | 평가 |
|---|---|---|---|
| `ticker-card` | 큰 단일 숫자 | ticker | 데이터 결합 → BigValue 로 일반화 |
| `coin-list-card` | 스크롤 표 | ticker | **Table 로 통합 (Stage 1)** |
| `indicator-list-card` | 랭킹 표 | 지표 5종 (descriptor) | ⭐ 일반화 다리 — Table 의 씨앗 |
| `indicator-card` | 단일 상세 | 지표 5종 | Detail 로 일반화 |
| `kline-chart-card` | 캔들 차트 | kline (TradingView) | 가격은 TV 유지, 우리 metric 은 GenericChart(Stage 3) |
| `liquidation`(예정) | 피드 | 청산 | **만들지 않음** → Stage 3 events 시민 |

- 등록 양쪽: React 렌더 맵 `apps/web/lib/registerCards.ts` + AI 메타 `packages/shared/src/registries/defaults.ts` (`feedback_registry_react_ai_sync` 규율 유지).
- 시맨틱/descriptor: `apps/web/lib/cards/indicatorListDescriptors.ts`, `indicatorDescriptors.ts`, `apps/web/lib/format/marketUnits.ts`.
- AI 계약: `packages/shared/src/schemas/aiCardConfig.ts` (`CardDataBinding` + superRefine).
- 데이터 훅: `apps/web/lib/dataService/{hooks.ts, useDataServiceFeed.ts, types.ts}`.

---

## 6. 경계 (오버셀 금지)

- 모양 비호환 조합은 무의미(논리 한계, 결함 아님).
- 새 form 1회 제작 필요. 그 후 모든 지표 자동 유입.
- 도메인 위생(site=DB · sampled · allowlist · 단위) 불변.
- 하드코딩 매핑 금지(`feedback_no_query_to_component_hardcoding`) — descriptor/시맨틱은 순수 표시 메타라 이 원칙과 충돌 안 함, 오히려 강화.

---

## 7. ff#2(청산) 와의 관계 — 재사용 자산 + 재개 계획

ff#2 는 **일시 정지지 폐기 아님**. 완료한 Step 1~4 는 본 테마에서 **전부 재사용**:
- **Step 3a** `optionalSelectorKeys` + `buildLiveTopics`(토픽 keystone) — 경로 A 토픽 계약.
- **Step 3b** liquidation datasource `liveTopicSpec`(휴면) — events 공급 토픽.
- **Step 2** 워커 forceOrder publish 가산(allowlist + insert 무회귀).
- **Step 4** `useDataServiceFeed`(append-only ring buffer = **`events` shape 서빙 훅**, 불변식 A~F).

→ 청산은 본 테마 **Stage 3 의 `events` 첫 시민**으로 합류. **본 테마 완료 후 ff#2 재개**(사용자 결정 2026-06-28) — 그 시점엔 청산 카드가 일회성이 아니라 "Feed form + 청산 descriptor 팩" 으로 자연스럽게 떨어짐. 잔여 `[10-72]`(notional USD enrich + COINM allowlist, crypto-domain 라이브 검증)·`[10-73]`(filter forward-application)는 그때 처리.

---

## 8. 다음 세션 첫 작업 (착수 가이드)

1. **읽기 순서**: 본 파일 → `CLAUDE.md §최상위 개발 축` → 메모리 `project_composable_expressiveness_axis` → `Architecture.md §8 Form↔Data 직교`.
2. **첫 행동 = `@roadmap-milestone-manager` 로 테마 step 분해** — Stage 1(스냅샷 form 통합)부터 검증 가능한 3~7 step 으로. scope 규율(한 번에 하나) 준수. Stage 1 단독으로도 한 테마 분량일 수 있음 → roadmap-mgr 판단.
3. **자문 묶음**: `@zod-schema-architect`(shape 계약 + aiCardConfig 확장) · `@nextjs-frontend-specialist`(모양-제네릭 form + 저사양 UHD620 렌더 + GenericChart 라이브러리 선정 lightweight-charts/visx 등) · `@crypto-domain-expert`(시맨틱 필드 정확성 + canonical-metrics 연동) · `@crypto-trader`(UX advisory) · `@code-reviewer`(구현 후).
4. **작업 방식**: Plan Mode → 사용자 확인 → 구현 → lint/test → task-record(본 파일) + docs + 메모리 → commit → push → /clear → 반복 (CLAUDE.md).
5. **검증 게이트**: 각 Stage 라이브 G2(site=DB) + 회귀 0 + 자문 0 Critical.

---

## 9. 관련 문서 / 메모리

- **중심축 정의**: `CLAUDE.md §최상위 개발 축` (매 세션 자동 로드) · `PRD.md §2 모든 데이터 × 모든 형태` · `Architecture.md §8 Form↔Data 직교`(shape + 3-layer + Stage).
- **백로그/우선순위**: `M2-step2-usage-feedback.md §H "Composable Expressiveness"` · `ROADMAP.md` 2026-06-28 방향 전환 블록 · `future.md §2`(정식 활성화) · `M2-plan.md §Step 5`.
- **데이터**: `DB_SCHEMA.md §_history`(series 공급원 전방 노트).
- **메모리**: `project_composable_expressiveness_axis`(중심축) · `project_m2_pathA_ff2`(정지) · `feedback_no_query_to_component_hardcoding` · `feedback_registry_react_ai_sync` · `feedback_update_mode_design`.
- **ff#2 재사용 자산**: `M2-pathA-ff2-liquidation.md`(Step 1~4 상세).

---

## 10. Stage 1 실행 로그

### Step 1 ✅ — 통합 table descriptor 계약 + 티커 descriptor 팩 + 불변식 테스트 (2026-06-29)

**무엇을 만들었나** (화면 무변경 = 고립 파일, 아직 어떤 카드도 import 안 함):
- ➕ `apps/web/lib/cards/tableDescriptors.ts` — 모양-제네릭 Table 의 레시피 계약(`TableColumn`/`TableDescriptor`/`TableRow`) + 7 descriptor(지표 5종 이관 + 티커 2종 신설, `now_spot_ticker`·`now_futures_ticker` 동일 descriptor 공유) + `getTableDescriptor` + `TABLE_CONSUMES_SHAPE`.
- ➕ `apps/web/lib/cards/__tests__/tableDescriptors.test.ts` — 불변식 9 test.
- 옛 `indicatorListDescriptors.ts` **무수정**(살아있는 IndicatorListCard 보존) → 지표 5종이 옛/새 계약에 잠깐 중복, **Step 4 에서 옛 파일 삭제로 해소**(ROADMAP Step 4 에 등재됨, 별도 deferred 아님).

**설계 결정** (자문 `@zod-schema-architect` + `@nextjs-frontend-specialist` 2026-06-29 종합, 사용자 승인):
1. **색 계약 = 방향/농도 분리**: `tone?(row)=>MetricTone`(방향→색) + `intensity?(row)=>number 0..1`(크기→불투명도). descriptor 는 **의미만**, 색·opacity 바닥값(0.55)은 form(Step 2) 소유 → 미래 Heatmap 재사용. raw CSS 반환 금지(form 로직 누설).
2. **단일 self-gate**: 렌더 게이트 진실 = registry dataShapes(`renderableDatasource`). `getTableDescriptor` 는 "어떻게 그릴지" **거울**. 등치(descriptorKeys ≡ `table-card`.dataShapes)는 table-card 등록(Step 3) 후 불변식 테스트로 박제.
3. **Stage 2 전방호환 (재작업 0)**: per-datasource `shape:'set'` 태그 **안 박음**(Stage 2 삭제 재작업 회피) → form당 상수 `TABLE_CONSUMES_SHAPE='set'` 1개 + 게이트 함수 시그니처 고정. Stage 2 = `DatasourceEntry.shape` + `acceptsShapes` + 게이트 술어 1줄 교체.
4. **전체보기 항상 허용** (CTO 확정): `defaultLimit` 은 *시작값*일 뿐 cap 아님. cap/disable 필드를 **두지 않아** 차단을 표현 불가능하게. 티커 미지정(=전체), 지표 20(시작값). 전체보기는 표 form 의 항상적 능력.
5. **symbol 특수처리 제거**: `labelColumn`(표시) + `rowKeyFields`(복합 재조정키, 혼합 market_type 충돌 방지) 분리 선언 → 미래 비-티커 set(뉴스 등) 특수처리 0.
6. **이종 row 레지스트리**: `defineTable<Row>()` 헬퍼 — authoring-time 타입 안전 후 base 로 1회 erase(`as unknown as`, 캐스트 1곳 격리). 런타임 건전성 = "form 이 매칭 row 만 넘긴다" 불변(dataService 게이트 보장).

**불변식 9 test** (자문 zod 의 "조용한 빈칸 아닌 시끄러운 실패"): 7 key=등록 datasource / columns·labelColumn·rowKeyFields·flashColumn·defaultSort 전부 queryableFields 실존 / defaultSort sortable / defaultLimit 양의정수 / per-datasource 픽스처 value graceful / **티커 null 분기(`—`/intensity=0/neutral)** / columns 1~3 + width 형식 / self-gate 거울. (등치 테스트는 Step 3 이월.)

**검증**: vitest 9/9 + 전체 web 317 회귀 0 / lint clean / type-check clean / `@code-reviewer` **Critical 0**(하드매핑 없음·색 직교성·이관 충실성 바이트 동등·registry 정합·graceful 확인). code-reviewer W1·W2 즉시 반영(티커 null 픽스처 `TICKER_ROW_SPARSE` + `last_price != null` 제네릭 row undefined 방어), S1·S3 반영(columns 1~3 test + `PK_FIELDS`/`rowKeyFields` readonly).

**미세 의도 변경 (G2 고지 대상)**: 티커 `0.00%`·null 변화율이 기존 CoinListCard 의 `>=0=teal` 대비 **neutral(회색)** — 0 의 방향 의미를 바로잡은 의도적 개선. Step 5 라이브 G2 에서 "픽셀 동등" 확인 시 이 한 점만 고지.

**Step 2 착수 메모** (code-reviewer S4): 통합 TableCard 구현 시 "descriptor 선택 키 == 실제 fetch 한 datasource" assert 1줄 추가(잘못된 row→descriptor 조용한 오값 방어). 색 매핑 상수(`OPACITY_FLOOR=0.55`, `toneColor`, `intensityOpacity`)는 Step 2(form) 소유.
