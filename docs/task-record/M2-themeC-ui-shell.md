# M2 테마 C — UI 셸 + 유저 프리퍼런스 (task-record, 단일 진실)

> **상태**: 🔄 **진행 중** — Step 0(셸 골격) ✅ + 셸 트림(우측 패널 폐기) ✅ + Step 1(`user_preferences`+RLS) ✅ + **Step 2 (`saved_views` 영속화 + 계정 위젯 좌측 이전) ✅ 완료 (2026-06-16, 라이브 G2 통과)**. **다음 = Step 4 (`buildSystemPrompt` `<user_preferences>` 주입, F4) 또는 다음 테마.** (구 Step 3 우측 세션 로그 = 폐기.)
> **Step 2 분해 (roadmap-milestone-manager, 2026-06-16)**: Sub-step 0(계정 이전·commit B `a466c6b`) → 1(saved_views 테이블+RLS `90af032`) → 2(API+직렬화 `ee437de`) → 3(My Views UI `d8f5e5a`) → 4(~~`[10-40]` inert~~ Sub-step 0 흡수) → 5(라이브 G2+docs). commit A(saved_views)/B(로그인 이전) 분리. 상세 = 아래 §3.5.
> **★ 라이브 G2 통과 (2026-06-16, Vercel + Playwright + Supabase MCP 교차검증)**: 채팅 "BTCUSDT price" → 카드 생성 → "BTC quick check" 저장(DB row: card_count=1·btc-ticker-live·ticker-card·canvas_state{0,0,1}, site=DB 일치) → **새로고침(캔버스 0개)** → 목록 클릭 → **카드 복원 + 라이브 데이터 재연결**(저장 시 $66,420.70 → 복원 후 $66,412.64 = 프로즌 아님, PRD §5 정확 구현) → 삭제(confirm) → DB remaining_views=0. 콘솔 에러 0. **2-유저 RLS 격리 = 정책 라이브 실측(4정책 auth.uid()=user_id) + security-auditor IDOR 차단 확인으로 입증, 두 계정 라이브 실증은 외부 베타(M1.7) 이월.**
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

## 3.5 Step 2 — saved_views 영속화 + 계정 위젯 좌측 이전 (🔄 진행 중, 2026-06-16~)

> 단일 진실. Step 2 는 saved_views(영속화)와 사용자 추가 요청(계정 위젯 좌측 이전)을 **통합 설계**로 진행 — 둘 다 LeftPanel 을 만지므로 한 번에(재작업 방지), commit 만 A(뷰)/B(로그인) 분리.

### 사용자 UIUX 협업 확정 (2026-06-16, AskUserQuestion)

| 결정 | 선택 |
|---|---|
| 이전 범위 | **계정 위젯만 이전** (이메일+Log out / Sign in). 실제 로그인 폼은 `/login` 유지 |
| 패널 레이아웃 | **상단=계정, 하단=My Views** |
| 닫힘 시 접근 | **rail 하단에 작은 계정 점**(RailAccount) 항상 노출, 클릭 시 패널 열림 |
| 작업 순서 | 통합 설계 한 번에, commit A/B 분리 |

### Sub-step 0 — 계정 위젯 좌측 이전 ✅ (commit B, 2026-06-16)

- **산출 (신규 2 + 수정 6)**:
  - ➕ `lib/providers/AuthSessionProvider.tsx` — 인증 세션 단일 출처(React Context). UserMenu 의 구독 로직(getUser + onAuthStateChange + `[3-12]` flicker fix + unsubscribe + signOut) 추출. 마운트 = CanvasWorkspace 스코프(/login·/signup 에선 구독 X).
  - ➕ `components/shell/RailAccount.tsx` — rail 하단 계정 점(로그인=이니셜 / 비로그인=사람 아이콘 / loading=빈 점). 클릭 → `setLeft(true)`.
  - ✏️ `components/auth/UserMenu.tsx` — 표현 전용으로 변경(absolute 래퍼 제거, `useAuthSession` 소비, 패널 상단 인라인 레이아웃).
  - ✏️ `components/shell/PanelRail.tsx` — `footer` 슬롯 추가. 루트 `button`→`div` 컨테이너 + 토글 버튼/footer 형제(★중첩 인터랙티브 방지). `z-40`·border 유지.
  - ✏️ `components/shell/LeftPanel.tsx` — 상단 계정(UserMenu) + 하단 My Views 2단.
  - ✏️ `components/shell/ShellPanel.tsx` — 닫힘 시 `inert={!open}` (`[10-40]` 회수, 아래 W1).
  - ✏️ `components/canvas/CanvasWorkspace.tsx` — `<main>` 에서 UserMenu 제거, `AuthSessionProvider` 로 CanvasShell 래핑, 좌 rail `footer={<RailAccount/>}`.
  - ✏️ `components/auth/__tests__/UserMenu.test.tsx` — render 를 `AuthSessionProvider` 로 래핑(구독 로직 이전 반영, 4 시나리오 그대로 통과).
