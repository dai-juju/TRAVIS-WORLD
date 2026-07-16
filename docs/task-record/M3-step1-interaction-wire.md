# M3 Step 1 — 인터랙션 wire (Spawn 관통) + UX 웜업

**Milestone**: M3 "Binance 우주 완성"
**Step**: 1 (M3 첫 사이클 = M3-1, 개발 순서 명명 규율 1호)
**완료일**: 2026-07-16 (착수 세션 당일 완주 — plan mode → 구현 → 리뷰 → 라이브 G2)
**예상 소요**: 14~20h (roadmap-mgr 분해 추정) / **실소요**: 당일 1세션
**단일 진실**: `docs/M3-plan.md §5` (계획·결정) + 본 record (실행·검증)

---

## 📖 비전공자 친화 설명

이번 작업으로 TRAVIS 의 카드가 처음으로 **"눌러지는" 카드**가 됐습니다. 지금까지는 AI 가 카드를 만들어 주면 보기만 할 수 있었는데, 이제 "Top gainers 표"에서 BANKUSDT 행을 클릭하면 **그 코인의 상세 카드가 0초 만에 옆에 튀어나옵니다**. PRD 가 처음부터 약속했던 인터랙션(spawn)의 실동작 — 계약서(스키마)만 있고 실행부가 잠들어 있던 것을 깨웠습니다.

핵심 설계는 **"AI 사전 선언"** 입니다. 식당 비유로: 웨이터(AI)가 메뉴판(카드)을 내올 때 "이 항목을 누르면 어떤 상세 요리를 보여줄지"를 **메뉴판 뒷면에 미리 적어둡니다**. 손님이 누르면 웨이터를 다시 부르지 않고(AI 재호출 없음 = 비용 0·대기 0초) 주방 보조(프론트 코드)가 메모대로 즉시 조립합니다. **무엇을 띄울지는 100% AI 가 결정**하고(코드에 매핑 규칙 0 — 하드코딩 금지 재강조 반영), 코드는 "어떻게"(클릭 배선·좌표·검증)만 담당합니다. 라이브에서 AI 는 첫 쿼리부터 스스로 "행 클릭 → 상세 카드" 인터랙션을 선언했습니다 — 프롬프트에 시켜서가 아니라 형식만 알려줬는데 스스로 판단한 것입니다.

덤으로 UX 웜업 4건도 함께: 티커 카드 상단 라벨이 잉여 "TICKER" 대신 **PERP/SPOT/COINM**(마켓 구분)으로, 상세 카드 10줄이 **방향→가격대→유동성 3블록**으로 정리, 지표 카드의 3중 라벨 반복 정리, 자체 차트에 상시 "UTC" 표식.

---

## 🔨 무엇을 했는가 (기술 요약)

