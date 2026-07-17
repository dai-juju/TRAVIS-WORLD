# M3 Step 2 — 인터랙션 완성 2탄 (뷰포트 spawn 배치 + 재클릭 체인 + AI 타겟 다양성)

**Milestone**: M3 "Binance 우주 완성"
**Step**: 2 (사이클 M3-2) / 내부 5-step (roadmap-milestone-manager 분해)
**완료일**: 🔄 진행 중 (착수 2026-07-17)
**예상 소요**: 8~12h
**단일 진실**: 본 record + `docs/M3-plan.md §사이클 추적`

---

## 📖 비전공자 친화 설명

M3-step1 에서 카드를 "누르면 반응하는" 카드로 만들었지만, 실제로 써 보니 세 가지가 아쉬웠습니다. ① 표에서 코인을 연달아 찍다 보면 7번째쯤부터 새 카드가 **화면 밖**에 생겨서 "눌렀는데 아무 일도 없네?"로 느껴지고([10-113]), ② 그렇게 띄운 상세 카드는 **다시 눌러도 반응이 없는 죽은 카드**이며([10-115]), ③ 클릭하면 거의 항상 같은 종류(상세 카드)만 떴습니다.

이번 사이클은 이 셋을 한 번에 해결합니다. 비유하면 — 자판기에서 음료를 뽑았는데 **출구가 자판기 뒤편**이라 못 찾는 문제(①)를 "항상 보이는 곳에 놓기 + 자리가 없으면 '여기 있어요' 안내 버튼"으로 고치고, 뽑은 음료 캔에 또 다른 버튼(②)을 달고, 메뉴판에 다른 종류 예시(③)를 더 실어주는 것입니다. ③이 핵심적으로 TRAVIS다운 부분인데 — 코드에 "이럴 땐 차트를 띄워라" 같은 규칙을 심는 게 아니라, **AI 에게 보여주는 예시만 다양하게** 해서 AI 가 스스로 고르게 합니다 (하드코딩 금지 원칙).

---

## 🔨 내부 Step 진행 현황

| # | 내용 | 상태 |
|---|---|---|
| 1 | [10-113] 뷰포트 빈자리 배치(b) + 만차 토스트 "Show"(c) | ✅ 2026-07-17 (코드+단위테스트, 라이브는 Step 5) |
| 2 | [10-115] zod 결정 게이트 (재귀 vs 깊이1) | ✅ 2026-07-17 — **깊이 1 채택, 재귀 기각** |
| 3 | [10-115] 재-spawn 체인 구현 | ✅ 2026-07-17 (스키마+엔진+프롬프트+테스트+라이브 smoke) |
| 4 | (C) AI spawn 타겟 다양성 (프롬프트 전용) | ✅ 2026-07-17 (capability 안내 — 라이브 실증은 Step 5) |
| 5 | 라이브 G2 종합 + docs/deferred 정산 | 🔄 로컬 결정적 절반 ✅ 3/3 — 프로덕션 절반 = 사용자 체크리스트 진행 중 |

### Step 5 — G2 로컬 결정적 절반 (2026-07-17, Playwright 3/3 PASS)

> Playwright MCP 미연결 세션이라 레포 `@playwright/test` + `__TRAVIS_INJECT__`(dev 전용 주입)로 **AI 무관 결정적 검증**을 자동화. AI 자율 선언은 Anthropic 라이브 1콜 smoke(Step 3)로, 프로덕션 체감은 사용자 체크리스트(6항목)로 분담. 임시 스펙 = `tests/e2e/m3.2-spawn-viewport.temp.spec.ts` (정규 승격 여부 사용자 결정 대기).

