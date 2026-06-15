# M2 테마 C — UI 셸 + 유저 프리퍼런스 (task-record, 단일 진실)

> **상태**: 🔄 **진행 중** — Step 0(셸 골격) ✅ + 셸 트림(우측 패널 폐기) ✅ + **Step 1(`user_preferences`+RLS) ✅ 완료 (2026-06-15)**. **다음 = Step 2 (`saved_views` 영속화 — 좌 My Views)**. (구 Step 3 우측 세션 로그 = 폐기.)
> **확장 루프 3회전** (테마 A ✅ / 테마 B ✅ / `[10-33]` ✅ / `[10-39]` ✅ 종결 다음).
> **계획서**: `~/.claude/plans/steady-petting-hellman.md` (6-step 분해 + 핵심 파일 + 의존성 그래프).
> **★ 진행 규율 (사용자 지시 2026-06-15, 절대)**: Phase 1 의 구체 UIUX(레이아웃·패널 디자인·개폐 흐름·인터랙션·카피)는 **하나하나 사용자와 상의·확정**. 자율 UI 확정 금지.

---

## 0. 한 줄 요약 (비전공자용)

> **"탭 닫으면 다 사라지던 일회용 캔버스에, 좌(저장 뷰)·우(세션 로그) 서랍 골격을 달았다. Step 0 은 빈 서랍 + 여닫는 손잡이만 — 내용물은 Step 2(저장 뷰)/Step 3(세션 로그)에서 채운다. 저사양 PC에서도 안 끊기게, 캔버스는 한 번에 자리 내주고 서랍만 부드럽게 미끄러지는 2겹 구조로 설계."**

---

## 1. 왜 테마 C 인가

- **PRD §5 의 UI 구조(좌측 "My Views" / 우측 세션 로그)가 거의 0% 구현** — TRAVIS 의 가장 큰 구조적 갭.
- **영속화 부재** — "탭 닫으면 다 사라지는 생성기" → "매일 돌아오는 워크플로 도구" 전환의 토대.
- 실사용 발견 **F4**(차트 timeframe/지표 매번 설정 귀찮음 → 유저별 프리퍼런스)도 이 테마에서 해소.

6-step (의존성 재배열): **Step 0 셸 골격** → Step 1 `user_preferences` → Step 2 `saved_views`(좌 My Views) → Step 3 우측 세션 로그 → Step 4 `buildSystemPrompt` 프리퍼런스 주입(F4) → Step 5 E2E+RLS 격리. Step 0 = 전부의 선행.

---

## 2. Step 0 — 셸 골격 (✅ 완료 2026-06-15)

### 2.1 사용자 협업 확정 사항 (UIUX 결정)

| 결정 | 선택 | 근거 |
|---|---|---|
| **레이아웃 모델** | **Push** (패널이 캔버스를 밀어냄) | PRD §5/Claude·ChatGPT 동일. 캔버스 안 가려짐 |
| **저사양 stutter 차단** | 패널 폭 transition 없이 즉시 변경 + 안쪽 `translateX` 슬라이드 | nextjs-frontend 자문: ResizeObserver 토글당 1회 발화 → reflow 1회 |
| **기본 개폐 상태** | **둘 다 닫힘** | 캔버스 최대. 평소 reflow 0 (토글 시에만 1회 비용) |
| **구현 방식** | **직접 div + CSS transition** (shadcn sidebar 미사용) | 의존성 0, Zustand vanilla 패턴 일관, 저사양 가벼움 |
| **토글 affordance** | **가장자리 세로 rail/손잡이** (라벨 "My Views"/"Session Log") | 코너 3구역(테마/유저/Controls)·ReactFlow panOnDrag 충돌 회피 |
| **발견성** | 둘 다 닫힘 유지 + 라벨 rail | crypto-trader 발견 리스크를 디자인으로 해소 |

### 2.2 산출 (신규 6 + 수정 5)

**신규**:
- `apps/web/lib/stores/uiShellStore.ts` — Zustand vanilla. `{leftOpen, rightOpen, toggleLeft/Right, setLeft/Right}`, 기본 false. `toastStore` 패턴 복제.
- `apps/web/lib/providers/UiShellStoreProvider.tsx` — `ToastStoreProvider` 패턴 복제. `useUiShellStore(selector)` 노출.
- `apps/web/components/shell/ShellPanel.tsx` — 2겹 슬라이드 래퍼(바깥 폭 즉시 / 안쪽 translateX). 폭은 CSS 상수(좌 `w-64`/우 `w-72`).
- `apps/web/components/shell/PanelRail.tsx` — 항상-노출 토글 손잡이 + 세로 라벨 + 셰브론(방향 가변).
- `apps/web/components/shell/LeftPanel.tsx` / `RightPanel.tsx` — placeholder(안내 카피만).

