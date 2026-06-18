# M2 테마 C — UI 셸 + 유저 프리퍼런스 (task-record, 단일 진실)

> **상태**: 🔄 **진행 중** — Step 0(셸 골격) ✅ + 셸 트림(우측 패널 폐기) ✅ + Step 1(`user_preferences`+RLS) ✅ + **Step 2 (`saved_views` 영속화 + 계정 위젯 좌측 이전) ✅ 완료 (2026-06-16, 라이브 G2 통과)**. **🔄 Saved Views v2 진행 중 (§4): Sub-step 1 (PATCH API)·2 (activeViewStore) ✅ 완료 (2026-06-17) → ▶ 다음 = Sub-step 3 (자동 저장 훅)**. 그 다음 Step 4 (자유 텍스트 Custom Instructions, §5). (사용자 결정 2026-06-16. 구 Step 3 우측 세션 로그 = 폐기.)
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

## 3.5 Step 2 — saved_views 영속화 + 계정 위젯 좌측 이전 (✅ 완료, 2026-06-16)

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
- **Step 2** `saved_views` 영속화(좌 My Views) — ✅ **완료 (2026-06-16, 라이브 G2 통과)**. 상세 = §3.5. (★ 실제 구현은 service_role 아닌 인증 서버 클라이언트=RLS 적용으로 교정.)
- ~~**Step 3** 우측 세션 로그~~ — **폐기 (2026-06-15 scope 변경, 위 참조).**

### ▶▶ 다음 작업 순서 (사용자 결정 2026-06-16): Saved Views v2 → Step 4

> 사용자 결정: Step 2 의 "스냅샷 저장/복원" 을 **ChatGPT/Claude 식 "살아있는 뷰"** 로 진화시키는 **Saved Views v2 를 먼저**, 그 다음 Step 4(프리퍼런스). 둘 다 이번 세션 docs 반영 후 `/clear` → **다음 세션 착수**. (Phase 1 UIUX 협업 규율 유지 — 자율 확정 금지.)

- **Saved Views v2 (★ 다음 세션 첫 작업) — ChatGPT 식 살아있는 뷰** — 상세 = 아래 **§4**.
- **Step 4** `buildSystemPrompt <user_preferences>` 주입(F4) — ★ **자유 텍스트 "Custom Instructions"**(enum 선택지 아님, 사용자 결정 2026-06-16). 상세 = 아래 **§5**.
- **Step (마무리)** E2E + 라이브 RLS 격리(2-유저) + docs — 각 작업의 G2 게이트에 포함.

**scope 밖 이월**: F4 studies(MA/RSI 오버레이)=TradingView widgetembed→Advanced Chart 위젯 교체 선결 / 채팅 로그 영속 패널 = **폐기** / 유저 메모 카드 = `[10-43]` M2+ / 뷰 공유(LiveView Links) = M2+.

---

## 4. Saved Views v2 — ChatGPT 식 "살아있는 뷰" (🔄 진행 중 — Sub-step 1·2·3 ✅)

> **진행 상태 (2026-06-18)**: Sub-step 1·2·3·4·**5 (라이브 G2) ✅ 완료 = Saved Views v2 완결**. 라이브 G2 7/7 통과(create→save→자동저장→New view→복원→rename→**새로고침 자동 복원**) + 사용자 결정 2건 보강(새로고침 복원 + 상시 Saved 인디케이터). Sub-step 4 상세 = §4.9, Sub-step 5 = §4.10. **▶ 다음 = Step 4 (자유 텍스트 Custom Instructions, §5).**

> **사용자 비전 (2026-06-16)**: *"저장한 뷰에 들어가서 카드를 계속 생성·삭제하고, 나가도 그대로 보존, 이름 변경 가능 — gemini/claude/chatgpt 와 동일."* = PRD §5 *"Claude/ChatGPT 좌측 사이드바와 동일한 방식"* 의 완전 구현. Step 2(스냅샷 모델)를 **상호작용 모델 진화**로 업그레이드.