- **검증**: type-check ✅ / lint ✅ / **190/190 test PASS(회귀 0)**.
- **`@code-reviewer` 0 Critical**. 반영:
  - **W1 (즉시 반영)** — 닫힘 패널에 첫 인터랙티브 요소가 들어와 inert 부재가 "지금 회귀"로 활성화 → `ShellPanel` `inert={!open}` 추가 = **`[10-40]` Sub-step 0 으로 당겨 회수**(원래 Sub-step 4 예정 → 흡수).
  - **W2 (즉시 반영)** — signOut `finally` 의 unmount-후 setState → `mountedRef` 가드 통일(`feedback_mounted_guard_consistency` 부채 종결).
  - **W4 (즉시 반영)** — RailAccount loading 중 `aria-label` 이 "Sign in" 으로 굳는 오인 → loading 시 중립 "Account" + `aria-busy`.
  - W3(button→div) = 회귀 없음 판정. S1/S3 = 미세 DRY/테스트 보강 이월(차단 아님). S4(loading 빈 칸 깜빡임)·rail 발견성 = `@crypto-trader` 자문 영역(라이브 검증 시).
- **라이브 검증**: (commit+push 후 Vercel Playwright — 진행 중)

### Sub-step 1 — `saved_views` 테이블 + RLS ✅ 코드+감사 완료 / 적용 대기 (commit A, 2026-06-16)