**수정**:
- `apps/web/components/canvas/CanvasWorkspace.tsx` — 단일 div → flex 셸 `[좌rail | 좌panel | main(flex-1 min-w-0 relative) | 우panel | 우rail]`. `CanvasShell` 컴포넌트 신설. Theme/User/Chat 을 `<main>` 안으로 편입.
- `apps/web/components/theme/ThemeToggle.tsx` — `fixed`→`absolute`, z-50→z-40.
- `apps/web/components/auth/UserMenu.tsx` — `fixed`→`absolute` (2곳).
- `apps/web/components/chat/ChatInputBar.tsx` — `fixed`→`absolute`, z-40→z-20.
- `apps/web/app/layout.tsx` — `UiShellStoreProvider` 추가 (canvas 의존 없어 ToastStoreProvider 높이).

### 2.3 핵심 기술 결정

- **고정 3요소 편입 이유**: `fixed`(뷰포트 기준)는 패널을 열어 캔버스가 좁아져도 그대로라 패널 위로 침범(특히 ChatInputBar 뷰포트-중앙). `<main relative>` 기준 `absolute` 로 전환해 캔버스 영역을 추종. **안전 근거**: Theme/User/Chat 은 `CanvasWorkspace` 에서만 렌더(auth 페이지·테스트 무관) — grep 으로 실증.
- **z-index 위계** (낮음→높음): 캔버스/chat `z-20` < 패널 `z-30` < 컨트롤/rail `z-40` < UndoToast `z-50`.
- **⚠️ 불변식 (code-reviewer W1)**: `<main>` 에 z-index 를 절대 부여하지 말 것 — `z-*`/`transform`/`filter`/`will-change` 를 붙이면 새 stacking context 가 생겨 내부 패널(z-30)/rail(z-40)이 부모 레벨에 갇혀 UndoToast(z-50) 최상위 불변식이 깨짐. `CanvasWorkspace.tsx` 에 주석 박제.
- **flexbox 함정**: `<main>` 의 `min-w-0` 누락 시 Push 가 안 먹힘(ReactFlow min-content 폭). 주석 경고 + 적용.

### 2.4 검증 (게이트 전부 PASS)

| 게이트 | 결과 |
|---|---|
| type-check / lint | ✅ 깨끗 |
| 기존 test | ✅ **190/190 PASS** (회귀 0 — `fixed`→`absolute` 가 UserMenu/ChatInputBar 테스트 무영향) |
| `@code-reviewer` | ✅ **0 Critical**. W1(불변식 주석) 즉시 반영. W2→`[10-40]`, S1→`[10-41]` 이월 |
| `@nextjs-frontend-specialist` 자문 | ✅ 설계 전량 반영(transform 슬라이드 / min-w-0 / chat 편입 / rail 위치 / store 모양) |
| `@crypto-trader` 자문(사전+사후) | ✅ rail 발견성 디자인 해소 + 용어 통일·대비 60→75% 즉시 반영. 잔여 → `[10-41]`/Step 2·3 |

**라이브 정량 검증** (Playwright, 1440×900, `getBoundingClientRect`):

| 상태 | 캔버스(main=ReactFlow) 폭 | 채팅바 중앙 x | 판정 |
|---|---|---|---|
| 둘 다 닫힘 | 1384 (=1440−28−28 rail) | 720 (=캔버스중앙) | rail 28×2 노출 |
| 좌 열림 | **1128** (−256 = w-64) | **848** (캔버스 추종) | Push + 채팅 추종 ✓ |
| 양쪽 열림 | **840** (−256−288) | **704** (캔버스 추종, ≠뷰포트720) | ReactFlow main 정확히 채움 ✓ |
| 좌만 닫기 | 1096 (우만 유지) | — | 독립 토글 ✓ |

→ Push 시 캔버스가 패널 폭만큼 **정확히** 축소, ReactFlow 가 리사이즈된 main 을 정확히 채움(`mainFillsReactFlow:true`), ChatInputBar 가 뷰포트가 아닌 **캔버스 중앙** 추종 — nextjs-frontend 가 지적한 핵심 수정 실측 확인. 콘솔 에러 = `favicon.ico` 404 1건뿐(무관).

### 2.5 이월 (deferred)

- **`[10-40]`** 🟠 — 셸 패널 닫힘 시 포커스 트랩. Step 2/3 콘텐츠 진입 전 `inert` 필요 (code-reviewer W2).
- **`[10-41]`** 🟡 — 셸 개폐 UX 고도화: ESC 닫기/단일 패널 정책(S1) + rail 발견성 nudge(crypto-trader). Step 1+ 사용자 결정.
- (Step 3 신호) crypto-trader: "Clears on refresh" 카피가 복기 중시 트레이더에 불안 신호일 수 있음 → Step 3 세션 로그 영속/카피 설계 시 재검토.