- **계약 (shared)**: `SpawnTargetSchema` 신설(componentId+updateMode 필수+size?+data=`CardDataBindingSchema` 재사용 — 중복 0·순환 0) + `CardActionSchema` 를 `target` 중첩으로 개편(구형 소비자 0, saved_views 실측 0건 = 클린 교체). superRefine (1)/(1.5)/(4) 를 공유 헬퍼로 추출해 emit 시점에 target 도 동일 검증(스코프 완결성은 클릭 시점 최종 게이트로 이연 — self-correction 오탐 방지). parameterMapping 의미론 확정(key=타겟 필드 ∈ {symbol,marketType,exchange} / value=소스 queryableFields, 양방향 registry 파생 검증). interactionRegistry spawn entry 의 params 재열거 폐기(권위=스키마 하나 — 기존 drift 해소).
- **엔진 (web)**: `lib/interaction/spawnCard.ts` 순수 함수 — 행 값 주입(행 파생이 고정 선언보다 우선) → 클릭 시점 id 유일화 → **기존 `AiCardConfigSchema.safeParse` 최종 게이트**(저장 뷰 hydrate 재검증 silent 소실 방어) → 원본 오른쪽 + 겹침 시 아래 cascade(O(n) AABB, RF v12 `measured` 우선). `buildTravisNode`/`resolveUniqueId`/`CARD_SIZE_PX` 를 `lib/canvas/` 공용 모듈로 추출(AI 응답 경로와 로직 공유·순환 import 방지).
- **클릭 표면 (form 레벨, 원칙 ⑧)**: `CardComponentProps` 에 optional `interaction` 핸들 가산(미주입=no-op, 회귀 0). CardContainer 가 spawn 실행 전담(useCanvasStoreApi + useMemo 안정화 — memo 행 리렌더 방어) + "Card added·Undo" 토스트 + `card_added(source:spawn)` 로깅. table/feed 행=row-click, big-value/detail 헤더=header-click. `nodrag` + 4px 이동 임계(`useClickWithoutDrag`) + cursor/5% 잉크 hover 어포던스(액션 있는 카드만).
- **프롬프트**: `buildSystemPrompt` 의 "actions: leave empty in M1" 해제 → actions **형식** 가이드 + "무엇을 spawn 할지는 전적으로 자율 판단" + 형식 예시 1건. 매핑 규칙 0.
- **웜업**: `[10-111]`①(kicker 함수형+`marketTypeLabel` 헬퍼) ②(`recordTextEchoes` — 코드 폴백끼리만 생략, AI 원문 보존) ④(`RecordField.group` + DetailBody 그룹 헤더) + `[10-109]`①(ChartCard 우하단 상시 UTC 오버레이). `[10-109]`② 는 사용자 미채택(현행 UTC 유지, 원장 잔존).

---

## ✅ 검증 결과

- [x] lint / type-check 전 워크스페이스 green
- [x] 테스트: shared 111(신규 계약 7) + web 493(신규 엔진 9) 전부 통과 — 티커 필드 재배치 무회귀 실측
- [x] `@code-reviewer`: **Critical 0** / W1(진단 로그 카드 id)·W2(try/catch 대칭)·W3(로그 레벨) 즉시 반영(49427b4)
- [x] **라이브 G2 (travis-web.vercel.app, Playwright)**:
  - G2-1 행 클릭 spawn: **11회 실측 전부 정확한 심볼+market_type 캐리** (라이브 재정렬 중에도 클릭된 행 기준) + 원본 오른쪽 GAP 30px 정밀 배치 + PERP kicker/3그룹 동시 확인
  - G2-2 같은 심볼 재클릭: nonce id 유일화(`-9lxued` 등) + cascade 아래 배치
  - G2-3 드래그≠클릭: 행 드래그 → spawn 0 + 카드 불이동 / 카드 이동은 헤더 드래그로 정상(회귀 0)
  - G2-4 **새로고침 생존**: 저장 뷰 DB 왕복(has_actions=true 실측) → hydrate 재검증 통과 → spawn 카드 복원 + **표의 클릭 가능성(actions) 유지**
  - G2-5 토스트: "Card added·Undo" 출현(MutationObserver 포착) + Undo 실동작(store 제거 확인)
  - G2-7 kline/chart: 클릭 표면 0 (미지원 form 규약 준수) — CI "1D only" 준수 차트 정상
  - G2-8 회귀: 삭제/Undo/저장뷰/AI 카드 생성 정상, **콘솔 에러 0**
  - ★ **AI 자율성 실증**: 매핑 규칙 없이 첫 쿼리부터 AI 가 row-click→detail-card spawn 을 스스로 선언 (2개 쿼리 재현)
- 미실측(실사용 관찰 이관): G2-6 피드 행 클릭(동일 계약·표면) / 웜업 ②(지표 BigValue 에코 상황)·[10-109]①(자체 chart-card 미생성 — kline 은 TradingView 라 대상 아님)

---

## 🧭 주요 의사결정