### 4.1 모델 변화 (스냅샷 → 살아있는 문서)

| | Step 2 (현재, 스냅샷) | v2 (목표, ChatGPT 모델) |
|---|---|---|
| 뷰 성격 | 저장 버튼 누른 순간 박제된 "사진" | 들어가서 계속 작업하는 **살아있는 문서** |
| 카드 추가/삭제 | 캔버스(휘발) 에서만 | **활성 뷰에 바로 자동 저장** |
| 이름 변경 | 불가 | rename 가능 |
| 멘탈 모델 | 내보내기/불러오기 | ChatGPT 대화 = 들어가면 이어서, 나가도 그대로 |

### 4.2 sub-step 분해 (roadmap-milestone-manager, 2026-06-16, ~15h) — UIUX 는 다음 세션 협업

1. **PATCH API** ✅ **완료 (2026-06-17)** — `app/api/views/route.ts` 에 `PATCH ?id=` 추가(rename=name / overwrite=cards_config+canvas_state). **DB 변경 0** — RLS UPDATE 정책 + `updated_at` 트리거 이미 존재(Step 2 자산). Step 2 zod 검증·byte cap(`Buffer.byteLength`)·IDOR 이중방어 패턴 재사용. 상세 = §4.5.
2. **activeViewStore** ✅ **완료 (2026-06-17)** — 신규 Zustand vanilla store(활성 뷰 id/이름/dirty/lastSavedAt). uiShell/canvas 에 안 끼움(god store 금지 선례 = uiShellStore). **localStorage 미러**(새로고침 후 활성 뷰 복원, 쓰기만 — 읽기+서버 재검증은 Sub-step 4). 상세 = §4.6.
3. **자동 저장 훅** (~2.5~3.5h, v2 심장) — `canvasStore.subscribe` → **debounce** → **직렬화 해시 멱등**(무변화면 PATCH 0) → PATCH. ★저사양 UHD620: dragstop/resizeEnd/moveEnd 시점만(매 프레임 X). 자문 `@nextjs-frontend-specialist`(debounce/저사양) + `@backend-infra-specialist`(멱등/충돌).
4. **MyViews 개편** (~2.5~3.5h) — "New view"(빈 작업공간) + rename(인라인) + 활성 뷰 강조/전환. 구 "+ Save current view"(수동 스냅샷) → v2 모델로 전환. **★ UIUX 사용자 협업 확정 필수**(new 버튼 위치/자동저장 표시/활성 강조/rename 흐름).
5. **라이브 G2 + 회귀** (~1.5~2.5h) — ChatGPT 시나리오 E2E(뷰 열기→카드 추가→나갔다 복귀 그대로→rename→new view) + 기존 195 test 회귀 0 + docs.

### 4.3 핵심 설계 권고 (사용자 ①~⑥ 대응, roadmap-mgr)
- **활성 뷰** = 신규 store + localStorage 캐시(서버 재검증). canvas/uiShell 분리 유지.
- **자동 저장** = debounce + **직렬화 해시 멱등**(무변화 시 PATCH 0 → 저사양 부담↓). 동시 탭 = **last-write-wins**(잠금은 deferred).
- **scratch(미저장)** = 첫 카드에 자동 생성 **안 함** — 명시 저장/New view 로만 row 생성(의도 분명). (다음 세션 사용자와 재확인 가능.)
- **재사용**: Step 2 의 `serialize.ts`/`schema.ts`/GET/DELETE = 100% 재사용. **신규는 PATCH·activeViewStore·자동저장 훅·MyViews 개편뿐.**
- **scope creep 경계**: Step 4 프리퍼런스 / 뷰 공유(LiveView Links) / 메모 카드 = v2 밖.