- **산출**: `supabase/migrations/20260616000001_saved_views.sql` (surrogate id PK + user_id FK CASCADE + name CHECK(1~200) + cards_config/canvas_state JSONB + created_at/updated_at + `set_updated_at_now()` 트리거 재사용 + `idx_saved_views_user_created (user_id, created_at DESC)` + RLS **4정책** SELECT/INSERT/UPDATE/**DELETE**, 전부 `(select auth.uid())=user_id` initplan). `docs/DB_SCHEMA.md §사용자 데이터` 반영.
- **user_preferences 와 차이**: surrogate id PK(N행) + DELETE 정책 + 목록 정렬 인덱스. cards_config/canvas_state JSONB 내부 키는 Sub-step 2 확정(deferred decision).
- **`@security-auditor` 0 Critical APPROVED** (2026-06-16): 4대 차단(남의 뷰 읽기/위장 저장/user_id 바꿔치기/남의 뷰 삭제) 확인. DELETE USING-only = 정석. JSONB sanitize 불필요(렌더 계층 책임). 후속(Sub-step 2): cards_config 페이로드 크기 cap(DoS) + 쓰기 route 별도 감사. W-1: 적용 후 라이브 pg_policy 4행 확인.
- **적용**: ⏳ Dashboard SQL Editor RUN 대기(MCP read-only) → 적용 후 라이브 검증(pg_policy 4행 / 인덱스 / 트리거 / get_advisors initplan 0).

### Sub-step 2 — 직렬화 레이어 + 쓰기/조회 API ✅ 코드+검증 완료 (commit A, 2026-06-16)

- **★ 설계 교정**: 쓰기 경로 = service_role(RLS 우회) **아님** → **인증 서버 클라이언트(getSupabaseServerClient, RLS 적용)**. saved_views 는 RLS 4정책이 보안 모델이라 service_role 우회는 부적절(user_preferences "프론트 인증 쓰기" 설계 정합). roadmap-mgr 의 "service_role" 제안을 의도적으로 교정.
- **서버/클라 모듈 분리**: `lib/savedView/schema.ts`(순수 zod, 서버 라우트가 사용) + `lib/savedView/serialize.ts`(serializeCanvas/hydrateSnapshot, canvasStore→@xyflow/react 의존 = 클라 전용). 서버 라우트가 React Flow 안 끌어옴.
- **산출**: schema.ts(SavedViewSnapshotSchema/cap 상수) + serialize.ts(저장 strict/로드 graceful 비대칭 — 카드별 safeParse drift 스킵 + 바깥 구조 깨짐 null + zoom clamp) + `app/api/save-view`(POST) + `app/api/views`(GET 목록/단건 + DELETE) + `canvasStore.loadNodes`(캔버스 교체) + proxy matcher 2추가 + `@travis/data-service` Json export + `database.generated.ts` 재생성(saved_views/user_preferences) + serialize.test.ts(5 테스트).
- **검증**: 6패키지 type-check ✅ / lint ✅ / **195 test PASS**(190→+5, 회귀 0).
- **`@security-auditor` 0 Critical APPROVED**: IDOR 이중 차단(eq 필터+RLS, 남의 id→404/0행) / service_role 오용 0 / matcher 정확 / 에러 누설 0. W-1(byte cap `.length`→`Buffer.byteLength`)·W-2(dataService 정보용).
- **`@code-reviewer` 0 Critical**: 서버/클라 분리·graceful·loadNodes 정확. W1(try 평탄화)·W2(byte cap)·W3(zoom clamp)·S1(타입 재사용) **즉시 반영**. S3/S4 주석 보강.
- **`canvasStore.ts:24` "user_views 영속화" 주석 회수**(영속화 실현 반영). `[8-27]` 무관.
- ★ 잔여(Sub-step 3 감사): 로드/렌더 시 `cards_config.title` 이 `sanitizeTitle` 경유하는지(XSS 렌더 방어선) + 클라 컴포넌트에서 supabase.from 직접호출 0 확인.

### Sub-step 3 — My Views UI ✅ 코드+검증 완료 (commit A, 2026-06-16)

- **사용자 확정 UIUX**: 저장=인라인 이름 입력(모달 없음) / 복원=현재 캔버스 카드 있을 때만 window.confirm 후 교체 / 삭제=window.confirm 후.
- **산출**: `components/shell/MyViews.tsx`(저장·목록·복원·삭제, fetch /api/save-view·/api/views) + LeftPanel 연결 + canvasStore `pendingViewport`+`requestViewport`/`clearPendingViewport`(Provider 경계 넘는 viewport 복원 신호) + CanvasInner effect(pendingViewport→useReactFlow().setViewport→clear).
- **★ Provider 경계 패턴**: My Views(ReactFlowProvider 바깥)가 viewport 복원을 직접 못 함 → store 신호 set → CanvasInner(안)가 적용 후 소거 ("우편함" 패턴). 카드는 loadNodes 직접 교체.
- **비반응 읽기**: useCanvasStoreApi().getState() 로 저장 시점에만 nodes/viewport 읽어 드래그마다 패널 리렌더 방지.
- **검증**: type-check ✅ / lint ✅ / **195 test PASS**(회귀 0).
- **`@code-reviewer` 0 Critical**: pendingViewport 다리(무한루프/race 없음·last-wins 정상) + 채널 누수 없음(loadNodes 언마운트→dataService unsubscribe cleanup) + dataService 준수. S1(로드/삭제 연타 가드) **즉시 반영**(busy 플래그). W4(window.confirm 톤)=사용자 확정 수용. W5(fetch 헬퍼 추출)=선택 이월.
- **`@security-auditor` 0 Critical / 0 Warning APPROVED**: 로드 카드 = AI 카드 **동일 렌더 경로**(CardContainer→sanitizeTitle, nodeTypes 단일) + **이중 schema 검증**(hydrate safeParse + CardContainer safeParse) + MyViews supabase.from 직접호출 0(fetch만) + view.name React 자동 이스케이프(dangerouslySetInnerHTML 미사용) + window.confirm 인젝션 면 없음. ★불변식: nodeTypes 2번째 추가/새 카드 시 sanitizeTitle 경유 재감사.
- **잔여**: 라이브 G2(저장→새로고침→복원 + 줌 복원) — 진행 중.

### Sub-step 4~5
- **4** ~~`[10-40]` inert~~ → Sub-step 0 으로 흡수 완료.
- **5** 라이브 G2 + docs ✅ **완료 (2026-06-16)**. 라이브 G2 = 위 헤더 ★ 참조(create→save→refresh→load 라이브 재연결→delete, DB 교차검증, 콘솔 0). 2-유저 격리 = 정책 실측+IDOR 설계 입증(두 계정 라이브 베타 이월). docs(task-record/DB_SCHEMA/ROADMAP/deferred/memory) 반영.

### 잔여 이월 (Step 2 산물, 차단 아님)
- **`[10-44]`** 🟡 — My Views UX 톤 통일: 복원/삭제 `window.confirm`(OS 팝업) → 인라인 확인(행이 "Delete?/Cancel"로 잠깐 전환)로 교체 + notice 단일 슬롯에 종류 태깅/자동소멸. (code-reviewer W3/W4, 사용자 확정 UIUX 라 현재 수용.)
- **`[10-45]`** 🟢 — MyViews fetch 로직(fetchViews/save/load/delete)을 `lib/savedView/savedViewClient.ts` 헬퍼로 추출 → 컴포넌트 순수 UI + 테스트 용이 (code-reviewer W5/S).
- 뷰 rename/덮어쓰기(UPDATE) API — 현재 저장=항상 새 뷰. RLS UPDATE 정책은 이미 있음, route 만 추가하면 됨 (필요 시).

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