- **A. 뷰포트 착지 (1920×1080)**: 12연속 spawn 전부 DOM 마운트(= `onlyRenderVisibleElements` 아래에서 뷰포트 교차 증명) + "outside" 토스트 0 + 콘솔 에러 0 ✅
- **B. 만차 Show (900×650)**: 빈 칸 소진 → "outside the current view" 토스트 → **Show 클릭 → 팬 발생 + 줌 불변**(maxZoom 점프 함정 회귀 감시 핀) + 팬 도착 시 카드 DOM 마운트(컬링 해제) ✅
- **C. 체인 (1600×900)**: 표 행 → detail(mid, 헤더 cursor-pointer 어포던스 확인) → 헤더 클릭 → chart(leaf) 생성 + leaf spawn 표면 0(말단) ✅
- 시행착오 1건: C 의 "leaf 클릭 표면 0" 단언이 ChartCard 자체 UI 컨트롤(주기 선택, `ChartCard.tsx:322`)의 cursor-pointer 를 오검출 — **제품 결함 아님**, 단언을 header/행 한정으로 정밀화 후 PASS. (교훈: "클릭 표면 부재" 검증은 spawn 표면 셀렉터 한정으로.)

### crypto-trader 사후 평가 (2026-07-17, advisory only — 전부 사용자 결정 대기)

- **강점 확인**: 자동 팬 없는 뷰포트 근처 배치 = 스캘퍼 시야 보호 적중 / "표→상세→차트" 2-hop = 스윙 주 드릴 경로 그 자체 / AI 가 leaf 로 kline 자율 선택 실증 긍정.
- **관찰 ① 만차 시 Undo 소실**: 만차 = 오클릭 카드를 눈으로 찾기 가장 어려운 상황인데 그 케이스에서 Undo 가 Show 로 대체됨 — 스캘퍼 급속 스캔 중 오클릭 마찰 가능성.
- **관찰 ② 2-hop 상한**: 실전 드릴 경로 ~95% 커버 판단. "차트→같은 심볼 청산맵/호가" 류 심화는 3-hop 체인보다 **linked_selection(`[4-13]`)** 이 자연스럽다는 의견.
- **관찰 ③ hover 5% 어포던스 저대비**: 다크 테마 저대비 + 정지 상태에서 광고 불가 + 터치 미지원 — 테마 C 저대비 발견성 우려의 재발 패턴.
- **다음 사이클 트레이더 1픽**: linked_selection(`[4-13]` — 심볼 클릭 → 이미 열린 카드들 포커스 연동).
- 처분: ①~③ = 사용자 결정 대기(사이클 마감 시 deferred 등재 여부 확정). agent 자체 메모리 = `apps/web/.claude/agent-memory/crypto-trader/project_m3_step2_interaction_advisory.md`.

### Step 2 — zod 결정 게이트 (2026-07-17)

- **깊이 1 명시 중첩 채택, 재귀(z.lazy) 기각**. 결정타 = route.ts 의 tool input_schema 변환이 `$refStrategy:"none"` — 이 옵션은 재귀 스키마를 만나면 그 지점을 **`{}`(무제약)로 뭉갬**(zod-to-json-schema 공식 동작, context7 확인). 크래시가 아니라 "2차 클릭 카드 구조 통째 소실 + 도구 단계 검증 소실"의 무음 결함이라 더 나쁨. `$refStrategy:"root"` 로 재귀를 살리는 길은 route 가 의도적으로 회피한 $ref/Anthropic 호환성 문제를 되살림 — 탈출구 아님.
- **체인 상한 = 2 hop**: 소스 → mid(클릭 가능) → leaf(말단, 클릭 불가). "리스트→상세→차트" 실무 드릴다운 주 사용례 커버.
- [10-114](emit 정적 검사)는 부수 검토 결과 **emit 도입 비권장**(optional selectorKey 오탐 + self-correction 데드락 재수입 위험 — `feedback_compat_invariant_overtag_blindspot` 계보). 원장 유지, advisory 갱신 예정.

### Step 3 — 재클릭 체인 구현 (2026-07-17)