1. **spawn 타겟 = AI 사전 선언** ← 클릭 시 AI 재호출(3~7초+비용, 트레이더 워크플로에 치명) / 프론트 규약 합성(큐레이션 금지 위반) 대신. 사용자 확정 + zod 자문 "옵션 C 정제안"(target 중첩 + CardDataBindingSchema 재사용).
2. **emit 부분검증 / 클릭 최종검증 2단 분리** ← emit 에서 symbol 강제하면 "행에서 채울 예정" 정상 케이스 오탐(self-correction 데드락). 조합 결함만 emit 게이트, 스코프 완결성은 조립 후 기존 스키마 재사용.
3. **spawn 실행 = CardContainer 전담, form 은 emit 만** ← form 이 store 직접 호출하면 캔버스 결합+4중 중복(원칙 ⑧ 위반). optional 콜백 가산 정석.
4. **id 는 클릭 시점 생성(선언 제외)** ← AI 가 id 를 선언하면 반복 클릭이 동일 id 로 덮여 addNode 무시.

---

## ⚠️ 다음 step에서 조심할 것

- **★ 뷰포트 밖 spawn (G2 신규 발견, `[10-113]`)**: cascade 연속 spawn 시 7번째쯤부터 새 카드가 뷰포트 밖에 생성 — 토스트는 뜨지만 카드가 안 보여 "클릭했는데 무반응"으로 체감. React Flow 가 뷰포트 밖 노드를 DOM 에서 생략하므로 DOM 기반 검증도 이 함정에 빠짐(이번 G2 디버깅에서 store 는 정상인데 DOM 만 비어 "버그"로 오인한 실사례). 완화 후보(뷰포트 팬/빈 공간 배치/토스트 액션)는 crypto-trader 자문 후 사용자 결정.
- **emit 이연 검증의 자기교정 사각 (`[10-114]`, reviewer W1)**: "항상 실패하는 spawn 선언"(예: 타겟 marketType 을 어디서도 못 채우는 조합)이 emit 을 통과 — AI 가 통보받지 못함. emit 시점 "채울 통로 부재" 정적 검사 가능성은 zod 자문 후 결정.
- **spawn 카드는 재-spawn 불가 (`[10-115]`, reviewer S3)**: target 에 actions 개념이 없어 "상세→더 깊은 상세" 체인 미지원(이번 범위 의도적 제외).
- **Playwright 로 토스트 검증 시**: MCP 왕복(수 초~수십 초)이 토스트 수명(5초)보다 길다 — 즉석 판독 대신 MutationObserver 선설치 필수(이번 G2 에서 "토스트 부재"로 오인했던 원인).

---

## 📁 관련 파일 경로

**신규**: `packages/shared` SpawnTargetSchema(aiCardConfig.ts) / `apps/web/lib/interaction/{spawnCard,useClickWithoutDrag}.ts` + `__tests__/spawnCard.test.ts` / `apps/web/lib/canvas/{nodeFactory,cardSizes}.ts`
**수정**: aiCardConfig.ts(CardAction 개편+superRefine 헬퍼) · defaults.ts(spawn entry) · schemas/index.ts · shared/index.ts · registryRefinements.ts · aiCardConfig.test.ts / cardComponentRegistry.ts(CardInteractionHandle) · CardContainer.tsx(핸들+Undo) · TableCard(+Row) · FeedCard · BigValueCard · DetailCard · buildSystemPrompt.ts · actionDispatcher.ts(추출 정리) · devInject.ts / 웜업: recordDescriptors.ts · marketUnits.ts(marketTypeLabel) · ChartCard.tsx
**커밋**: `340839c`(착수 docs) → `8296dd0`(본체) → `0dfdcf8`(웜업) → `49427b4`(리뷰 반영) → (docs 마감 커밋)

---

## 🔗 링크

- **이전**: `M2-cycle5-stage1b.md` (M2 마지막 — 격자 완성 선언)
- **다음**: M3-step2 (트랙 ②~④ 실사용 체감 순 — 후보 1순위 `[10-84]`, `[10-113]` 뷰포트 배치도 후보 급부상)
- **Plan**: `~/.claude/plans/cheeky-herding-ladybug.md` (plan mode 승인분)