### 4.4 단일 진실
- 분해 메모리: `agent-memory/roadmap-milestone-manager/project_m2_themeC_viewsV2_breakdown.md`.
- **다음 시작점 = Sub-step 4 (MyViews 개편)**. ★ UIUX 사용자 협업 필수(New view 위치/rename 흐름/활성 강조/저장 인디케이터 표시 = crypto-trader "Saved ✓ 페이드 + Error 잔류"). Sub-step 3 가 산출한 `activeViewStore.saveState`(idle/saving/saved/error)를 인디케이터가 소비.

### 4.5 Sub-step 1 — PATCH API ✅ 완료 (2026-06-17)

- **산출 (수정 1)**: `apps/web/app/api/views/route.ts` 에 `PATCH` 핸들러 + `PatchSchema` 추가.
  - `PATCH /api/views?id=<uuid>`, body `{ name?, snapshot? }` — 둘 다 optional, `.refine()` 으로 **최소 하나 필수**. 자동 저장(Sub-step 3)=snapshot 만, rename(Sub-step 4)=name 만, 동시 전송도 허용(미래 확장).
  - **rename** → `name` 갱신. **overwrite** → `cards_config`+`canvas_state` 갱신. snapshot 은 POST 와 동일하게 `SavedViewSnapshotSchema`(strict, registry-derived) **재검증** → drift 카드가 자동 저장으로 DB 에 못 들어옴. + `Buffer.byteLength(utf8)` byte cap(>512KiB → 413).
  - **부분 수정**: 전달된 필드만 patch 객체에 화이트리스트 조립(`user_id` 미수령 → 바꿔치기 불가).
  - `UPDATE ... .eq("user_id").eq("id").select("id,name,updated_at").maybeSingle()` → data null 이면 **404**. `updated_at` 은 `set_updated_at_now()` 트리거 자동 갱신.