- **스키마 (`aiCardConfig.ts`)**: `SpawnTargetBaseShape` 공통 몸통 + `makeSpawnActionSchema(target)` 팩토리(emit superRefine 로직 단일 진실 — 두 층 드리프트 0) → `SpawnTargetLeafSchema`(말단) / `SpawnLeafActionSchema`(2층) / `SpawnTargetSchema = base + actions?: leaf[]` / `CardActionSchema = 팩토리(full)`. 깊이 2 는 strict 가 구조로 reject.
- **엔진 (`spawnCard.ts`)**: `target.actions` 를 스폰 카드 config 로 관통 — CardContainer 가 그대로 클릭 표면 부여(신규 코드 0). leaf 액션의 parameterMapping value 검증은 mid 카드가 클릭 시점에 완전한 AiCardConfig 로 재검증될 때 **step (5) 가 자동 승계**(신규 검증 로직 0 — 테스트로 핀).
- **프롬프트**: actions 안내에 체인 규칙 추가 + few-shot `row-click-spawn-chain`(표→상세→OI 차트 중첩 예시)으로 교체.
- **변환 smoke (실측)**: 빈 `{}` 0(재귀 뭉갬 없음) / 중첩 target 완전 인라인 / bytes 11,240 → **18,734 (+66%)** — zod 예상(+10~15%)보다 큼(CardDataBinding 4곳 인라인). 절대 비용은 콜당 입력 +~2K 토큰(Haiku ~$0.002) 수용. describe 다이어트는 관찰 항목.
- **★ 라이브 smoke (Haiku 실 1콜, `feedback_external_api_live_smoke` 규율)**: tool_use 수용 YES + zod PASS + **AI 가 첫 콜부터 체인 자율 emit** — `row-click → detail-card → header-click → kline-chart-card` (예시에 없는 kline 을 leaf 로 자율 선택 = 다양성 부수 실증). input 23,375 tokens.

### Step 4 — 타겟 다양성 (2026-07-17)

- 프롬프트 actions 안내에 "타겟은 detail 전용이 아님 — shape 맞는 어떤 등록 컴포넌트든(record/히스토리 차트/가격 차트/피드) 맥락으로 선택" **capability 서술** 추가. 매핑 규칙 0 (grep `if`/`includes` 무증가). 라이브 3+ 쿼리 실증은 Step 5 G2.

### code-reviewer 리뷰 (2026-07-17) — Critical 0 / W1·W2 + S1·S4 즉시 반영

- **W1 ✅ 반영**: 중첩 leaf 액션의 parameterMapping value 가 emit 시점 미검증(클릭 시점만) = self-correction 사각. mid datasource 는 같은 선언 안에 **정적으로 존재**하므로 emit 시점 검증 가능(오탐 0 — [10-114]류 ⊆ 검사와 달리 컨텍스트 자족) → 팩토리 superRefine 에 중첩 value 검증 가산 + 테스트 핀. "스키마 통과 → self-correction 무력 → 런타임 지연 실패" 계열(`feedback_stateguard_comment_cites_absent_refine` 계보)의 사전 봉합.
- **W2 ✅ 반영**: 그리드 후보 "수백 개 상한" 주장은 줌≈1 에서만 참 — 극단 줌아웃 시 flow 뷰포트 폭증으로 수만 칸 가능 → `MAX_GRID_CANDIDATES=600` 초과 시 스텝 √배수 성김 클램프 (커버리지 유지, 후보 수 상한 보장).
- **W3 ⏭️**: aiCardConfig.ts 577줄 — spawn 스키마 블록 분리는 [4-13](drill-down 등) 착수 시 동반 (지금 분리 비용 > 이득).
- **S1 ✅**: 토스트 Undo/Show onAction 클로저 try/catch (emit 밖 실행이라 graceful 대칭). **S4 ✅**: idBase 중복 참조 정리. **S2 ⏭️**: 3중 폴백 대각 오프셋의 소스 겹침 — 캔버스 완전 만차의 극단 케이스, 현행 수용(관찰). **S5/S6**: 리뷰어가 검증 완료 표기(useReactFlow memo 안정성 / 좌표 역산 정확).

### Step 1 — [10-113] 뷰포트 인지 배치 (2026-07-17)