### 2.6 사용자 피드백 방향 (2026-06-15)

> 사용자: *"스크린샷만으론 감이 잘 안 온다. Vercel 에 반영되면 직접 써보며 수정하는 방향이 맞다."*
> → 셸이 빈 껍데기라 실제 체감은 Step 2/3 에서 패널에 내용이 차야 나옴. push 후 라이브에서 만져보며 발견성·reflow 체감 피드백 → 반영.

### 2.7 후속 fix — 닫힘 애니메이션 대칭화 (W3 해소, 사용자 피드백 2026-06-15)

> 사용자 라이브 사용 후: *"닫힘이 뚝 끊기는 느낌이 별로다. 열릴 때와 같이 부드럽게 닫히면 좋겠다."* (code-reviewer W3 가 "의도된 트레이드오프"로 분류했던 비대칭을 사용자 UX 판단으로 해소 — CLAUDE.md "제품 판단 사용자 존중").

- **원인**: 닫힘 = `[캔버스 폭 즉시 0]` → 패널이 `overflow` 로 즉시 클립되어 슬라이드 아웃이 안 보임. 열림엔 슬라이드 인 모션이 있는데 닫힘엔 모션이 없어 끊겨 보임.
- **수정** (`ShellPanel.tsx`): `<aside>` 폭 변경에 `transition-[width] duration-0` + **닫힘 시에만 `delay-200`**. 닫힘 = `[패널 먼저 슬라이드 아웃(200ms)]` → `[그 뒤 폭 collapse]` = 열림의 정확한 거울. **폭 애니메이션(매 프레임 reflow=저사양 stutter)을 쓰지 않고** 부드러운 닫힘 확보 — 캔버스 reflow 는 여전히 토글당 1회(닫힘 끝).
- **라이브 검증** (Playwright 시간 샘플링): 닫기 클릭 t=0/100ms 폭 256 유지(슬라이드 진행) → t=250ms 폭 0(collapse). 지연 collapse 실측 확인. type-check/lint/190 test 회귀 0.

---

## 2.8 후속 — 셸 트림: 우측 "Session Log" 패널 완전 제거 (✅ 2026-06-15, scope 변경)

> 사용자 결정(§3 scope 변경): *"채팅 복기는 내 워크플로에 중요하지 않다"* → 우측 세션 로그 패널 폐기. `@crypto-trader` 의 "신뢰 자산" 자문과 의견 갈림 — **제품 판단 사용자 존중**(CLAUDE.md). 대안 = 유저 수동 메모 카드 `[10-43]`(M2+).

- **변경 (4 수정 + 1 삭제)**:
  - `lib/stores/uiShellStore.ts` — `rightOpen`/`toggleRight`/`setRight` 제거, 좌측 전용 단순화(Write 재작성). 폐기 이력 주석.
  - `components/canvas/CanvasWorkspace.tsx` — `RightPanel` import · `rightOpen`/`toggleRight` 구독 · 우측 `ShellPanel`/`RightPanel`/`PanelRail` JSX 제거 + 레이아웃 주석 갱신.
  - `components/shell/RightPanel.tsx` — **파일 삭제**.
  - `components/shell/ShellPanel.tsx` / `PanelRail.tsx` — `side:"left"|"right"` prop + `PANEL_WIDTH.right` **의도적 보존**(재사용 프리미티브, 향후 엣지 패널/메모 카드). 죽은 "Session Log" 코멘트 → "(예약) 미사용"으로 정리. PanelRail 우측 분기에 "미사용 예약" 주석(code-reviewer W1).