- **DB 변경 0** — RLS UPDATE 4정책·트리거 모두 Step 2 자산. proxy matcher `/api/views/:path*` 이미 등록(PATCH 자동 401 보호).
- **검증**: type-check ✅ / lint ✅ / **195 test PASS(회귀 0)**.
- **`@security-auditor` 0 Critical 승인** (6 중점 전부 PASS): IDOR(RLS USING+eq 이중→404) / 위장·바꿔치기(user_id 미수령+화이트리스트+WITH CHECK 삼중) / 404 정보누설 최소 / DoS(byte cap POST 동일, rename-only 누락 위험 없음 — name `.max(200)` 독립) / XSS(새 렌더 경로 신설 안 함·응답에 snapshot 에코 안 함) / strict 우회(바깥 PatchSchema.strict + 안쪽 snapshot/card/position/viewport 전부 strict). W-1(자동 저장 머지 전 XSS 전수 스윕 1회 권고)·W-2(라우트 `supabase.from` = 서버 경계 의도된 예외) 비블로킹.
- **★ RLS 런타임 실증** (Supabase MCP read-only, 위생 #7): `pg_policies` saved_views **4정책 모두 적용 확인** — UPDATE 정책 `qual`(USING)+`with_check` 둘 다 `(SELECT auth.uid())=user_id`, roles=authenticated. PATCH IDOR 방어가 코드+DB 양쪽 실재.

### 4.6 Sub-step 2 — activeViewStore ✅ 완료 (2026-06-17)

- **산출 (신규 4 + 수정 1)**:
  - ➕ `lib/stores/activeViewStore.ts` — Zustand vanilla store. state `{ activeViewId, activeViewName, dirty, lastSavedAt }` + actions `setActive`(뷰 진입=동기화) / `setActiveName`(rename 후 이름만) / `clearActive`(New view) / `markDirty`(캔버스 변경) / `markSaved`(자동 저장 성공). uiShellStore factory 패턴 복제.
  - ➕ `lib/stores/activeViewStorage.ts` — localStorage 미러 헬퍼(`persistActiveViewId`/`readPersistedActiveViewId`/`ACTIVE_VIEW_STORAGE_KEY`). SSR 가드(`typeof window`) + try/catch graceful(프라이빗 모드/쿼터 무시).
  - ➕ `lib/providers/ActiveViewStoreProvider.tsx` — useState lazy 단일 인스턴스 + Context + `useActiveViewStore` selector 훅. useEffect 에서 `store.subscribe` 로 **activeViewId 변경 시에만**(prevId 비교) localStorage 기록(dirty/lastSavedAt 변경엔 무반응).
  - ➕ `lib/stores/__tests__/activeViewStore.test.ts` — 상태 전이 6 + localStorage 미러 4(round-trip/null 제거/미저장/**graceful 예외**) = 10 신규.
  - ✏️ `app/layout.tsx` — `ActiveViewStoreProvider` 를 ToastStoreProvider 안 / CanvasStoreProvider 바깥에 등록(MyViews·자동 저장 훅이 activeView+canvas 둘 다 구독 가능).
- **검증**: type-check ✅ / lint ✅ / **205 test PASS**(195→+10, 회귀 0).
- **`@nextjs-frontend-specialist` 구조 결함 0**: SSR/hydration(effect-only localStorage·초기값 null) ✅ / subscribe 누수·Strict Mode(짝 cleanup) ✅ / prevId 필터(미들웨어보다 정합) ✅ / Provider 위치(canvas 바깥) ✅ / markDirty 멱등(selective+Object.is) ✅.
- **`@code-reviewer` 0 Critical**: god store 분리·graceful·파일분할·네이밍 모범. **W1**(throw 근거 주석 누락)·**W3**(graceful catch 테스트 누락) **즉시 반영**. W2(prevId)=유지. "소비처 없는 Provider"=정당한 foundation 판정(단 localStorage effect 는 "조용히 살아있음"=항상 null→removeItem, 무해).

### 4.7 ★ Sub-step 3 (자동 저장 훅) 인계 메모 (리뷰어 2 자문)

> 자동 저장 = `canvasStore.subscribe → markDirty → debounce → PATCH overwrite → markSaved`. 착수 전 반드시 반영:

1. **무한 루프 가드 (최대 함정, frontend B)** — 저장 성공이 canvas 를 mutate 하면(예: 서버 id 를 노드에 재기입) `canvasStore.subscribe` 재발화 → `markDirty` → 무한 루프. "저장 성공이 canvas 를 mutate 안 함" 또는 "mutate 시 dirty 재발화 억제" 가드 필수.
2. **마운트 동기화 순서 의존 (frontend Q1)** — `ActiveViewStoreProvider` effect 가 마운트 시 `persistActiveViewId(null)`=removeItem 으로 시작. Sub-step 4 복원은 `readPersistedActiveViewId()` 를 **이 effect 전에** 캡처하거나 Provider 가 기존 값 보존으로 시작하도록 순서 명시 설계.
3. **`lastSavedAt` 서버시각 정렬 (frontend A/Q6, code-reviewer S3)** — 현재 `setActive`/`markSaved` 가 클라 `Date.now()` 사용. 뷰 **로드** 직후에도 `setActive` 가 `Date.now()` 를 찍어 "5분 전 저장한 뷰"가 "방금 저장됨"으로 표시되는 약한 거짓(site=DB 정신과 약간 어긋남). 사용자에게 "N분 전 저장됨" 표시할 거면 서버 `updated_at`(PATCH/GET 응답)을 `markSaved(serverTs)` 로 받도록 전환 검토. 시간 로직 붙으면 store 테스트에 `vi.useFakeTimers()` 도입.
4. **selective 구독 강제 (frontend Q5)** — 소비 시 `useActiveViewStore((s) => s)` 전체 구독 금지. 필드별 selector 만(markDirty 멱등의 재렌더 0 보장 전제).
5. **crypto-trader UX 자문** — "트레이더가 언제 '저장됐다'고 느끼는가"(자동 저장 타이밍/인디케이터)는 Sub-step 3 착수 전 `@crypto-trader` 자문 권장.

### 4.8 Sub-step 3 — 자동 저장 훅 ✅ 완료 (2026-06-18)

> v2 의 "심장". 활성 뷰에 들어가 카드를 추가/삭제/드래그/팬하면 1.5초 debounce 후 자동으로 `PATCH /api/views?id=` 저장. 활성 뷰 없으면(scratch) 저장 안 함. **사용자 결정**: debounce **1.5초** + **최소 연결**(기존 MyViews 저장/로드에 setActive 만, UI 개편은 Sub-step 4).

- **산출 (신규 4 + 수정 4)**:
  - ➕ `lib/savedView/autoSaveController.ts` — **프레임워크 비의존 순수 엔진**. debounce / `lastSavedHash` 해시 멱등 / seeding / in-flight 가드+pendingAfterFlight / 조용한 재시도(1+2회) / saveState 전이 / flush(reason). React·fetch·Zustand 비의존 → fake timers 로 단위 테스트.
  - ➕ `lib/savedView/useAutoSaveActiveView.ts` — React 훅. canvasStore(nodes/viewport 변경) + activeViewStore(activeViewId=seeding) **비반응 구독**(store api getState/subscribe, 리렌더 0) + PATCH fetch + flush 안전망(visibilitychange/pagehide/언마운트).
  - ➕ `components/shell/AutoSaveActiveView.tsx` — null 렌더 마운트(CanvasShell 안, 두 Provider 스코프).
  - ➕ `lib/savedView/__tests__/autoSaveController.test.ts` — 12 테스트.
  - ✏️ `lib/stores/activeViewStore.ts` — `saveState`(idle/saving/saved/error) + `setSaveState` + `markSaved(serverTs?)`(서버 updated_at 수용=site=DB) + `setActive(id,name,lastSavedAt?)`.
  - ✏️ `lib/providers/ActiveViewStoreProvider.tsx` — `useActiveViewStoreApi()`(비반응 접근자, CanvasStoreProvider 미러).
  - ✏️ `components/shell/MyViews.tsx` — 최소 연결: 저장 성공→setActive(newId, created_at) / 로드 성공→(loadNodes·requestViewport 후) setActive(id, updated_at) / 활성 뷰 삭제→clearActive(404 방지).
  - ✏️ `components/canvas/CanvasWorkspace.tsx` — `<AutoSaveActiveView/>` 마운트.
- **5대 함정 방어 (§4.7)**: ① 무한 루프 = 저장 성공이 캔버스 미변경(activeViewStore 만) + 해시 멱등 이중방어 ② seeding = 활성 전환 시 현재 캔버스 해시 심어 로드 첫 발화 멱등(MyViews load→request→setActive 순서 고정) ③ 서버시각 = markSaved(updated_at) ④ selective = store api 비반응 구독 ⑤ flush 안전망 = keepalive PATCH.
- **검증**: type-check ✅ / lint ✅ / **217 test PASS**(205→+12, 회귀 0).
- **자문 3종 (수정 반영)**:
  - `@code-reviewer` **0 Critical**. W1(dispose 중 pendingAfterFlight 유실)·W3(seed saveState)·W4(in-flight 테스트) 반영, W2/W5/S=이월·수용.
  - `@nextjs-frontend-specialist` 🔴 2건 **즉시 반영**: ①드래그 매 프레임 store write → `dirtyNotified` 가드로 dirty-기간당 1회(저사양 핵심) ②dispose 후 in-flight PATCH 가 공유 store 오염 → await 후 store 쓰기에 `disposed` 가드(네트워크 PATCH 는 보내 데이터 보존). 🟡 keepalive 항상 on → **debounce off / 종료 flush 만 on**(64KB 상한 회피) + subscribe prevState 인자 사용.
  - `@backend-infra-specialist` **0 블록킹**: 멱등/LWW/PATCH 부하/keepalive/3경로 전부 OK. deferred 4건 제안.
- **잔여 이월(차단 아님)**: `[10-46]` 동시 탭 LWW(낙관적 잠금) / `[10-47]` keepalive 64KB vs 서버 512KiB cap 불일치 + flush 잔여 유실 / `[10-48]` z-order 선택 시 거짓 PATCH 1회 + seeding-during-inflight 세대 가드. Sub-step 4 재확인: 복원 시 seed 순서 + localStorage 복원 순서(§4.7 #2).
- **라이브 G2 = Sub-step 5(MyViews 개편 후 ChatGPT 시나리오 E2E)**. Sub-step 3 자체는 코드+단위+자문 완료.

### 4.10 Sub-step 5 — 라이브 G2 + 새로고침 복원 + 상시 인디케이터 ✅ 완료 (2026-06-18) = **Views v2 완결**

> Vercel + Playwright + Supabase MCP 교차검증. 라이브에서 2가지 발견 → 사용자 결정대로 보강 → 재검증 통과.

**라이브 G2 스코어카드 (site = DB 교차검증, 콘솔 에러 0)**:

| # | 시나리오 | 결과 | DB 증거 |
|---|---|---|---|
| A | 카드 생성 ("BTCUSDT price") | ✅ | 캔버스 BTCUSDT |
| B | "Save as view" → 활성 전환 | ✅ | DB `card_count=1`, Save 버튼 숨김(활성) |
| C | **자동 저장** (ETHUSDT 추가) | ✅ | `card_count` 1→2, `updated_at` 갱신, 인디케이터 **Saving… op=1 → Saved ✓ op=1 단일 eval 실측** |
| D | **New view** (빈 캔버스) | ✅ | ★**순서 불변식**: 빈 캔버스가 G2 뷰 안 덮어씀 (`card_count=2 유지`, updated_at 불변) |
| E | 복원 (행 클릭) | ✅ | BTCUSDT+ETHUSDT 복원 |
| F | **rename** (더블클릭) | ✅ | DB `name` 변경, `card_count` 유지 |
| G | **새로고침 자동 복원** | ✅ (보강 후) | 클릭 없이 카드 복원 + 활성 재설정 + **거짓 PATCH 0**(updated_at 불변=seed 멱등) |

**라이브 발견 2건 → 사용자 결정 보강 (commit `ef0a073`)**:
1. **새로고침 자동 복원 (G가 처음엔 ❌)** — Sub-step 4 까지는 복원 로직이 없었음(docs 가정 vs 미구현). 원인 = `ActiveViewStoreProvider` 가 마운트 시 `persistActiveViewId(null)` 로 직전 세션 id self-wipe(§4.7 #2 함정 적중) + 읽기/재수화 로직 부재. 보강: ① Provider 마운트 self-wipe 제거(읽기만, 변경 시만 미러 기록) ② 신규 `ActiveViewRestorer.tsx`(마운트 시 localStorage id → GET 재검증(RLS) → hydrate → loadNodes/requestViewport → setActive, 순서는 New view 거울, 비로그인/404/캔버스 비어있지않음 가드 + graceful) ③ CanvasShell 마운트. **라이브 재검증**: 뷰 활성화→새로고침→**카드 자동 복원 + updated_at 불변(seed 멱등으로 거짓 저장 0)** + 콘솔 0.
2. **상시 "Saved" 인디케이터 (crypto-trader Q1)** — 라이브 실측: 변경 후 1.5초 debounce + Saved✓ 2초 페이드 후엔 활성 행에 **아무 표시 없음**("저장됨"과 "쉬는 중"이 시각적으로 동일). 사용자 결정 = **상시 'Saved' 잔류**. ViewSaveIndicator: idle/saved 에서 "Saved ✓" 상시 표시(+ 마지막 저장 시각 hover title) + 2초 페이드/`key` remount 설계 폐기(더 단순). error 잔류 불변식 유지.

**추가 라이브 발견 → 즉시 fix (commit `8b56c06`)**: 인디케이터 hover tooltip 이 `toLocaleTimeString()` 무인자라 한국어 로케일("오후 6:28") 노출 → **English-only 정책 위반** → `'en-US'` 고정. (라이브 G2 가 잡은 잠복 결함 — `feedback_new_card_surfaces_latent_data_defect` 정신.)

**정리 + 추가 검증**: 테스트 뷰 삭제(UI) = **활성 뷰 삭제 → clearActive → localStorage 미러까지 정리**(orphan id 404 방지) 검증. 사용자 원본 뷰 2개 무손상.

**검증 종합**: type-check / lint / **217 test PASS(회귀 0)** × 3 commit. 콘솔 에러 0. site=DB 전 구간 일치.

**잔여 이월**: `[10-49]` 부분 회수(Q1 안심신호 = 상시 Saved 로 ✅ 해소) — 잔여 = Q2(rename 발견성 툴팁 의존) / W1(더블클릭-during-load 경계) / W3(Saving/error 시 인디케이터 폭 변동). `[10-50]`(flush-on-switch) 유지.

### 4.9 Sub-step 4 — MyViews 개편 ✅ 코드+자문 완료 (2026-06-18)

> v2 의 "얼굴". 완성된 자동 저장 엔진(Sub-step 3)을 화면에 노출 — 스냅샷 모델 UI 를 "살아있는 뷰"(ChatGPT/Claude 사이드바) 모델로 개편. **DB/store/API/엔진 변경 0**, 순수 컴포넌트 작업.

- **사용자 확정 UIUX (2026-06-18, AskUserQuestion 4문)**: ① **명시 저장 모델**(scratch 에서 "Save as view"로만 DB 뷰 생성, 자동 "Untitled" 생성 안 함) ② **더블클릭 인라인 rename** ③ **저장 인디케이터 = 활성 뷰 행 안**(Saved ✓ 페이드 / Error 잔류) ④ **New view = 헤더 옆 [+] 버튼**. 전부 권장안 채택(ChatGPT 패턴·저사양·확장성 정합).
- **산출 (신규 1 + 수정 1)**:
  - ➕ `components/shell/ViewSaveIndicator.tsx` — activeViewStore `saveState`/`lastSavedAt` **만** selective 구독(인디케이터 깜빡임이 MyViews 리렌더 0). `Saving…` / `Saved ✓`(2초 페이드) / `Couldn't save`(role="alert", 잔류). ★페이드는 `key={lastSavedAt}` remount + setTimeout-only setState 로 구현 = `react-hooks/set-state-in-effect`(effect 본문 동기 setState 금지) 회피.
  - ✏️ `components/shell/MyViews.tsx` — 헤더 [+] New view + Save as view(scratch 일 때만) + 행 클릭(200ms)=로드/더블클릭=rename + 활성 행 강조(좌측 바+배경) + ViewSaveIndicator. `useActiveViewStore(s=>s.activeViewId)` 만 반응 구독(나머지 비반응).
- **★ New view 순서 불변식**: `clearActive()` **먼저** → `loadNodes([])` **나중**. zustand `set`/`subscribe` 가 동기라, activeViewId 가 null 이 된 직후 빈 캔버스 변경의 동기 subscribe 가 발화해도 `notifyChange()` 가 `getActiveViewId()===null` 에서 즉시 빠짐 → **빈 카드를 기존 뷰에 PATCH 하는 사고 원천 차단**(순서 뒤집으면 위험). code-reviewer 가 엔진 코드 대조로 안전 확정.
- **검증**: type-check ✅ / lint ✅ / **217 test PASS(회귀 0)**.
- **자문 3종**:
  - `@code-reviewer` **0 Critical** — New view race/삭제·rename 동기화/클릭타이머 전부 안전 확정. **W2(handleRowClick busy 가드)·S4(error role="alert") 즉시 반영**. W1(더블클릭-during-load 경계)·W3(인디케이터 폭 출렁임)·W4(526줄 분리 추세)·S2 → `[10-49]`/관측 이월.
  - `@nextjs-frontend-specialist` **구조 결함 0 / OK** — 구독 경계(MyViews=activeViewId만, Indicator=saveState만 격리) "교과서적", 저사양 리렌더 0 달성. 클릭타이머·key remount·Strict Mode·Zustand selective 전부 안전. mountedRef 일관성(셸 고정 마운트라 무해)만 메모.
  - `@crypto-trader` 호평(Step 2 자문서 짚은 rename 부재 정확 해소, 스윙 최대 수혜). Q1(페이드 후 공백 안심신호)·Q2(rename 발견성)·Q3(패널 닫힘+error 잔류) → `[10-49]` 라이브 체감 결정.
- **신규 deferred**: `[10-49]`(💭 라이브 UX 묶음: 안심신호/rename 발견성/인디케이터 폭/더블클릭 경계) / `[10-50]`(🟢 flush-on-switch — 전환 시 1.5초 미만 마지막 변경 유실).
- **잔여**: 라이브 G2(Sub-step 5).

---

## 5. Step 4 — `<user_preferences>` 자유 텍스트 Custom Instructions 주입 (Views v2 다음, 미착수)

> **★ 설계 결정 (2026-06-16, 사용자)**: 프리퍼런스는 **enum 선택지가 아니라 자유 텍스트**. 이유 = enum 은 향후 데이터소스/컴포넌트 확장마다 손봐야 하고 AI 의도추론 공간을 죽임. **ChatGPT "Custom Instructions" 와 같은 자유 텍스트 1칸** 모델. 유저가 "BTC·ETH 무기한 4h, 가격 옆 항상 펀딩, 기본 USDT" 라고 적으면 AI 가 라이브 레지스트리에 비춰 적용 → 새 컴포넌트 추가 시 자동 반영(enum 불가능한 확장성).

### 5.1 자유 텍스트 + 프롬프트 인젝션 5겹 방어 (자유도 100% 보존)
1. **구분+프레이밍** — `<user_preferences>` 블록에 "이건 유저 제공 **정보**지 지시 아님, 현재 쿼리 미명시 시에만 기본값으로 적용, guardrails/output_format 못 덮어씀" 명시(Anthropic 권장 "data not instructions").
2. **우선순위 고정** — guardrails/output_format 이 프리퍼런스보다 항상 우선.
3. **구분자 탈출 차단** — 유저가 우리 XML 태그/마커 닫고 위조 시도 차단(`<`/`>` 이스케이프 + 마커 패턴 제거) + 길이 상한(~800자).
4. **출력단 백스톱(최강)** — 인젝션 일부 먹혀도 출력은 여전히 `tool_use`+`AiCardConfigSchema` Zod 강제 → 등록 id 의 유효 카드만 가능, 외부 API 도구 없음. 최악 = 이상한 유효 카드/거부.
5. **폭발 반경 = 본인 세션뿐** — 자기 프리퍼런스가 자기 세션에만(RLS 격리). 공격자=피해자 동일인 → self-sabotage 최악, cross-user 무해.

### 5.2 sub-step 골격 (Views v2 후 별도 분해 — UIUX 협업)
- `buildSystemPrompt.ts`: 미사용 `locale` 옵션 자리(`:142~148`) → `preferences` 확장. GUARDRAILS 다음 `<user_preferences>` 섹션. (정보형 — "User prefers X", 규칙 아님 = 하드코딩 금지.)
- `route.ts`: `user.id`(`:588`) → user_preferences 조회 → `orchestrateOnce`(`:379`) 전달 → `buildSystemPrompt({preferences})`(`:392`). **orchestrateOnce 시그니처에 preferences 전달 경로 추가.**
- `user_preferences.preferences` JSONB 키 = **`customInstructions`(string, 자유텍스트)** 1개로 시작(Step 1 deferred 키 확정).
- UI: 좌패널 프리퍼런스 편집 폼(자유 텍스트 textarea). UIUX 협업.
- 자문 **필수**: `@security-auditor`(인젝션 5겹) + `@ai-orchestrator-specialist`(주입 위치/토큰/하드코딩 경계) + `@code-reviewer`("정보 vs 규칙").
- **scope 밖**: F4 studies(MA/RSI) = Advanced Chart 위젯 교체 선결, 이월.
