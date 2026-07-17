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
| 2 | [10-115] zod 결정 게이트 (재귀 vs 깊이1) | 🔄 자문 진행 중 |
| 3 | [10-115] 재-spawn 체인 구현 | ⬜ |
| 4 | (C) AI spawn 타겟 다양성 (프롬프트 전용) | ⬜ |
| 5 | 라이브 G2 종합 + docs/deferred 정산 | ⬜ |

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