- **검증**: type-check/lint **clean** + **190/190 test PASS**(회귀 0 — 우측 제거가 테스트 무영향 실증) + `@code-reviewer` **0 Critical / dead reference 0건**(grep `rightOpen|toggleRight|setRight|RightPanel` = 0 매치) + flexbox Push 무결성 구조적 확인(`<main flex-1 min-w-0>` ↔ 좌측 `shrink-0`, 우측은 독립 형제였음 → 좌측 Push 와 수학적 독립).
- **설계 판단 (code-reviewer W2 승인)**: `side` prop 보존 = YAGNI 위반 아님 — "미래 추측"이 아니라 "어제까지 작동하던 검증된 양방향 능력의 보존". 단 "의도적 예약" 주석으로 죽은코드 냄새 차단(W1).
- **교훈 (code-reviewer Memory Note 제안)**: 기능 제거 시 남겨두는 미사용 분기/prop 은 "의도적 예약"임을 코드에 명시해야 보존이 부채가 안 됨. `ShellPanel`(주석 O) vs `PanelRail`(주석 X→보완) 비대칭 사례.
- **commit + 라이브 검증 (✅ 2026-06-15)**: commit `38b5a29` → main push → Vercel 자동 배포. **라이브 Playwright 정량 검증**(`travis-web.vercel.app`, 1440×900): rail **1개**(`"My Views"`만, Session Log 0) / 닫힘 시 main 폭 **1412**(=1440−28, Step 0 의 1384=−28−28 에서 rail 1개분 복원) / 좌 토글 → 패널 256(w-64) + main **1156**(정확히 −256, Push 무결) + aria `Collapse My Views panel` + LeftPanel 내용 렌더. 콘솔 에러 = `favicon.ico` 404 1건(Step 0 동일 베이스라인, 무관).

---

## 3. 남은 Step (계획서 골격 — 착수 시 UIUX 사용자 협업)

> **★ scope 변경 (2026-06-15, 사용자 결정)**: **우측 세션 로그 패널(구 Step 3) 완전 폐기.** 사용자(3년차 선물 트레이더 본인) 판단 — "채팅 복기는 내 워크플로에 중요하지 않다". `@crypto-trader` 의 "신뢰 자산" 자문과 의견 갈림 → **제품 판단 사용자 존중**(CLAUDE.md). 파급:
> - (a) **셸 트림 필요** — Step 0 산출 중 우측 패널/rail/`uiShellStore.rightOpen·toggleRight·setRight` 제거. 셸이 좌측 단일 패널로 단순화. `[10-41]` 의 "양쪽 동시 열면 과축소" 우려는 자동 소멸(우측 없음).
> - (b) 구 Step 3 회수용 deferred `[10-42]`(채팅 로그 보관 정책) **폐기**(crypto-trader 자문은 `agent-memory/crypto-trader/project_m2_themeC_retention_review.md` 에 이력만 보존).
> - (c) 대안 아이디어 = 유저 수동 **메모 카드** → `[10-43]` (M2+ 이월). `saved_views` 카드 영구 보존은 그대로 유지.

- **셸 트림** (신규, scope 변경 산물) — ✅ **완료 (2026-06-15, §2.8 참조)**. `RightPanel.tsx` 삭제 + 우측 `ShellPanel`/`PanelRail` 인스턴스 + `uiShellStore` 우측 상태 제거 → 좌측 단일 패널. type-check/lint/190 test 회귀 0 + code-reviewer 0 Critical.
- **Step 1** `user_preferences` 테이블 + RLS — ✅ **완료 (2026-06-15)**. 마이그레이션 `20260615000001_user_preferences.sql`(user_id PK/FK CASCADE + preferences JSONB schemaless + updated_at 트리거) + RLS 3정책(본인 SELECT/INSERT/UPDATE, `(select auth.uid())=user_id`, INSERT·UPDATE WITH CHECK 위장/바꿔치기 차단, DELETE 없음). `@backend-infra-specialist` 작성 → `@security-auditor` **0 Critical APPROVED**(W-1 `(select auth.uid())` 반영, W-2 `TO authenticated` 로 중복이라 skip) → Dashboard SQL Editor 적용(MCP read-only) → **라이브 검증**: pg_policy 3행(roles=authenticated, DELETE 없음)+트리거+RLS enabled 확인, `get_advisors` user_preferences initplan 경고 0. DB_SCHEMA §사용자 데이터 반영. ★컬럼 선확정 금지 준수 — JSONB 칸만, 키는 Step 4 결정.
- **Step 2** `saved_views` 영속화(좌 My Views) — `cards_config`=`AiCardConfig[]` + `canvas_state`. `app/api/{save-view,views}/route.ts` service_role 쓰기. 저장 전 `AiCardConfigSchema.safeParse`. `[10-40]` 동반 회수.
- ~~**Step 3** 우측 세션 로그~~ — **폐기 (2026-06-15 scope 변경, 위 참조).**
- **Step 4** `buildSystemPrompt <user_preferences>` 주입(F4) — 하드코딩 금지("User prefers X" 정보형, "IF query THEN Y" 규칙 아님) + `@security-auditor` 프롬프트 인젝션 필수.
- **Step 5** E2E + 라이브 RLS 격리(2-유저) + docs.

**scope 밖 이월**: F4 studies(MA/RSI 오버레이)=TradingView widgetembed→Advanced Chart 위젯 교체 선결 / 채팅 로그 영속 패널 = **폐기**(위 scope 변경) / 유저 메모 카드 = `[10-43]` M2+.