- **`spawnCard.ts` 3단 배치 전략**: ① 관례(원본 오른쪽→아래 cascade)를 뷰포트-내부 조건으로 필터 → ② 뷰포트 안 빈 칸 그리드 스캔(카드+GAP 격자, **원본 중심에서 가까운 순** — "내 클릭의 결과" 인지 사슬 유지) → ③ 만차 시 기존 로직 그대로 화면 밖 배치 + `inViewport:false` 반환. `viewportRect` 는 **optional 인자** — 미전달(테스트/방어) 시 M3-step1 원행동과 완전 동일 (가산 확장, 회귀 0). bin-packing 최적화는 의도적 미구현 (roadmap-mgr scope 경계).
- **`CardContainer.tsx` 배선**: 커스텀 노드는 ReactFlowProvider 안이므로 RF 내부 store(`useStoreApi` → alias `useRfStoreApi`)를 클릭 시점에만 `getState()` — 구독 0, 리렌더 0. `transform=[tx,ty,zoom]`+컨테이너 크기를 **한 스냅샷에서 원자적으로** 읽어 flow 좌표 뷰포트 rect 역산(`{-tx/zoom, -ty/zoom, w/zoom, h/zoom}`). width=0(마운트 직후) 등 비정상이면 undefined 전달로 graceful 폴백.
- **만차 토스트**: `placedInViewport=false` 면 "Card added outside the current view." + **"Show"** 액션 — `setCenter(카드 중심, { zoom: 클릭 시점 현재 줌, duration: 300 })`. 자동 팬은 하지 않음(스캘퍼 시야 강탈 방지, crypto-trader lean (b)+(c) 그대로).

## ✅ 검증 결과 (Step 1)

- [x] 단위 테스트 16/16 PASS (기존 9 + 신규 7: 연속 12 spawn 전부 뷰포트 착지·비겹침 / 팬 중 배치 / 만차 폴백 inViewport=false / 카드>뷰포트 / 미전달 시 기존 동작 동일 / placedInViewport 전달 2종)
- [x] `pnpm -r type-check` 전 워크스페이스 green / `pnpm -F web lint` clean
- [ ] 라이브 12+ 연속 spawn 뷰포트 착지 + 토스트 "Show" 팬 — **Step 5 G2 에서**

## 🧭 주요 의사결정

1. **뷰포트 취득 = RF 내부 store 클릭 시점 read** ← canvasStore 에 뷰포트 rect 상태 추가(계획 초안) 대신. 이유: canvasStore.viewport 는 onMoveEnd 추적이라 stale 가능 + 컨테이너 크기를 모름. RF store 는 항상 진실 + 구독 없이 read 가능 → 상태 중복 0.
2. **setCenter zoom 명시 전달 (토스트 클릭 시점 lazily)** ← 생략 시 **maxZoom(=2) 점프 함정** — 설치된 `@xyflow/react` 12.10.2 소스에서 `nextZoom = options?.zoom ?? maxZoom` 실물 확인. nextjs-frontend-specialist 자문 Q3 적중.
3. **만차 토스트는 Undo 대신 "Show"** ← 토스트 액션 슬롯 1개. 화면 밖 카드의 1순위 니즈는 되돌리기가 아니라 찾아가기 — 이동 후 카드 삭제 버튼이 되돌리기를 대체.

## ⚠️ 다음 step에서 조심할 것

- **Step 5 G2**: 화면 밖 spawn 카드는 `onlyRenderVisibleElements` 로 DOM 부재 — **store 기준 판독** (memory `feedback_rf_viewport_dom_verification_trap`). 토스트는 MutationObserver 선설치. "Show" 클릭 전후 `getViewport().zoom` 동일 확인(= maxZoom 함정 회귀 감시).
- **Step 3**: spawn 노드 width/height 는 `buildTravisNode` 가 항상 세팅 — 이 불변식이 깨지면 화면 밖 카드가 컬링 판정 불가(specialist Q4). nodeFactory 수정 시 주의.
- 저사양 Low-tier `duration:0` 폴백은 미구현 — 실사용에서 300ms 팬 버벅임 관찰 시 소회수.

## 📁 관련 파일 경로

**수정**: `apps/web/lib/interaction/spawnCard.ts` (ViewportRect/SpawnPlacement 타입 + 3단 배치) / `apps/web/components/canvas/CardContainer.tsx` (RF store read + 토스트 분기) / `apps/web/lib/interaction/__tests__/spawnCard.test.ts` (+7 테스트)

**참고**: `docs/M3-plan.md §4~5` / `docs/deferred-task.md [10-113]/[10-115]` / `task-record/M3-step1-interaction-wire.md`

## 🔗 링크

- **이전**: `M3-step1-interaction-wire.md`
- **Plan**: `~/.claude/plans/zazzy-hopping-ocean.md` (사용자 승인 2026-07-17)
