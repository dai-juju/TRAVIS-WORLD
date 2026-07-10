# TRAVIS — M1 완료 후 M2 진입까지의 단계 계획

> **상태**: 초안 (2026-05-18 작성, 2026-05-20 Step 1.5 추가, 2026-05-27 M1.8 §8.3b ✅ + D20/D21/D22 ✅, **2026-06-01 M1.8.5 history backfill ✅ 완료 반영 — 선행 마일스톤 전부 종료, 본 §Step 2 실사용 피드백 진입 대기**).
> **현재 위치 (2026-06-07)**: **M1.9 ✅ 완료 + COINM 24~48h 안정성 PASS + `[8-34]` 회수** — Step 0~3 전부 통과, 종단 게이트 G1~G5 ✅. forward-fill USDM(무중단 `NRestarts=0`) + COINM(20 `_PERP` 라이브 실측, `markets=[usdm,coinm] tasks=6`) 라이브 가동 + site=DB 소수점 일치(USDM ~50셀 + COINM 24셀, OI contract 단위 검증) + ⓑ AbortSignal graceful 종료 2회 검증 + basis -1003 메커니즘 규명(Binance LB 노드 weight 풀 혼잡, basis weight 0, 우리 무관 — backoff 흡수). **✅ COINM 24~48h 안정성 PASS (2026-06-07, 롤아웃+22h: NRestarts=0·same-IP ban 0·DB 무구멍·채움률 ~100%)** + 점검 중 `[8-34]` LSR guard false positive(로그 ~40%) 동시 회수(`maxRatio` USDM 10/COINM 20, worker 134 test). 회수: `[8-26]`/`[8-3]`/`[8-20]`/`[8-31]`ⓐⓑⓒ/`[8-33]`/`[3-68]`/`[8-34]`. 잔여(차단 아님): `[8-31]`ⓓ circuit breaker / `[8-22]` warn 폭발 집계. **다음 = 본 §Step 2 (본인 실사용 + 베타테스터 피드백 수집).** 단일 진실: `docs/task-record/M1.9-complete.md` + `M1.9-coinm-stability.md`.
> **세션 재개 단일 진실 원천 (M1.9 ✅ 완료, 2026-06-06)**: **`docs/task-record/M1.9-complete.md`** ← `/clear` 후 가장 먼저 읽을 파일. **▶ 다음 세션 첫 작업 순서 (사용자 지정)**: ① ✅ **COINM 24~48h 안정성 체크 완료 (2026-06-07 PASS)** — NRestarts=0/22h 무중단 + same-IP ban 0(-1003 676회 전부 내부 LB IP) + DB 무구멍 누적·멱등 0·채움률 ~100%. 점검 중 `[8-34]` LSR guard false positive(로그 40%) 실측·동시 회수(maxRatio USDM 10/COINM 20). 단일 진실 `docs/task-record/M1.9-coinm-stability.md` → ② **본 §Step 2 실사용 피드백 수집 진입 (← 현재 여기, 사용자 결정 대기)**. 잔여(차단 아님): `[8-31]`ⓓ circuit breaker / `[8-22]` warn 폭발 집계 (둘 다 관련 작업 시 회수). (M1.9 상세 이력 `M1.9-step3-rollout.md`, Step 2 `M1.9-step2-forward-fill.md`.)
> **★ 2026-06-08 갱신 (Step 2 진행 중 → 확장 루프 병합 + 테마 A 착수)**: 실사용 **세션 #1 완료** — 6건(F1~F6) 코드·DB 확정 진단. **실측이 future.md 추측을 뒤집음**: "표현력 갭(§2) — 전 metric 카드 + 리스트 liveness"가 압도적 1순위(future.md 의 세션 컨텍스트 §4 추측 1순위를 제침). 사용자 **A-1 결정**: 본 §Step 2/3/5 를 **확장 루프로 병합**(백로그 + 테마 단위 한 번에 하나 착수 + 실사용 병렬), **테마 A 부터 즉시 착수**. **단일 진실 = `docs/task-record/M2-step2-usage-feedback.md` §H** (6건 진단 + 테마 A~D + 진행 모델). deferred 요약 = `[10-1]`~`[10-8]`. (본 §Step 2~5 본문은 원래 waterfall 계획 — 확장 루프 병합으로 사실상 §Step 3 우선순위 재배치가 §H 로 이미 1차 수행됨.)
> **★ 2026-06-10 갱신 (🔴 production 데이터 사고)**: 테마 A Step 0·1·2 코드 완료. Step 2 = IndicatorCard(funding/basis/OI/LSR/taker generic 적응 카드) + `[10-7]` dirty check + premium_index drift 재정합 + basis datasource 신설, push `1f9f448`. **단 라이브 site=DB 검증에서 `[10-11]` @arr 스트림 stall 사고 발견** — production 워커(178.105.38.94)에서 `@arr`(전 종목 배열) WS 스트림이 큰 프레임 stall → **USDM markPrice/funding frozen + 청산 43일 정지**. 카드는 무결, DB가 stale(과거 `[3-50]/[3-52]` payload-size 사고의 production 연장선, 재시작 복구 불가). **▶ /clear 후 첫 작업 = `[10-11]` @arr 근본 수정(모두 한 번에) → 테마 A Step 2 마무리(site=DB 회복) → Step 3 (사용자 결정 2026-06-10).** **단일 진실 = `docs/task-record/M2-themeA-incident-arr-stream-stall.md`** + 메모리 `reference_binance_arr_stream_stall.md`. (Step 2 산출 상세 = `M2-themeA-card-expressiveness.md §4`. 신규 deferred `[10-9]`/`[10-10]`/🔴`[10-11]`.)
> **★★★★ 2026-06-12 최종 — 테마 B ✅ 완결 (사용자 선언, 확장 루프 2회전 마감)**: 남은 게이트 3 전부 통과 — ① 운영 관측 PASS (26.6h 무재시작, `[10-11]`/`[3-50]`/`[10-13]` 묘비 + `[10-23]` 1단계 syncSymbols 24h→1h 동반 배포) → ② 워커 배포 `454b8ab` (warnQuoteMiss 0) → ③ 라이브 G2 5종 PASS (F2 오염 0 + Binance 수치 3종 일치 + log_chat 실측) → `[10-2]` 묘비. 신규 deferred `[10-30]`~`[10-35]`. 🟠 시한 신호: history 용량 ~136MB/일 → `[8-18]` 승격 + `[10-34]` (retention ~4주). **▶ /clear 후 다음 작업 = `[10-33]` "모든 코인 보기" 표현력 (1+2단계 통합, 사용자 결정)** — 차순위 `[10-15]`+`[8-18]`+`[10-34]` retention 묶음. 단일 진실 `docs/task-record/M2-themeB-quote-asset.md`.
> **★★★★★★ 2026-06-14 — `[10-33]` "모든 코인 보기" 표현력 ✅ 완료 (라이브 G2 PASS)**: 5-step(0 baseline → 1 sort/limit 직교 분리·describe 영문화·max(500) 제거 → 2 initialFetch fetchAll(.range() 페이지네이션·FETCH_HARD_CAP 3000)+order pushdown `[10-26]` 회수 → 3 @tanstack/react-virtual 도입 → 4 임계값 분기 가상화(>100)+limit=20 default 제거 → 5 G2). **라이브 G2 = Supabase 진실값 + Playwright DOM 교차검증**: "USDT pairs"→449 가상화·오염0 / "all spot"→1,447 / "top 10"→10 비가상화 / "top gainers"→AI 자율 10(하드코딩0). 자문 5종(zod/ai-orch/backend/frontend/reviewer 0 Critical + crypto-trader). `[10-33]`/`[10-26]` 묘비, 신규 `[10-38]`(잔여 describe 영문화)/`[10-39]`(quote 'U' 파싱, crypto-domain-expert 규명 대기). **▶ /clear 후 다음 작업 = 사용자 선택** (테마 C UI셸+프리퍼런스 / 테마 D 차트 / 경로 A WS직결 / `[10-39]` 'U' 규명 / `[10-38]` describe cleanup). 단일 진실 `docs/task-record/M2-[10-33]-all-coins.md`.
> **★★★★★★★ 2026-06-15 — `[10-39]` ✅ 종결 + 확장 루프 3회전 = 테마 C 착수 (Step 0 ✅)**: ① `[10-39]` phantom 'U' = **결함 아님 종결**('U'=Binance 실재 달러 스테이블 quote, 라이브 exchangeInfo+사용자 실거래소 확인+가격 정합, 코드 수정 0). crypto-domain over-conservative 오판→사용자 실측 정정 + genagent 3 에이전트 원칙 강화. 단일 진실 `M2-[10-39]-phantom-quote.md`. ② **테마 C (UI 셸 + 유저 프리퍼런스) 🔄 진행 중 — Step 0 (셸 골격) ✅ 완료**: flex Push 셸(좌 My Views/우 Session Log = 가장자리 rail+슬라이드 패널, 기본 둘 다 닫힘) + `uiShellStore`(Zustand vanilla) + Theme/User/Chat `fixed→absolute` 편입. 저사양 stutter 차단=폭 즉시변경+translateX 슬라이드(닫힘은 delay collapse=부드러운 대칭). 검증 type-check/lint/190 test 회귀0 + code-reviewer 0 Critical + 라이브 Playwright 정량(Push 정확 축소+채팅바 캔버스중앙 추종) + 사용자 라이브 OK. 신규 `[10-40]`🟠(닫힘 패널 포커스트랩 inert, Step 2 회수)/`[10-41]`🟡(ESC·단일패널·발견성 nudge). commit `c35c256`+`0287d9c`. **▶ /clear 후 다음 = 테마 C Step 1 (`user_preferences` 테이블+RLS)**. 단일 진실 `docs/task-record/M2-themeC-ui-shell.md`, 6-step 계획서 `~/.claude/plans/steady-petting-hellman.md`. ★ Phase 1 UIUX 는 사용자 협업 진행(자율 확정 금지).
> **★★★★★★★★★ 2026-06-16 — 테마 C Step 2 (`saved_views` 영속화 + 계정 위젯 좌측 이전) ✅ 완료 (라이브 G2 통과)**: 6 sub-step(0 계정 위젯 우상단→좌패널 상단+rail 점·AuthSessionProvider·commit B `a466c6b` → 1 saved_views 테이블+RLS 4정책 `90af032` → 2 직렬화 레이어(서버/클라 분리)+save-view/views API(인증 서버클라=RLS, service_role 아님)+canvasStore loadNodes `ee437de` → 3 My Views UI(인라인 저장/복원/삭제+pendingViewport 우편함) `d8f5e5a` → 4 inert(0 흡수, `[10-40]` 회수) → 5 라이브 G2+docs). **★ 라이브 G2 (Vercel+Playwright+Supabase MCP)**: 채팅→카드→저장(DB site=DB 일치)→**새로고침(0개)**→복원+**라이브 데이터 재연결**($66,420→$66,412, PRD §5 정확)→삭제(DB 0), 콘솔 0. 2-유저 RLS=정책 라이브 실측+IDOR 설계 입증(두 계정 라이브 베타 이월). 자문 security-auditor 3회/code-reviewer 3회 0 Critical. 둘째 user-owned-write 테이블 + 첫 영속화 워크플로. 신규 `[10-44]`(window.confirm→인라인 톤)/`[10-45]`(fetch 헬퍼). **▶▶ 다음 세션 첫 작업 (사용자 결정 2026-06-16, `/clear` 후) = Saved Views v2 (ChatGPT 식 "살아있는 뷰" — 활성뷰+자동저장+new/rename/delete, Step 2 진화. 5 sub-step ~15h: PATCH API→activeViewStore→자동저장 훅→MyViews 개편→G2) → 그 다음 Step 4 (★자유 텍스트 Custom Instructions, enum 기각 + 인젝션 5겹 방어).** 단일 진실 `docs/task-record/M2-themeC-ui-shell.md §4·§5`, 메모리 `project_m2_themeC_step2`.
> **★★★★★★★★★★ 2026-06-18 — Saved Views v2 Sub-step 1·2·3 ✅ (자동 저장 엔진 완성)**: Sub1 PATCH API(`2837d93`) + Sub2 activeViewStore+Provider(`e9c73b8`) + **Sub3 자동 저장 훅(`ead9485`)** — 활성 뷰에 카드 추가/삭제/드래그 시 1.5초 debounce 후 `PATCH /api/views` 자동 저장(scratch=저장 안 함). `autoSaveController`(순수 엔진: debounce/해시 멱등/seeding/in-flight/재시도/flush) + `useAutoSaveActiveView`(비반응 구독 리렌더0 + keepalive flush) + activeViewStore `saveState` + MyViews 최소 setActive. type-check/lint + **217 test(+12) 회귀0**. 자문 3종(code-reviewer 0C / nextjs 🔴2 즉시반영=dirtyNotified·disposed 가드·keepalive 분기 / backend 0블록킹). 라이브 G2=Sub-step 5 통합(사용자 결정). 신규 deferred `[10-46]`LWW/`[10-47]`keepalive64KB/`[10-48]`z-order. 단일 진실 `docs/task-record/M2-themeC-ui-shell.md §4.8`, 메모리 `project_m2_themeC_viewsV2`.
> **★★★★★★★★★★★ 2026-06-18 #2 — Saved Views v2 Sub-step 4 (MyViews 개편) ✅ 코드+자문 완료**: 완성된 자동 저장 엔진을 화면에 노출 — 스냅샷 UI → "살아있는 뷰"(ChatGPT 사이드바) 모델. **DB/store/API 변경 0**, 순수 컴포넌트(신규 `ViewSaveIndicator.tsx` + `MyViews.tsx` 개편). 사용자 UIUX 4문 확정(AskUserQuestion, 전부 권장안): ① 명시 저장(scratch "Save as view"만, 자동 Untitled X) ② 더블클릭 인라인 rename ③ 저장 인디케이터=활성 행 안(Saved✓ 페이드/Error 잔류) ④ New view=헤더 [+]. **★ New view 순서 불변식**: `clearActive()` 먼저→`loadNodes([])` 나중(zustand 동기 subscribe → activeViewId=null 후 빈 캔버스 변경이 `notifyChange` early-return 에 막혀 기존 뷰 빈카드 PATCH 차단). 구독 격리=MyViews(activeViewId만)/Indicator(saveState만)→저사양 리렌더0. 페이드=`key={lastSavedAt}` remount(set-state-in-effect 룰 회피). type-check/lint + **217 test 회귀0**. 자문 3종(code-reviewer 0C·W2/S4 즉시반영 / nextjs 구조결함0·"교과서적" / crypto-trader 호평·rename부재 해소). 신규 deferred `[10-49]`(💭 라이브 UX: 안심신호/rename 발견성/인디케이터 폭/더블클릭 경계)·`[10-50]`(🟢 flush-on-switch). 단일 진실 `docs/task-record/M2-themeC-ui-shell.md §4.9`.
> **★★★★★★★★★★★★ 2026-06-18 #3 — Saved Views v2 Sub-step 5 (라이브 G2) ✅ = 🎉 Views v2 완결**: Vercel+Playwright+Supabase MCP **라이브 G2 7/7 통과**(create→save→자동저장(card_count 1→2 site=DB)→New view(★순서 불변식 라이브: 빈 캔버스가 기존 뷰 안 덮어씀, updated_at 불변)→복원→rename→**새로고침 자동 복원**), 콘솔 에러 0. **라이브 발견 2건 사용자 결정 보강(`ef0a073`)**: ① **새로고침 자동 복원**(Sub-step 4 까진 미구현=docs 가정 vs 실제 / §4.7 #2 함정 적중: Provider 마운트 self-wipe 제거 + 신규 `ActiveViewRestorer`(localStorage→GET 재검증→hydrate→loadNodes→setActive, 순서=New view 거울) → 라이브 재검증 카드 자동 복원 + **거짓 PATCH 0**=seed 멱등) ② **상시 "Saved" 인디케이터**(라이브 실측 페이드 후 공백="저장됨"="쉬는중" → 사용자 결정 상시 잔류 + 마지막 저장시각 hover, 페이드/key remount 폐기=더 단순). **추가 fix(`8b56c06`)**: tooltip `toLocaleTimeString()` 한국어 로케일 → `'en-US'`(English-only 위반, 라이브가 잡음). 활성뷰 삭제→clearActive→localStorage 정리 검증. 217 test×3 commit 회귀0. `[10-49]`① ✅ 회수(잔여 Q2 rename발견성/W1/W3) / `[10-50]` 유지. **▶ 다음 = Step 4 (자유 텍스트 Custom Instructions, `M2-themeC-ui-shell.md §5`).** 단일 진실 `docs/task-record/M2-themeC-ui-shell.md §4.10`.
> **★★★★★★★★★★★★★★ 2026-06-22 — 확장 루프 4회전 = 경로 A (WS 프론트 직결) 🔄 진행 중, 토대 완성**: PRD 3대 데이터 경로 중 **유일 미구현** 경로 A(WS→프론트 직결, Supabase 미경유) 착수 — 사용자 실측 "박동"(`[10-1]`(a), 경로 B 500ms throttle 구조 하한)의 근본 해법 + liveness 나머지 절반. **★ 핵심 설계(사용자 결정)**: 불투명 토픽(운반층 미파싱·전역 규격 금지) + 자유 payload(소비자 Zod) = 추후 뉴스/온체인/타 거래소가 토픽만 추가해 꽂히는 범용 파이프. **완료**: Step 1(워커 WS 서버 셸 `ws-server/`: LiveBus+LiveWsServer+envelope, tickerWsHandler publish? 가산, smoke 62ms, `8bc171e`) + Step 3a(레지스트리 `transport`(default realtime=하위호환)+`liveTopicSpec`+`buildLiveTopic` 단일 진실+superRefine, AI 비노출, `5b26143`) + Step 3b(프론트 라우터 `transport`/`liveConnection`/`liveTopicManager`=channelManager 쌍둥이+useDataServiceRow ws_direct 분기, **휴면=화면 변화 0**, `e367810`). **★ 경계 조정(사용자 동의)**: 워커 배선=토픽이 프론트와 일치해야 하는 "플립"과 한 몸 → **Step 4 로 합침**(Step 3=계약+프론트만=워커 무접촉). 검증: 각 step type-check/lint green + 회귀 0(worker 181/shared 44/web 284) + code-reviewer 0 Critical ×3. 자문 genagent(신규 에이전트 불필요)/roadmap-mgr(5-step 분해)/backend-infra(아키텍처)/zod(계약)/nextjs(훅)/crypto-trader(실시간 metric 가치). 신규 deferred `[10-52]`(WS 구독 cap, Step 2 외부노출 전)·`[10-53]`(플립 선결: 재연결 error 깜빡임 crypto-trader 자문 + seq 순서). **▶▶ 다음 세션 (사용자 결정 2026-06-22, `/clear` 후) = 도메인 확보 → Step 2(wss Caddy TLS+JWT 인증, 서브도메인 1개 필요) → Step 4(플립: 워커 buildLiveTopic 전환 + ticker `ws_direct` + TickerCard selector + 라이브 "박동 소멸" 검증).** 단일 진실 `docs/task-record/M2-pathA-ws-direct.md`(재개 가이드 포함), 메모리 `project_m2_pathA_step1`. **⚠️ 이 포인터는 ↓ 06-22 #2(아래)로 갱신됨 — 도메인 확보 완료 + Step 2 Phase 1 ✅, 다음은 Step 2 Phase 2 인프라.**
> **★★★★★★★★★★★★★★★ 2026-06-22 #2 — 경로 A Step 2 Phase 1 (워커 WS 서버 JWT 인증, 서버 측 코드) ✅**: 도메인 `use-travis.com`(Cloudflare) 확보로 착수. **Step 2 = Phase 1(서버 인증 코드, Claude 작성) + Phase 2(인프라: DNS/Caddy/방화벽/재배포, 사용자 실행+Claude 안내 — SSH 미접근)**. 확정: `ws.use-travis.com` + **DNS-only + Caddy Let's Encrypt 직접 발급**(CF 프록시 미사용=무료 WS 100초 timeout 회피, security-auditor 조건부 수용) / **JWT=HS256 로컬 검증**(`jose`, 비대칭 키 기각=워커가 이미 service_role 보유→blast radius 동일=과설계) / 토큰=`Sec-WebSocket-Protocol` subprotocol·검증=핸드셰이크(verifyClient) / **fail-closed+graceful-degrade**(secret 없으면 WS만 비활성, 수집=경로 B 보존) / `WS_PUBLIC_HOST` env 철회(Caddy 소유) / 프론트 토큰첨부→Step 4 이동(휴면 connect 비동기화가 284 웹 테스트 흔듦). 산출: `auth.ts`/`rateLimiter.ts`/`WsServer.ts`(verifyClient 인증+구독cap100+rate close4429+ping/pong+만료close4401+maxPayload4KB+토픽256) + index.ts 배선 + worker.env.example + smoke + jose. 검증: type-check(-r 6)/lint green + **worker 200 test PASS(181→+19, 회귀 0)** + smoke PASS(무토큰 거부+유효 토큰 통과+62ms) + **security-auditor 2회(사전 DNS-only 조건부 수용 + 코드 재감사 외부노출 조건부 가능) 0C + code-reviewer 0C**(즉시 반영: 주석/미세누수/타이머 클램프/만료 테스트). 회수 `[10-52]`, 신규 `[10-54]`/`[10-55]`/`[10-56]`(🔵 Launch Readiness). commit `7824148`. **▶▶ 다음 세션 (`/clear` 후) = Step 2 Phase 2 인프라 (사용자와 함께 라이브 세션: Hetzner 워커 IP 실측→Cloudflare DNS A `ws`→Caddy 설치→방화벽 443/8081→worker.env `SUPABASE_JWT_SECRET`+재배포→Vercel `NEXT_PUBLIC_WS_URL`→인증 wss 연결 검증+security-auditor 노출-직후 재감사) → 그 후 Step 4 플립(박동 소멸).** 단일 진실 `docs/task-record/M2-pathA-ws-direct.md §2.6·§3`, 메모리 `project_m2_pathA_step2`.
> **★★★★★★★★★★★★★★★★ 2026-06-23 — 경로 A Step 2 Phase 2 (wss 인프라 라이브 배포) ✅**: 사용자와 라이브 SSH/콘솔 세션으로 `wss://ws.use-travis.com` 외부 노출 완료 (**코드 변경 0**, 순수 인프라). 순서 = 워커 `178.105.38.94` git pull `e99ae44`(★ 6-12 가동본에 ws-server 코드 없어 git pull 필수였음 — runbook "restart만" 보정) + `pnpm install`(jose@6.2.3) + `SUPABASE_JWT_SECRET`(86자) 주입 + 재시작 → `127.0.0.1:8081` JWT 인증 활성(fail-closed→활성 라이브 실증) → ufw 80/443(8081/2019 차단, curl timeout 실증) → Cloudflare DNS-only `ws`→IP → Caddy 2.6.2 LE 인증서(tls-alpn-01 발급 성공) → 무토큰 `wscat`→**401** 라이브. **`@security-auditor` 노출-직후 재감사 0 Critical / 4 Warn / 9 Pass** (W-1~W-5 전부 충족, W-1 Caddy admin 2019 `127.0.0.1` loopback 실측 해소). ★ 위조/유효 토큰 라이브는 wscat subprotocol 배열 2개 전송 불가로 **Step 4(브라우저 WebSocket)** 이동(위조 거부는 무토큰과 동일 verifyClient = auth.test 9 + 5-A 401 입증). 신규 `[10-57]`(커널 재부팅 W-4)/`[10-55]` 보강(fail2ban·`ufw limit 22` W-3)/`[10-56]` 재확인(W-2). **라이브 세션 교훈**: PS→SSH 멀티라인 복붙이 `&&`·따옴표·콤마에서 반복 깨짐 → 한 줄·printf·따옴표 제거로 회피. ~~**▶▶ 다음 = Step 4 플립**~~ — ↓ 06-23 #2 로 갱신(Step 4 Phase A ✅). 단일 진실 `docs/task-record/M2-pathA-ws-direct.md §2.6.5`, 메모리 `project_m2_pathA_step2`.
> **★★★★★★★★★★★★★★★★★★ 2026-06-24 — 경로 A Step 4 Phase B (플립 라이브) ✅ = 🎉 경로 A 완료 (PRD 3대 데이터 경로 전부 구현)**: 사용자와 라이브 세션(SSH 워커 재배포 + 브라우저 G2). 커밋 ①`f074ce1`(C1 워커 updated_at 방송 주입, code-reviewer 발견) → B-1 워커 재배포 → ②`d1a0dae`(플립 transport ws_direct + 옵션C UI) → **★ 라이브 사고 ES256**: 플립 직후 WS 전량 `malformed` 거부 → 원인 = 이 Supabase 프로젝트가 이미 **비대칭 ES256 서명**으로 마이그레이션(HS256 검증 불가, Step 2 "HS256 충분" 가정을 라이브가 정정 = `feedback_external_api_live_smoke`) → 수정 `ecdcaa4`(createSupabaseTokenVerifier = JWKS 공개키 ES256 검증, security-auditor 0C/3W/8P, 공개키만 보유=위조 불가) + 워커 재배포(거부 0) → ③`3c05a37`(English-only "근사"→"approx"+LoadingStub) + `<flash commit>`(% badge flash 표시값 변화시만). **라이브 G2 전부 PASS**: 박동 소멸(가격 ~1초 매끄러움 사용자 실측) + site=DB(`@crypto-domain` 24H low/high 소수점 일치·last≠mark·24h rolling 정의 확인) + 토큰 통과 + W3 경고 소멸. 회수 `[10-1]`(a)/`[10-53]` 묘비. 신규 `[10-64]`/`[10-65]`(JWKS 알람·issuer)·`[10-66]`(updated_at 정밀화)·`[10-67]`(crypto-trader UX advisory). **▶▶ 다음 (`/clear` 후, 사용자 결정 2026-06-24) = 경로 A fast-follow 3종 순차 착수 → 그 후 새 테마**: ① funding/마크가격 경로 A(이미 site=DB 검증=안전한 다음 수, swing 가치 / 워커 markPrice@1s 이미 WS 수신 중 → publish 가산이 핵심) → ② 청산 피드 카드(스캘퍼, forceOrder WS 수신 중, 신규 카드 필요) → ③ trade+호가(스캘퍼 최고 가치, ⚠️ 저사양 가상화·throttle 선결). 각 항목 = "워커 핸들러 publish 가산(tickerWsHandler 선례) + datasource liveTopicSpec+transport:ws_direct + (필요시)카드", 착수 시 `@roadmap-milestone-manager` 분해. 단일 진실 `docs/task-record/M2-pathA-ws-direct.md §3 Phase B 라이브 완결` + `docs/ROADMAP.md §경로 A ▶ 다음`, 메모리 `project_m2_pathA_complete`.
> **★★★★★★★★★★★★★★★★★★★ 2026-06-26~27 — fast-follow #1 (마크가격/펀딩) ✅ 완결 + 방향 재확인**: 경로 A fast-follow #1 = **IndicatorCard 개조**(전용 카드 X) 6-step 완료(Phase A 휴면 1·2·3 / Phase B 라이브 4·5·6). **라이브 G2 5게이트 PASS**(박동 소멸 + 혼합 컬럼 무손실(partial-merge 라이브 증명) + site=DB + ES256 + `[10-62]` 해소). ★ 라이브 사고 = AI 가 marketType 누락→토픽 frozen→2겹 hotfix `54d7b98`(hooks 경로B 폴백 + aiCardConfig superRefine marketType 필수). **★ 사용자 방향 재확인 (2026-06-27, 전체 docs 파악 세션)**: ① 경로 A fast-follow 트랙 **계속** (= 본 M2-plan §Step 3 "확장 루프" 그대로) — 다음 = **fast-follow #2 (청산 피드 카드)**, 착수 전 `[10-68]`(워커 publish 헬퍼 추출) 선결 + `[10-69]`(basis 418 모니터)/`[10-67]`(crypto-trader advisory) 검토 → ② 그 후 `docs/task-record/M2-step2-usage-feedback.md` 대로 **실사용 병렬 계속** (불편 발견 시 백로그 흡수 후 테마/항목 단위 수정). **▶▶ 다음 (`/clear` 후) = `[10-68]` 헬퍼 추출 → fast-follow #2 착수(`@roadmap-milestone-manager` 분해 + plan mode).** 단일 진실 `docs/task-record/M2-pathA-ws-direct.md §4`(fast-follow) + `M2-step2-usage-feedback.md`(실사용 백로그).
> **★★★★★★★★★★★★★★★★★★★★ 2026-06-27 #2 — fast-follow #2 (청산 피드 카드) 🔄 Phase A non-web 전부 ✅**: `[10-68]` makeTopicPublisher 헬퍼 추출(`b272eac`) 선결 회수 후 ff#2 착수. 청산 = **PRD §3 `content` updateMode 첫 실사용**. **Step 1 ✅**(자문 게이트: 사용자 결정 ①스코프=둘 다 AI 자율분기[전체 tape+심볼별] ②임계값=AI 쿼리 조절[하드코딩 X] ③색=시장영향방향+LONG/SHORT 라벨) → **Step 3a ✅**(`3ba6fe1` 토픽 프리미티브 keystone: `optionalSelectorKeys`+`buildLiveTopics`+단수=복수 마지막 원소 파생) → **Step 3b ✅**(`5d36ff3` ★ **liquidation datasource 이미 존재**[table `history_futures_liquidation`, `!forceOrder@arr` 수집 중, resolveDatasourceTable 테스트가 중복 적발] → ff#1 식 경로 A 플립, liveTopicSpec 추가·transport realtime 휴면) → **Step 2 ✅**(`359db77` 워커 forceOrder publish 가산: makeTopicPublisher buildLiveTopics fan-out + allowlist 방송필터[insert 무회귀] + index.ts 배선). 검증 각 step type-check/lint/test green(shared 60/worker 231/web 298 회귀0) + code-reviewer 0C ×3. transport 휴면 = **화면 변화 0**. 신규 deferred `[10-71]`(web lint eslint-plugin-import 누락)·`[10-72]`(notional USD enrich + COINM 심볼 매칭 = crypto-domain 라이브 검증, Phase B 전). **▶▶ 다음 (`/clear` 후, 사용자 결정 2026-06-27) = Step 4 부터** — web 첫 손댐이라 **`[10-71]` 선결**(`pnpm add -D eslint-plugin-import --filter @travis/web`, 8GB 저사양 사용자 확인) → **Step 4 `useDataServiceFeed` 훅**(append+evict 링버퍼 = content updateMode 첫 실사용 = ff#2 진짜 신규 코어, `@nextjs-frontend-specialist`) → Step 5 카드+컴포넌트+refine 일반화 → Step 6 Phase B 라이브 플립+G2. 단일 진실 `docs/task-record/M2-pathA-ff2-liquidation.md`, 메모리 `project_m2_pathA_ff2`.
> **★★★★★★★★★★★★★★★★★★★★★★ 2026-07-05~06 — ff#2 재개 = Composable "Feed form + 청산" ✅ 완결 (확장 루프 6회전 = Stage 3 events 첫 시민)**: 모양-제네릭 **feed-card**(events 2번째 form) + **청산×table-card 8번째 datasource**(같은 데이터 두 형태 — "watch"→피드/"biggest"→표 **AI 자율 분기 라이브 실측**) + **피드 과거 seed**(훅 불변식 G, 사용자 결정) + subscribesByTopic refine 일반화(frozen 카드 스키마 차단) + notional(USD) DB 컬럼·방송(z×ap / zEff×contractSize) + 범위 연산자 서버 pushdown 신설 + maxRows 상한. **🔴 Binance CM migration(6-30 발효)發 COINM 오염 21.9만 행 당일 규명(`st` 권위 판별자, `[10-14]` 적중)·2단 가드·전량 DELETE·재오염 0 실측**. 라이브 G2 전 게이트 PASS(site=DB 삼중 일치: tape 3행 z×ap 공식 재계산 + biggest 8행 + ETH seed 15행 / sampled subtitle AI 자작). 커밋 9개(`208e412`…`aad6891`) + 자문 누적 0 Critical. `[10-72]`/`[10-73]`/`[10-75]`/`[10-76]` 회수·묘비, 신규 `[10-78]`~`[10-83]`. 단일 진실 **`M2-pathA-ff2-liquidation.md`**. ~~▶ 다음 = `[10-77]` Realtime throttle → GenericChart~~ (↓ 07-07 로 갱신).
> **★★★★★★★★★★★★★★★★★★★★★★★★★★ 2026-07-10 — 🎉 사이클 2 (GenericChart) ✅ 완결 — Step 6 라이브 G2 7종 전부 PASS + G2 적발 결함 3건 당일 수정**: G2(Playwright+Supabase MCP+Binance 공식 API — 사용자 결정: 육안은 API 대조 갈음) = ①site=DB **공식 `/fapi/v1/fundingRate` 3연속 8자리 완전 일치**(BTCUSDT 07-10 00:00 UTC 0.00009058) + 차트 툴팁 DB 10지점 일치(BTCUSDT/COINM/XAUUSDT — 4h 상품 페어군·연속 0 도 공식 그대로) ②AI 분기 log_chat 8/8(★COINM 명시 쿼리가 Custom Instructions "only USDT" soft default 를 이김 = 테마 C 설계 라이브 검증) ③오버레이 stepped ④7카드 공존·콘솔 0 ⑤시맨틱(0선·부호색·토글 자동 숨김) ⑥⑦ + 08:00 정산 증분 수집 첫 실전 PASS. **결함 3건 당일 수정**: **N1**(`c2515ae`) = indicator "last settled"가 `premiumIndex.lastFundingRate` 저장 — crypto-domain 판정 **predicted 스냅샷 네이밍 트랩(3번째 재현)**, M1.8 §8.2a-2 잠복 위생 #9 위반을 Step 6 공식 파이프가 가시화 → worker 채움 제거+collector cycle 반영(Option D, rate·time 한 쌍 + COINM `.map` index 잠복 버그 동시 제거, **배포 순서 = worker 먼저→collector**) / **줌 툴팁**(`ec4bb06`) = RF 줌 0.691 에서 uPlot 좌표 오해석 → 오스냅+최신 31% 도달 불가(crypto-trader P1) → cursor.move 보정 / **y축 부호 소실** = 고정 64px 왼쪽 잘림("-0.00500%"→"0.00500%" 오독) → yAxisSize 동적+AXIS_FONT 단일화. `[10-92]` 4건 회수 동반(subtitle 뱃지·freshness 날짜·flex-wrap). reviewer 2회+crypto-trader+crypto-domain **전부 0C**. web 447/worker 272/collector 8(신규). 신규 `[10-97]`~`[10-99]`, `[10-93]` 주기 정규화 보강(APR 권고). **✅ 배포까지 완료 (같은 날 09:07~09:09 UTC)**: worker(`/opt/travis`, ★`Restart=always` sudo-free kill — collector 와 동일 패턴 신규 확인) → collector(서비스명 `travis-collector-history`) 재시작 → 첫 사이클 "last_settled 반영 USDM 702/COINM 20 심볼" 로그 + DB 실측 3심볼 공식 값 정합 + Phase B Vercel 재검증(줌 툴팁·y축 부호·freshness). **▶▶ 다음 세션(`/clear` 후) = `[10-35]` forward-fill lag 사이클 착수**(사용자 확정 2026-07-10, Stage 4 선행 — 차트가 가시화한 신선도 결함. plan mode + `@roadmap-milestone-manager` 분해 + `@backend-infra-specialist` 자문[순회 재설계 vs interval 우선순위 큐, /futures/data 1000req/5min IP quota 제약]). 단일 진실 = `task-record/M2-cycle2-genericchart.md §4i`.
> **★★★★★★★★★★★★★★★★★★★★★★★★★ 2026-07-09 #2 — 사이클 2 Step 6 펀딩 코드+데이터 ✅ (잔여 = 별도 라이브 G2 만)**: plan mode(자문 4: crypto-domain 공식문서 4건 + Explore 배관 + roadmap-mgr + Plan 검증) + 사용자 5결정(①**별도 이벤트 테이블 `history_futures_funding`** — 도메인 자문이 착수 가이드 원안["기존 컬럼 채움"] 기각: interval 버킷 복제=가짜 포인트[site=DB 위반]+동적 1h 신호 소실+쓰기 95배 ②죽은 컬럼 2 DROP[23→21] ③backfill/retention 60일 ④COINM 포함 ⑤bars 부호색+오버레이 stepped — **펀딩 전용 카드 아님**, chart-card 그리기 어휘 확장). **★검증이 결함 2건 사전 적발**: Plan(rateLimiterGroup 게이트가 `/fapi/v1/fundingRate`[fundingInfo 공유 500/5min 특수 풀]를 무음 무제한 통과 → `limiterBucketForPath` 단일 진실+funding 버킷 80/min) / 라이브 smoke(동시정산 ~687심볼이 페이지 경계에서 잘리면 last+1 전진=무음 유실 → last 포함 재조회[멱등]). 구현 = migration `20260709000001`(사용자 Dashboard 실행 + MCP 검증 3종 PASS + 타입 재생성 diff 정합) + fundingRateFetchers(USDM **symbol 생략 전역 페이지네이션**=배치 API 정공 / COINM per-symbol) + `fundingHistoryTask`(첫 cycle=60일 backfill, TRADING allowlist) + registry funding_history(interval 없음) + chartDescriptors 7번째(bars·0 midline·%5자리·고정 라벨 금지·defaultRefreshMs) + chartFormat bars(disp.fill 부호색)/stepped + ChartCard AI interval 오염 가드(registry 파생). **배포**: collector 재시작 = ★sudo-free(travis 소유+`Restart=always`→kill — 비밀번호 불통 우회, 서버별 상이 추정) → **backfill 완주 USDM 196,600행/691심볼/60일**(allowlist-drop 6,342 = 위생 #2 실증) + COINM 3,580행/20심볼 → Phase 3 push(Vercel). reviewer 2회 **0C**(메모리 2건 신설: 컬럼 DROP grep 이 테스트 핀 놓침 / form desc 에 datasource id 지목 금지) + shared 89/web 442/worker 273 green. canonical §2.1.1(이산성) + DB_SCHEMA(funding 테이블) + deferred `[10-94]`~`[10-96]`. 커밋 4(`682a2c8`·`1659121`·`d7b0dad`·`6c594e3`). **▶▶ 다음 세션(`/clear` 후) = Step 6 별도 라이브 G2**(`M2-cycle2-genericchart.md §4h` 끝 게이트 7종: ①site=DB Binance "Funding Rate History" %5자리[BTC+4h 심볼+COINM 스팟, CoinGlass 교차] ②AI 분기["BTC funding"→indicator vs "funding history"→chart bars] ③오버레이→stepped ④기존 6 차트+전 카드 회귀 0 ⑤시맨틱 육안[0선·부호색·토글 부재] ⑥`[10-92]` 관찰 ⑦crypto-trader UX) → **통과 시 사이클 2 완결 선언 + 상위 문서 완결 전파**. 단일 진실 = `task-record/M2-cycle2-genericchart.md §4h`.
> **★★★★★★★★★★★★★★★★★★★★★★★★ 2026-07-08~09 — 사이클 2 GenericChart Step 1~5 + UIUX ✅ (Step 6 펀딩만 잔여) + 사이클 1 G3 PASS 완결**: **07-08**: 계획(6-step 분해·uPlot 확정·펀딩 0행 실측→Step 6) → Step 1 Shape 계약(servableShapes×acceptsShapes 2층 게이트) → Step 2 `useDataServiceSeries`(per-symbol 병렬 7ms vs IN 500ms 실측) → Step 3 history datasource 6종+chartDescriptors → Step 4 GenericChart form(uPlot, 미등록 격리 — Step 3·4 로컬 커밋만 = 배포 원자성). **07-09**: **Step 5 chart-card 등록**(실코드 2곳 — superRefine/렌더 게이트/AI 프롬프트 registry 파생 자동 = 확장성 실증) + **원자적 일괄 push + 라이브 G2 전 게이트 PASS**: AI 자율 분기 5/5(trend→chart/top→table/funding→indicator/watch→feed) + ★**"compare" 대조 실험**(시간축 단서 유무 → table↔chart 자율 분기 = Form↔Data 직교 실증 3호, log_chat 박제) + limit=시간범위 역산(24h@5m→288) + site=DB 모양 일치(Binance 시간대 정렬). **라이브 hotfix 4연쇄**(전부 개발환경 불가시 부류): `383fc3e` marketType 누락 500(PK prefix 단절 9.8s 풀스캔 EXPLAIN 실측 → description+registry 파생 가드 2겹, ff#1 선례) / `24bcaab` 카드 점진 축소(uPlot read→write 되먹임 → absolute inset-0 격리, RF v12 는 소스 검증 무죄) / `8d59a49` RO 초기발화 소진(생성 직후 재-observe) / `c1670cc` ★진범 **uPlot.min.css import 누락**(canvas CSS 를 스타일시트에 위임하는 구조 → DPR=1 개발환경은 우연히 정상, 사용자 DPR 1.25 만 잘림 + `uPlot.pxRatio=1` 클램프 no-op 판명[1.6.32 클로저 변수, mock 사각]). **UIUX 확장 — 사용자 4결정**(AskUserQuestion 프리뷰 협의): 플로팅 툴팁(uPlot plugin 명령형 격리) · interval 토글 **9종 registry enum 파생**(하드코딩 0) · 포인트수 유지 · freshness "last point (Nh ago)"(useNow 5s — 렌더 Date.now() 를 react-hooks/purity 가 실차단 → IndicatorCard 선례 정정) + crypto-trader·code-reviewer 0C. **사이클 1 G3 PASS 완결**(Realtime 1.41M/5M 28%·일별 피크 473K→~100K 하향·favicon 404 소멸·deadlock 0) = `[10-77]` 묘비. 부수: `[10-35]` forward-fill lag 사용자-facing 실증(5m 8.6h, 재평가 후보). 신규 `[10-91]`(scope 스키마 미강제)·`[10-92]`(chart 폴리시 묶음)·`[10-93]`(오버레이 %정규화 💭), 메모리 3건(stateguard 부재 refine 인용/ISO 사전식 비교/기존 갱신). 커밋 13개 push. **▶▶ 다음 세션(`/clear` 후) = 사이클 2 Step 6 — funding_history**(collector-history 7번째 task + 과거 backfill + 결제주기 이산성[8h/4h/1h] crypto-domain canonical + chartDescriptors 7번째[계단 스타일 후보] + chart-card dataShapes 가산 + **별도 G2**. 착수 가이드 = `M2-cycle2-genericchart.md §4g` 끝, plan mode + roadmap-mgr). 단일 진실 = `task-record/M2-cycle2-genericchart.md`.
> **★★★★★★★★★★★★★★★★★★★★★★★ 2026-07-07 — 다음 2-사이클 확정 + 사이클 1 (`[10-77]` Realtime throttle + `[10-82]` favicon) ✅ 당일 완주 (G3 관측만 잔여)**: 계획 세션(전 docs 파악, 사용자 결정: ①순서=`[10-77]` 선행[Realtime grace 7/22] ②사이클 2 GenericChart 범위=**series 가능한 전부**(6 metric + **펀딩 히스토리** — backfill 6-metric 목록에 펀딩 없음 → 적재 확인 선결, 비면 collector 7번째 task+backfill) ③큰 그림=Composable 축 계속(타 거래소·뉴스·ff#3 은 격자 완성 후) + **하드코딩 금지 재강조**(shape 교집합 게이트=무의미 조합만 거르는 호환성 선언, 가능 집합 안 선택=AI 자율) + 청산 차트=`[10-84]` 집계 배관 후속/예상 청산 히트맵=`[10-85]` 파생 데이터 갭[form 아닌 데이터 축]) → **사이클 1 당일 실행**: `MarkPriceWriteCoalescer`(markPrice **DB 쓰기만** 60초 coalescing — 경로 A 방송 1초 무접촉이 코드 구조로 보장, 랭킹 표는 순위·값 단일 출처라 내부 모순 불가·카드 간 시차만 트레이드오프) + favicon(`a62183c`) + code-reviewer 0C(★W1 shutdown×flush 겹침 유실 창 즉시 수정 = 메모리 `feedback_async_coalescer_flush_guard_shutdown`) + worker **257 test** green → **사용자 협업 SSH 배포**(`1320495`, ★키 발굴+`~/.ssh/config` alias 신설 = 메모리 `reference_hetzner_ssh_access`, sudo 는 별도 창) → **G1·G2 PASS**: `updated_at` **60초 단일 클러스터**(usdm 695행, 07:48:48→07:49:48 정확 60초) MCP 실측 + advisors 신규 0 + postgres 에러 0 + **배포 후 deadlock 0**(배포 전 4건). 신규 deferred `[10-84]`/`[10-85]`/`[10-86]`(ticker 초당 ~2,160행 = 더 큰 churn 후보, G3 결과로 판단). `[10-82]` 묘비. genagent 3 에이전트 보강(★nextjs 의 lightweight-charts 금지 해제 = 사이클 2 선결, 로컬 파일). **▶▶ 다음 세션(`/clear` 후) = 사이클 2 GenericChart 착수** — 단일 진실 `M2-composable-expressiveness.md §11` 항목 4(Stage 2 `useDataServiceSeries`+shape 교집합 게이트 정식화 → Stage 3 chart form, 착수=roadmap-mgr 분해+plan mode+자문[nextjs 라이브러리/zod shape 계약/crypto-domain 펀딩 canonical]) **+ 병렬 G3**(Dashboard usage 추세 며칠 → `[10-77]` 묘비 + crypto-trader advisory + favicon 404 육안). 사이클 1 단일 진실 = `task-record/M2-[10-77]-realtime-throttle.md`.
> **★★★★★★★★★★★★★★★★★★★★★ 2026-06-28~30 — 🎯 ff#2 일시정지 → 테마 Composable Expressiveness + Stage 1 Step 1~4 ✅**: ff#2 Step 5 직전 사용자 지적("컴포넌트가 데이터 종류로 하드코딩 = 내 방향 아님")으로 **Form↔Data 직교(모든 데이터 × 모든 형태)** 를 M2+ 중심축 확정 → ff#2 일시정지(청산=Stage 3 events 첫 시민으로 재개 예정). 테마 "Composable Expressiveness" Stage 1(스냅샷 Table 통합): **Step 1·2 ✅(2026-06-29 `47ee8e5`/`5f4574f`) + Step 3+4 ✅(2026-06-30 `2a964bd` push)** — 옛 coin-list-card/indicator-list-card → 모양-제네릭 `table-card` 1개 수렴(dataShapes 7-union·게이트 registry 권한 일원화·alias 대신 저장뷰 삭제·자문 4종 0C·type-check/shared 61/web 334/ESLint 0). **▶▶ 확정 순서(사용자 2026-06-30): ① Stage 1 Step 5 라이브 G2 → ② Feed form+청산(=ff#2 재개=Stage 3 events 시민, 옛 LiquidationFeedCard→모양-제네릭 Feed form=안티패턴 회피) → ③ Realtime throttle `[10-77]`(now_futures_indicator markPrice DB churn, spend cap 끄기 회피) → ④ GenericChart(Stage 2/3)/Stage 4 AI 계약.** 단일 진실 `docs/task-record/M2-composable-expressiveness.md §10·§11`, 메모리 `project_composable_expressiveness_axis`.
> **★★★★★★★★★★★★★★★★★ 2026-06-23 #2 — 경로 A Step 4 Phase A (플립 휴면 토대) ✅**: roadmap-mgr 4a~4f 분해 + Step 2 선례대로 **Phase A(코드·휴면, Claude 단독) / Phase B(인프라+라이브, 사용자 협업)** 분리. **★ 핵심 불변식 = 프로덕션 화면 변화 0**(ticker `transport` realtime 유지 → ws_direct 분기 미진입, `transport.test.ts` 가 spot/futures 둘 다 realtime 못박아 회귀 가드). **★ 배포 순서 안전**: "프론트 새 토픽 구독"이 "워커 새 토픽 방송"을 앞서면 안 됨 → 워커 능력(buildLiveTopic+liveTopicSpec)을 Phase A 에 넣어 재배포 후 방송 가능케 하고 `transport` 플립 1줄만 Phase B 로. 산출(수정 8+신규 2): ① defaults.ts ticker 2종 `liveTopicSpec`(transport 휴면) ② 워커 index.ts 인라인 토픽 리터럴 → `buildLiveTopic` 단일화(W2 grep 0) ③ `liveTransport.ts`(신규) `WS_SUBPROTOCOL` worker·web 단일진실 ④ liveConnection connect() 비동기화(tokenProvider await → subprotocol `[WS_SUBPROTOCOL,token]`, status/closedByUs 경합가드) ⑤ `liveAuthToken.ts`(신규) Supabase 세션토큰 graceful null ⑥ liveTopicManager mapStatus 재연결-인지(`[10-53]`a 빨간깜빡임 차단) ⑦ TickerCard selector(휴면). 검증: type-check 3패키지 green + test shared44/worker200/web287 회귀0 + W2 grep 0 + **code-reviewer 0C(3W/3S) + security-auditor 0C(1W/8P, 토큰 로그·URL·에러 비노출 전수)**. **crypto-trader `[10-53]`(a) 자문 = 옵션 C 채택**(사용자 결정: 재연결 시 값 흐림 + "updated Ns ago"(IndicatorCard freshness 재사용) + **5초 유예** 후 중립어 승격, 빨간 error 금지). Phase A 는 hook(mapStatus)만, **TickerCard 옵션 C UI 는 Phase B 플립 커밋**(가시 변경 분리). 신규 deferred `[10-58]`(토큰 TLS 종단). commit `89e0a36` push. **▶▶ 다음 (`/clear` 후) = Step 4 Phase B (사용자 협업): B-1 워커 재배포(Phase A 커밋 pull) → B-2 플립 커밋(`transport:"ws_direct"` 1줄×2 + TickerCard 옵션C UI + transport.test 뒤집기) → B-3 라이브 G2(토큰 통과+박동 소멸 Playwright+site=DB+W3 경고 소멸).** 단일 진실 `docs/task-record/M2-pathA-ws-direct.md §3 Step 4`, 메모리 `project_m2_pathA_step4_phaseA`.
> **★★★★★★★★★★★★★ 2026-06-18 #4 — 테마 C Step 4 (자유 텍스트 Custom Instructions) ✅ 완결 = 🎉 테마 C 전 step 완료**: ChatGPT 식 자유 텍스트 1칸(enum 기각, AI 의도추론 공간 보존) + 프롬프트 인젝션 5겹 방어. 5 sub-step(① buildSystemPrompt `<user_preferences>` 주입+방어①②③ `000aad2` → ② route.ts 배선 loadCustomInstructions `70251d9` → ③ `/api/preferences` GET/PUT 저장 API `7837c3b` → ④ 좌패널 편집 UI(UIUX 4문 협업 확정: My Views 아래·명시 Save·접힘+프리뷰·placeholder) `b531397` → ⑤ 라이브 G2+docs). **★ 라이브 G2 4/4 PASS**(Vercel+사용자 실행+Supabase MCP): G2-A 악성 메모 무력화 / G2-B 마커위조+XSS **콘솔 alert 0** / G2-C 정상 메모 ETH 4h 반영(명시 쿼리 우선) / G2-D raw 저장 site=DB(`has_raw_img_tag=true`·`has_escaped_lt=false`). "저장은 원본, 정화는 출구마다"(화면 React escape / AI sanitize / 출력 Zod 백스톱) 설계 검증. 자문 0 Critical: code-reviewer ×2 / security-auditor ×2(저장 API + UI XSS·5겹 통합 12 Pass) / crypto-trader / genagent(agent description 보강 2건) / roadmap-mgr(분해). 274 test PASS. 신규 deferred `[10-51]`(JSONB 머지). **▶▶ 테마 C 완결 후보 — 사용자 선언 + 다음 테마/방향 선택 대기.** 단일 진실 `docs/task-record/M2-themeC-ui-shell.md §5`.
> **★★★★★★★★ 2026-06-15 #2 — 테마 C 셸 트림 + Step 1 ✅**: ① **셸 트림 — 우측 "Session Log" 패널 완전 폐기**(commit `38b5a29`+`b7e8413`). 사용자 결정 "채팅 복기는 내 워크플로에 중요하지 않다" → `@crypto-trader` "신뢰 자산" 자문(영구저장+성격기반 보관)과 의견 갈림, **제품 판단 사용자 존중**. 구 Step 3(우측 세션 로그) 폐기 + 회수용 `[10-42]` 폐기. 대안 = 유저 수동 **메모 카드** `[10-43]`(M2+). `RightPanel` 삭제 + `uiShellStore` 우측 상태 제거, `ShellPanel`/`PanelRail` `side` prop 범용 보존(code-reviewer W2 승인=YAGNI 아님·의도 주석). 190 test 회귀 0 + code-reviewer 0 Critical + 라이브 Vercel 실측(rail 1개·캔버스 1412→1156 Push 무결). ② **Step 1 — `user_preferences` 테이블 + RLS ✅**(commit `85d2b4b`, 마이그레이션 `20260615000001`). TRAVIS **첫 user-owned-write 테이블**(user_id PK/FK CASCADE + preferences JSONB schemaless[키는 Step 4 결정] + updated_at 트리거 재사용). RLS 3정책 INSERT·UPDATE `WITH CHECK` 위장/바꿔치기 차단 + `(select auth.uid())` initplan 캐싱(W-1, saved_views 다행 템플릿 정합). `@backend-infra-specialist` 작성 + `@security-auditor` **0 Critical APPROVED** + Dashboard SQL Editor 적용(MCP read-only) + 라이브 검증(pg_policy 3행 roles=authenticated·DELETE 없음 / 트리거 / get_advisors user_preferences initplan 경고 0). DB_SCHEMA §사용자 데이터 반영. **▶ /clear 후 다음 = 테마 C Step 2 (`saved_views` 영속화, 좌 My Views) — Phase 1 UIUX 사용자 협업·`@roadmap-milestone-manager` 분해. user-owned-write RLS 는 user_preferences 템플릿 재사용 + `[10-40]` inert 동반.** 단일 진실 `docs/task-record/M2-themeC-ui-shell.md`, 메모리 `project_m2_themeC_step1`.
> **★★★★★ 2026-06-13 — Disk Retention 묶음 (`[10-15]`/`[10-34]`/`[8-18]`) S1~S3 ✅ 완료**: S1(idx_lookup 534MB DROP CONCURRENTLY + forward-fill lookback 2→1봉) + S2(surrogate id PK 337MB DROP + natural_pk → PRIMARY KEY 승격) + S3(pg_cron 매일 03:00 KST retention 14/60/180일 차등 + 첫 청소 342만 행 삭제, 770만→428만) → 인덱스 **1.87GB→1010MB(~870MB↓)** + **용량 성장 정지(4주 시한 해소)**. IO 무사고(lock 0) + PROCEDURE COMMIT 라이브 검증 + collector upsert 정상(id 없이). S4(조건부 upsert) ⏸️ 보류(dead tuple 7만 양호 → 추세 관측, `[10-36]`). ⚠️ collector forward-fill lag 별도 관측(`[10-35]` — retention 무관·실시간 카드 영향 0). **▶ /clear 후 다음 작업 = `[10-33]` "모든 코인 보기" 표현력** (retention 으로 미뤄뒀던 1순위 복귀). 단일 진실 `docs/task-record/M2-history-retention.md`.
> **(2026-06-12 이력 — 테마 B 코드+DB ✅)**: 사용자 테마 B 선택(06-11) → quote_asset 컬럼(now 2테이블, 3시장 커버) + backfill(NULL 0/2,160) + worker lookup 적재 + registry queryableField + 서버 pushdown("="/"in"). 구워커 비파괴 실측 + 자문 2종 Critical 0. ★ Q1 결정: 기본 quote 스코프 = 테마 C 프리퍼런스 영역(소프트 하드코딩 기각). **잔여 = 워커 배포(06-12 안정성 관측 PASS 후) + 라이브 G2.** 단일 진실 `docs/task-record/M2-themeB-quote-asset.md`. 신규 deferred `[10-24]`~`[10-29]`.
> **★★ 2026-06-11 — 테마 A ✅ 완결 선언 (사용자)**: 라이브 G2 통과 (funding 1위 ESPORTSUSDT=Binance 일치 + flash/FLIP 체감 "좋네요") + G2 가 가시화한 **`[10-22]` symbols 마스터 2달 stale** 을 같은 세션 hotfix (`26a7ba5` syncSymbolsTask — usdm +80 심볼, SKHYNIXUSDT 랭킹 2위 진입 실증, 위생 #3 이행). flash "박동" 체감 → **경로 A (WS 직결) M2 테마 후보 승격** (usage-feedback §E). `[10-1]`/`[10-3]`/`[10-22]` 묘비, 신규 `[10-23]`. **▶ /clear 후 = 다음 테마 선택 (B 데이터정합 / C UI셸+프리퍼런스 / D 차트 / 경로A — usage-feedback §H·§E, roadmap-mgr 분해)** / **06-12 별도 운영 관측 세션** (메모리 `project_next_session_0612.md`). 테마 A 단일 진실 = `M2-themeA-card-expressiveness.md`.
> **(2026-06-11 이력 — 테마 A Step 3+4+5 코드 ✅ 완료)**: 사용자 승인(한 세션 묶음, step 별 commit)대로 **Step 3 IndicatorListCard**(`e75a489` — 랭킹 리스트 + dataShapes 결합 schema 검증 + initialFetch order) → **Step 4 리스트 liveness**(`4fcf43d` — useRowFlash flash + useListFlip FLIP, frontend Critical 2 즉시 수정) → **Step 5 allowlist→registry dataShapes 파생 가드 교체 + docs sync** 까지 코드 차원 완료. 자문 4회(zod/code-reviewer×2/frontend) 전부 Critical 0(또는 즉시 수정). **잔여 = 라이브 게이트** (G2 3종 쿼리 site=DB + Chrome 모션 실측 + crypto-trader advisory) → 통과 시 테마 A 완결 선언(사용자). `[10-3]`/`[10-1]` 코드 묘비, 신규 `[10-18]`~`[10-20]`. 추적 = `M2-themeA-card-expressiveness.md §4.5~4.7`.
> **★ 2026-06-11 갱신 (🔴 Supabase Disk IO 고갈 사고 → 해소 ✅)**: 테마 A Step 3 착수 세션 Phase 0 에서 **DB 전면 무응답** 발견 (Disk IO Budget 고갈 이메일과 정합 — Nano compute 과부하 → deadlock 연쇄 → 06-11 06:27 Postgres crash 재시작). 양쪽 워커 중지 → 즉시 회복(인과 확정) → **Small compute 업그레이드(실질 +$5/월)** → 워커 순차 재개 + 안정 검증 통과 (08:01 UTC). **단일 진실 = `docs/task-record/M2-themeA-incident-supabase-disk-io.md`**. 신규 deferred `[10-15]`(인덱스 다이어트 🟠)/`[10-16]`/`[10-17]`. → 테마 A Step 3 (IndicatorListCard) 즉시 착수 (사용자 승인: Step 3+4+5 묶음, step 별 commit).
> **★ 2026-06-10 갱신 #2 (`[10-11]` 해소 — 테마 A Step 2.5 배포 완료)**: **진짜 근본 원인 = Binance 2026-04-23 USDM WS 레거시 URL 폐지** ("`@arr` 큰 프레임" 가설은 오진 — incident doc §10). `/market` base URL + chunked per-symbol(BinanceChunkedRelay+StreamCoalescer) + USDM ticker full 승격(`[3-50]`) 배포 (05:09 UTC, `a506ca0`). 라이브 검증 전부 통과: markPrice 0.35s / **청산 43일 만에 재개** / funding **site=DB 8자리 일치** / sawtooth 소멸. 후속: 사용자 G2 1차 통과 + `[10-9]` 회수(funding 5자리 + interval(1h/4h/8h) 라벨 + tickSize/baseAsset — `useSymbolMeta`). **후속 #3 (2026-06-10)**: **테마 A Step 2 ✅ 마무리 선언** (사용자 — G2 통과 + `[10-9]` 회수 + **fundingInfoTask 24h→1h** 단축 배포 + docs 종합 정리). **▶ /clear 후 첫 작업 = 테마 A Step 3 (IndicatorListCard)** → **2026-06-12 안정성 관측 + `[10-11]`/`[3-50]` 묘비 + ticker24hrBatchTask 판단** (incident doc §10.4b). 테마 A 추적 = `M2-themeA-card-expressiveness.md`.
>
> **선행 의사결정** (사용자 확인 2026-05-18 / 보강 2026-05-20 / 갱신 2026-05-26):
> 1. M1.7 Closed Beta Ops 건너뛰고 M2 직행 (본인 혼자 실사용 단계에선 베타 게이트 불필요)
> 2. `[3.5-7]` funding/OI 단위 변환 선행 처리 → **M1.8 §8.5 ✅ 완료 (2026-05-26)** 로 흡수 처리됨
> 2-b. **(2026-05-27 신설)** **M1.8.5 history backfill** 신규 별도 사이클 — M1.8 §8.3c 가 (β) 결정으로 본 마일스톤 이월. M1.8 종단 게이트 후 진입. 단일 진실 원천: `docs/deferred-task.md [8-15]` + `docs/task-record/M1.8-step3-history-backfill.md §5.4`. **M2-plan §Step 2 (실사용 피드백 수집) 진입 전 또는 직후 cycle 로 진행**.
> 3. **(2026-05-20 추가)** `[3-68]` Anthropic `transient_error` 진단 분리 선행 처리 — Step 1.5 에서 회수.
> 4. **(2026-05-24 추가)** M1.8 신규 마일스톤 — 선물 데이터 카탈로그 완성 + 사이트=DB 진실 일치 강화. M2-plan §Step 1 의 30m hotfix 가 마일스톤급으로 격상. `docs/ROADMAP.md §M1.8` + `docs/task-record/M1.8-*` 단일 진실 원천.
> 5. **(2026-05-27 진행 상태)**:
>   - ✅ 8.0~8.5 완료 (8.0 사전 진단 / 8.1 schema / 8.2a fetcher / 8.4 SPOT cleanup / 8.5 단위 정공)
>   - ✅ 8.3a 완료 (historyBackfillTask + dry-run mode, 실 호출 X)
>   - ✅ **8.3b 완료** (worker bootstrap 등록 + Hetzner deploy + 시뮬레이션 6 항목 100% 예측치 일치 검증, 2026-05-27)
>   - ✅ **D20/D21/D22 사용자 결정** (C/B/A 모두 권장안 채택, 2026-05-27)
>   - ✅ **8.3c (β) → M1.8.5 별도 사이클 ✅ 완료 (2026-06-01)** (schema + fetcher 6종 + normalize + loop + 실 backfill 4.1M row) — `[8-15]` 회수. 단일 진실: `docs/task-record/M1.8.5-complete.md`
>   - ✅ **종단 게이트 G1~G5 전부 통과 (2026-05-28, FG-1~FG-8)** — G1 13셀 site=DB 사용자 육안 검증 + NULL 비율 + PHAROSUSDT 4h 식별 ∥ G2 자동게이트 (216 test PASS + dry-run 6항목) → G3 3 자문 0 Critical → G4 deferred 묘비 → G5 M1.8-complete.md 신설. 전체 63셀 시계열 검증은 M1.8.5 `[8-15]` 이관.
>   - 완료 상세: `docs/task-record/M1.8-complete.md` + `docs/task-record/M1.8-final-gate.md`

---

## Context (왜 이 계획이 필요한가)

**현재 시점**: 2026-05-18, M1 전체 (M1.1~M1.6 + M1.7 Step 0) 완료된 직후.
- 마지막 commit: `77f6ec3 feat(m1.6-step6): ✅ M1 complete`
- 후속 hotfix: `53f4ba5 fix(m1.7-hotfix): self-correction retry tool_use<->tool_result invariant`
- 코드 차원 🔴 블록킹 0건, deferred 81건 카테고리 분류 완료, 보안 감사 0 Critical / 22 Pass.

**문제 정의**: M1 직후엔 "기술 부채" 가 아니라 "**제품 의사결정**" 이 다음 우선순위를 결정합니다.
- crypto-trader advisory 8건 + Q1~Q3 + Step 0.1 관찰 6~8 이 누적돼 있지만 모두 **이론 추정**.
- 실제 본인 트레이딩 흐름에 끼워 써야 진짜 우선순위가 잡힘 (`[9-9]/[9-10]` 활성화).
- M2 (확장 루프) 는 ROADMAP 상 placeholder 만 있고 Step 분해 미정의 — 실사용 데이터 없이 짜면 추측 기반.

**의도된 결과**: 본인이 자기 실험실의 첫 유저가 되어 실사용 데이터 수집 → M2 Step 분해 정확도 확보 → ROADMAP/deferred-task 정리 후 M2 착수.

---

## Step 단위 실행 계획

### Step 0 — 가벼운 docs 정리 (사전 작업, ~1~2h)

**목표**: 머릿속에 전체 지도 다시 새기기 + 실사용 효율 높이기.

**작업**:
1. `docs/deferred-task.md` 회수 완료 항목 일괄 정리
   - `M1-complete.md` 에 명시된 "회수 65건+" 검증 후 잔여 항목만 남기기
   - 카테고리 라벨 (🔴/🟠/🟡/🟢/🔵/⚪/📋/💭) 정합성 확인
   - 중복 항목 통폐합 (출처만 추가)
2. `docs/ROADMAP.md` M1 완료 마커 갱신 + M1.7 상태 표기 (Step 0 ✅ / Step 1~6 📋 보류)
3. `docs/PRD.md` §6 개발 로드맵 요약 줄 갱신 (M1 완료 반영)

**산출 검증**:
- `docs/deferred-task.md` 잔여 건수 ~81 → 회수 검증 후 실제 잔여 확정
- ROADMAP 헤더 status 마커가 task-record/M1-complete.md 와 일치
- 카테고리별 분포가 M1-complete.md §8 표와 일치

**비전공자 설명**: 책장 정리 단계. 책을 새로 사기 전에, 이미 가진 책들 중 다 읽은 것 빼내고 카테고리별로 다시 꽂는 작업입니다. 다음 단계에서 "어디 어떤 책이 있는지" 가 머릿속에 있어야 실사용 중 발견하는 새 이슈를 정확한 카테고리에 넣을 수 있습니다.

---

### Step 1 — `[3.5-7]` funding/OI 단위 변환 선행 fix (~30m~1h) — **🟡 M1.8 §8.5 로 흡수 처리 (2026-05-24)**

> **흡수 처리 (2026-05-24 사용자 결정)**: 본 §Step 1 의 30m~1h hotfix 가 사용자 추가 요구사항 (선물 지표 7종 × 인터벌 9종 + 사이트=DB 일치 전면 적용 + 소수점 완전 표기 + DB 채움률 정합성) 으로 **마일스톤급 작업** 으로 격상됨. **`docs/ROADMAP.md §M1.8` 신규 섹션으로 이전** — 본 §Step 1 본문은 흡수 이력 추적용 보존, 실제 작업은 M1.8 §8.5 (표시 단위 정공) + §8.1 (schema migration) 에서 수행.
>
> **연쇄 영향**:
> - M2-plan §Step 1.5 (transient_error 진단) → **독립 트랙 유지** (운영 신뢰 게이트 vs 도메인 정확도 게이트는 별개 mental model)
> - M2-plan §Step 2~5 → **변동 없음** (M1.8 완료 후 자연 진입)
>
> **회수 deferred**: `[3.5-7]` / `[3-48]` / `[3-43]` — M1.8 종단 게이트 통과 시 묘비 처리.
>
> **이전 후 단일 진실 원천**: `docs/task-record/M1.8-step0-pre-infra.md` + `docs/ROADMAP.md §M1.8`.

<details>
<summary>본 §Step 1 원본 본문 (흡수 이력 추적용 보존)</summary>

**목표**: 실사용 시작 전 유일한 도메인 정확도 결함 차단.

**작업**:
1. `docs/task-record/M1.6-step3.5-ticker-stream-hotfix.md` 와 동일 톤으로 새 task-record 신설 (`M1.7-step6-funding-oi-unit.md` 또는 `M1-post-funding-oi-fix.md`)
2. canonical 정의 결정 (crypto-domain-expert 자문 권장):
   - **funding rate**: 1h 환산 vs 8h 원본 — 어느 쪽을 카드 표시 / DB 저장
   - **open interest**: contract 단위 vs USD notional 환산 — quote 단위 통일 규칙
3. `apps/worker/src/binance/` 어댑터에서 단위 변환 적용
4. `apps/web/components/cards/` 표시 단위와 일치 검증
5. Binance 공식 사이트 (`https://www.binance.com/en/futures/funding-history` 등) 와 같은 값이 카드에 떠야 함 — "사이트 = DB 진실 일치" §9 검증
6. `docs/canonical-metrics.md` 신설 (deferred `[3-43]`) 의 첫 항목으로 funding/OI 정의 문서화

**산출 검증**:
- Binance USDM BTCUSDT 사이트 funding rate 값과 TickerCard 표시값 ±0% 일치
- OI 카드값이 사이트 표시 단위와 일치
- canonical-metrics.md 에 funding/OI 정의 + 비교 URL + 조회일자 기록

**비전공자 설명**: funding rate 는 거래소가 8시간마다 결제하는 비율인데, 거래소들마다 "8시간 비율" 로 보여줄지 "1시간 환산" 으로 보여줄지 다릅니다. 0.01% 와 0.001% 는 100배 차이 — 본인이 이걸 잘못 읽으면 트레이딩 판단이 틀어집니다. 이 한 작업만 실사용 전에 막아둡니다.

**선행 자문**: 작업 착수 전 `@crypto-domain-expert` 로 canonical 정의 확정 권장.

---

### Step 1.5 — Anthropic `transient_error` 진단 보강 (실사용 시작 전 선행, ~1~2h)

> **★ 2026-06-01: M1.9 Step 0 로 흡수.** 본 Step 1.5 는 M1.9(history forward-fill + COINM) 의 **Step 0** 로 편입됨 — 의존성 0 / 가장 작고 확실 → M1.9 맨 앞에서 먼저 처리. 실사용/베타 진입 전 진단 인프라 선확보 목적은 동일. 단일 진실: `docs/ROADMAP.md §M1.9 Step 0`. 본문은 작업 상세 참조용으로 보존.

**목표**: 2026-05-20 발생한 "The AI service didn't respond. Please try again shortly." 토스트 사건의 원인을 DB 만으로 확정 가능하게 만들어, Step 2 실사용 중 재발해도 즉시 원인 분류·대응 가능하도록 진단 인프라 보강.

**사건 요약** (2026-05-20 진단):
- 증상: Vercel 배포본 채팅 입력 → 7.5~10초 후 transient_error 토스트
- log_chat 관측: `id=90/91 fallback_reason=transient_error, latency_ms=7558/7735, input_tokens=0, ai_response=null`
- 직전 발생: `id=81 (2026-05-19 07:01)` 도 동일 패턴 `latency_ms=9983` (Vercel 함수 timeout 10s 한계 근접)
- 코드 회귀 **아님**: 직전 commit `de3bef5` 는 **docs-only (코드 변경 0)**. 직전 성공 (`id=89`) 와 코드 동일.
- 결론: Anthropic API 호출이 응답을 못 받고 SDK 가 timeout/abort → `AnthropicTransportError` wrap → `transient_error` enum
- **구조적 한계**: `transient_error` 가 401 (auth) / 402 (billing) / 429 (quota) / 5xx / 네트워크 / timeout 을 모두 한 enum 으로 묶고 있어 DB 만으로 원인 분리 불가 (deferred `[3-68]` 가 정확히 이 한계를 사전 예언함)

**작업** (deferred `[3-68]` 선행 회수):
1. `apps/web/lib/ai/haikuClient.ts` — `AnthropicTransportError` 에 `.cause` 보존된 SDK 원본 에러에서 `.status` 추출 (Anthropic SDK 가 4xx/5xx 응답에 status 필드 부착)
2. `apps/web/app/api/orchestrate/route.ts` — catch 블록에서 `err.status` 기준 분기:
   - 401/403 → `fallbackReason="auth_error"` (운영자 알림 톤)
   - 402/429 → `fallbackReason="quota_error"` (운영자 알림 톤, billing 점검 안내)
   - 5xx / 네트워크 / timeout → `fallbackReason="transient_error"` (현재 메시지 유지)
3. `packages/shared/src/zodSchemas.ts` (또는 OrchestrateFallbackReason 정의 위치) — enum 확장 `auth_error` / `quota_error` 추가
4. `messageForReason()` switch case 2개 추가 (영문, English-only 정책 준수)
5. `log_chat.fallback_reason` CHECK 제약 갱신 (deferred `[3-29]` 와 동시 회수 가능)
6. (선택) `log_chat` 에 `upstream_status_code SMALLINT NULL` 컬럼 신설 → DB 만 보고 정확한 status 확정 가능. DB_SCHEMA.md 동시 갱신.

**산출 검증**:
- `pnpm test` 의 `orchestrateOnce.test.ts` 에 시나리오 추가:
  - (d1) AnthropicTransportError + status=401 → `auth_error`
  - (d2) AnthropicTransportError + status=429 → `quota_error`
  - (d3) AnthropicTransportError + status=502 → `transient_error` (기존 (d) 와 동치)
- Vercel 재배포 후 임의 invalid 키로 임시 교체 → fast-fail 401 → auth_error 토스트 노출 (재배포 직전 원복)
- DB `SELECT fallback_reason, upstream_status_code FROM log_chat WHERE status='fallback'` 으로 원인 분포 확인 가능

**부가 작업 (사용자 운영 측)**:
- console.anthropic.com → API Keys → Vercel 의 `ANTHROPIC_API_KEY` active 상태 확인
- console.anthropic.com → Usage → 이번 달 quota / spend cap 점검
- Vercel Dashboard → TRAVIS → Runtime Logs (2026-05-20 06:57 UTC 부근) 에서 "Anthropic 전송 실패" 본문 status code 확인
- 위 3 확인으로 **실제 원인 (auth / quota / outage)** 확정 후 Step 1.5 코드 변경과 별개로 즉시 운영 조치

**비전공자 설명**: 지금은 토스트가 떠도 "왜?" 를 모르는 상태입니다 (API 키 만료인지, 한도 초과인지, Anthropic 서버 장애인지 코드는 다 똑같이 한 바구니에 담아버림). 이 Step 은 그 바구니를 3~4개로 쪼개는 작업 — 그래야 Step 2 실사용 중에 다시 같은 토스트가 떠도 DB 만 봐도 "아 키가 만료됐구나" / "아 한도 초과구나" 즉시 알 수 있습니다. 추가로 Anthropic 의존 단일점이라는 더 큰 문제는 `[4-28]` multi-provider fallback 으로 M2+ 에서 해결합니다.

**선행 자문**: `@ai-orchestrator-specialist` (Anthropic SDK 에러 객체의 status/cause 필드 정확한 위치) + `@code-reviewer` (사후).

**관련 deferred**: `[3-68]` (회수), `[3-29]` (동시 회수 가능), `[4-28]` multi-provider fallback (M2+ 별도 트랙).

---

### Step 2 — 실사용 피드백 수집 (자유 페이스, 며칠~2주) — 🔄 **진행 중 (2026-06-08 진입)**

> **결정 (2026-06-08, 사용자)**: ① **본인 단독 실사용** (M1.7 Closed Beta Ops 계속 보류 — 외부 베타 욕구 발생 시 그때 미니 마일스톤 진입) + ② **경량 준비 후 진입** (관찰 체크리스트 추적 문서 세팅). **단일 진실 추적처 = `docs/task-record/M2-step2-usage-feedback.md`** (O1~O10 관찰 체크리스트 + 데이터 hotfix 로그 + M2 후보 매핑).

**목표**: 본인 트레이딩 흐름에 TRAVIS 끼워 사용 → 실측 피드백 누적.

**작업 방식**:
- Vercel 배포 URL 사용 (로컬 dev 는 디버깅 시에만)
- 자유 페이스 — 본인 트레이딩 일상 안에서 발견하는 대로
- 새 항목 발견 시 `docs/deferred-task.md` 에 즉시 기록 (출처 = "실사용 피드백 YYYY-MM-DD")
- UIUX 작은 개선은 발견 즉시 또는 묶어서 fix
- 데이터 오류 (사이트 = DB 불일치) 는 발견 즉시 hotfix (CLAUDE.md §데이터 위생 #9)

**관찰 체크리스트** (M1-complete.md §7-1 인용, crypto-trader advisory 검증용):
- [ ] 카드 타이틀 톤 (심볼 2중 노출) — 관찰 6
- [ ] "24h Volume Leaders" 용어 모호성 — 관찰 7
- [ ] 3 카드 제목 톤 일관성 — 관찰 8
- [ ] Top N 필터 스코프 (USDT-only vs 전체) — Q1 / `[4-19]`
- [ ] empty 응답 UX 힌트 강도 — Q2 / `[4-20]`
- [ ] 로딩 중 시각 피드백 (disabled-only vs dot 3개) — Q3 / `[4-21]`
- [ ] Fallback 토스트 행동 유도성 — Step 3d Q1
- [ ] 응답 지연 4초대 체감 — Step 4 관찰 4

**산출 검증**:
- 피드백 누적 건수가 advisory 8건을 넘어서 실측 보강 항목 N건 확보
- "쓸 만한가 / 무엇이 답답한가 / 무엇이 더 필요한가" 본인 판단이 정성적으로 정리됨
- 다음 단계의 우선순위 재배치에 사용할 데이터 충분

**비전공자 설명**: TRAVIS 가 처음으로 진짜 사용자(=본인)를 만나는 단계. 이 단계에서 모은 피드백이 M2 의 "OKX 부터? Bybit 부터? 청산 카드부터? 히트맵 카드부터?" 같은 우선순위를 결정합니다. 추측이 아니라 본인 트레이딩 일상에서 "이게 답답하다" 가 나와야 진짜 답.

---

### Step 3 — 우선순위 재배치 + M2 Step 분해 (~수일)

**목표**: 실사용 데이터 기반으로 M2 진입 시 첫 Step 들의 정확도 확보.

**작업**:
1. `docs/deferred-task.md` 우선순위 재배치
   - 🟢 M2+ 25건 중 실사용에서 "지금 필요" 로 검증된 항목을 🟡 (다음 마일스톤) 로 승격
   - 새로 발견된 항목을 카테고리별 분류
   - 더 이상 의미 없는 항목 폐기 (예: M1.7 건너뛰기로 일부 항목 무효화)
2. M2 Step 분해 (3~5 Step 권장, 각 Step 검증 가능 단위)
   - 후보 영역: 거래소 어댑터 추가 (OKX/Bybit/Bitget) / 새 컴포넌트 (히트맵/청산 피드/funding 카드) / 새 데이터 소스 (CoinGlass/온체인/뉴스) / 시계열 분석 강화 (`_history` 활용)
   - **★ history forward-fill — `[8-26]` → M1.9 로 승격 (2026-06-01)**: 본래 M2 Step3 후보였으나, history 정지가 베타 실사용 경험을 망가뜨려 **M1.9 별도 마일스톤으로 앞당김**. **방식 A(주기적 증분 backfill) + 별도 Hetzner worker(`[8-20]`) 채택**. COINM 도 함께 market_type 일반화(`[8-3]`). same-IP ban 실측(2026-05-31)이 별도 IP 전제를 실증. 단일 진실: `docs/ROADMAP.md §M1.9`. **본 항목은 M1.9 완료 시 M2 후보에서 제거.**
   - **실사용 데이터로 검증된 순서** 로 우선순위 결정 (추측 금지)
3. `@roadmap-milestone-manager` 활용해 Step 단위 검증 기준 도출

**산출 검증**:
- M2 Step 1~N 이 각각 "어떤 산출물 / 어떻게 검증" 명시
- 각 Step 의 deferred 회수 매핑 명시
- 실사용 피드백 → M2 Step 매핑 traceability 확보

**비전공자 설명**: Step 2 에서 모은 피드백을 "다음에 짤 코드의 청사진" 으로 변환하는 단계. 이 단계의 정확도가 곧 M2 의 효율을 결정합니다 — 잘못된 우선순위로 OKX 부터 추가했는데 본인이 정작 필요한 건 청산 카드였다, 같은 낭비를 막습니다.

---

### Step 4 — docs 반영 (M2 진입 직전)

**목표**: 모든 의사결정 / 우선순위 / Step 분해를 docs 에 영구 기록 → M2 착수 시 즉시 참조 가능.

**작업**:
1. `docs/ROADMAP.md` M2 섹션 placeholder → 실제 Step 분해로 교체
2. `docs/PRD.md` §6 개발 로드맵 요약 갱신
3. `docs/deferred-task.md` 최종 정리 (재배치 결과 반영)
4. `docs/Architecture.md` 새 영역 (예: 새 거래소 어댑터 / 새 컴포넌트) 의 구조 변경 반영
5. (선택) `docs/canonical-metrics.md` Step 1 에서 신설된 파일 확장 — M2 에서 추가될 metric 정의 포함

**산출 검증**:
- ROADMAP M2 Step 1~N 명시
- deferred-task.md 카테고리 분포 갱신
- 모든 docs 의 마지막 수정일이 일치

**비전공자 설명**: 머릿속에 정리된 계획을 종이에 옮기는 단계. /clear 로 세션을 새로 시작해도 다음 세션의 Claude 가 이 docs 만 읽으면 즉시 같은 맥락으로 진입할 수 있게 만드는 작업입니다.

---

### Step 5 — M2 착수

**목표**: M2 Step 1 시작 (CLAUDE.md "한 번에 하나의 작업" 규율 준수).

> **🎯 M2 중심축 확정 (2026-06-28)**: M2 의 진행은 "확장 루프"(테마 단위 한 번에 하나) 그대로이되, **모든 테마는 "모든 데이터 × 모든 형태 (Form↔Data 직교)" 중심축에 종속**된다 (`CLAUDE.md §최상위 개발 축`). **다음 테마 = "Composable Expressiveness"** (ff#2 일시 정지 후 승격, `M2-step2-usage-feedback.md §H` + `ROADMAP.md` 2026-06-28 방향 전환 블록 + `Architecture.md §8 Form↔Data 직교`). 실 step 분해 = 다음 세션 `@roadmap-milestone-manager`.

**작업**:
- M2 Step 1 의 plan mode 진입 → `@roadmap-milestone-manager` 자문 → 구현 → 검증
- 이후 Step 2, 3, ... 반복 (기존 M1 작업 방식과 동일)

---

## 핵심 파일 경로 (이 계획에서 수정/참조될 파일)

**수정 (각 Step 별)**:
- Step 0: `docs/deferred-task.md`, `docs/ROADMAP.md`, `docs/PRD.md`
- Step 1: `apps/worker/src/binance/` (단위 변환), `apps/web/components/cards/` (표시), `docs/canonical-metrics.md` (신설)
- Step 1.5: `apps/web/lib/ai/haikuClient.ts`, `apps/web/app/api/orchestrate/route.ts`, `packages/shared/src/zodSchemas.ts` (또는 enum 정의 위치), `apps/web/lib/ai/__tests__/orchestrateOnce.test.ts`, `supabase/migrations/*.sql` (log_chat CHECK 제약 + 선택 컬럼 추가), `docs/DB_SCHEMA.md`
- Step 2: 발견 시점에 따른 즉시 fix (위치 사전 미정)
- Step 3: `docs/deferred-task.md` (재배치)
- Step 4: `docs/ROADMAP.md`, `docs/PRD.md`, `docs/Architecture.md`, `docs/deferred-task.md`

**참조 (변경 안 함)**:
- `docs/task-record/M1-complete.md` — M1 산출물 / 잔여 deferred / 영구 영향 의사결정 7선
- `docs/task-record/M1.7-step0-hetzner-migration.md` — Hetzner 운영 상태
- `CLAUDE.md` §데이터 위생 9원칙 — Step 1/2 fix 시 의무 체크리스트
- `.claude/agent-memory/security-auditor/` — Step 1 변경 시 보안 회귀 점검

**활용할 기존 유틸**:
- `pnpm rls-check` (Step 1 변경 후 RLS 회귀 확인)
- `pnpm -r type-check` / `pnpm test` (각 Step 코드 변경 후)
- `@crypto-domain-expert` (Step 1 canonical 정의)
- `@roadmap-milestone-manager` (Step 3 M2 분해)
- `@crypto-trader` (Step 2 실사용 피드백 advisory)
- `@code-reviewer` (Step 1 사후 review)

---

## 종단 검증 (Step 5 진입 시점에서의 게이트)

- [ ] `docs/deferred-task.md` 카테고리별 분포가 실사용 데이터 반영해 갱신됨
- [ ] `docs/ROADMAP.md` M2 Step 1~N 명시 (placeholder 제거)
- [ ] `docs/canonical-metrics.md` 신설 + funding/OI 정의 기록
- [ ] Binance 공식 사이트 = TRAVIS 카드 funding 값 ±0% 일치
- [ ] `log_chat.fallback_reason` 이 `auth_error` / `quota_error` / `transient_error` 로 분리됨 (deferred `[3-68]` 회수). 신규 시나리오 테스트 (d1/d2/d3) PASS.
- [ ] Step 1.5 부가 작업 — 2026-05-20 사건의 실제 원인 (auth / quota / outage 중 하나) 확정 + 운영 조치 완료
- [ ] crypto-trader advisory 8건 + 실사용 추가 발견 항목이 M2 Step 매핑으로 traceable
- [ ] 보안 감사 0 Critical 유지 (Step 1 / Step 1.5 코드 변경 후 회귀 없음)
- [ ] `pnpm -r type-check` / `pnpm test` 전부 PASS
- [ ] M1 완료 후 어떤 commit 이든 main 으로 push 된 상태 (Vercel 자동 배포)

---

## 위험 요소 및 완화

| 위험 | 완화 |
|---|---|
| **실사용 피드백이 너무 빨리 끝남** (며칠 안에 "더 쓸 게 없네") | 8개 관찰 체크리스트를 의무적으로 시도 — Top N 필터 / empty 응답 / 로딩 피드백 등 다양한 시나리오 강제 |
| **실사용 피드백이 너무 길어짐** (몇 주째 M2 진입 못 함) | 2주 timeline 권장 cap — 그 시점에 피드백 충분 여부 자체 판단 |
| **Step 1 funding fix 가 의외로 큰 작업** (canonical 정의 분쟁) | crypto-domain-expert 자문 우선, 1시간 안에 결정 안 나면 Step 2 일단 시작하고 Step 1 병행 |
| **M2 Step 분해가 너무 야심차게 잡힘** (한 Step 에 너무 많은 변경) | roadmap-milestone-manager 의 "Step 당 검증 가능 단위 3~7개" 규율 준수 |
| **M1.7 건너뛰기로 인한 보안/운영 공백** (본인 외 누군가 접근) | 사용자 본인만 사용하는 동안은 위험 없음. 외부 공유 욕구 발생 시 M1.7 즉시 진입 |
| **Step 1.5 진단 보강 전에 Step 2 실사용 진입 시 토스트 재발하면 원인 파악 불가** | 순서 엄수 — Step 1 → Step 1.5 → Step 2. Step 1.5 가 1~2h 작업으로 작아 미루지 않음. 또한 부가 작업 (Anthropic 대시보드 / Vercel logs 점검) 은 코드 변경 없이도 즉시 가능 |
| **Anthropic 단일 의존 자체가 SPOF** (장애 / 키 정지 / quota 시 서비스 완전 정지) | 단기: Step 1.5 로 원인 분류는 가능. 영구 해소: `[4-28]` multi-provider fallback (M2+ 별도 트랙). M2 어느 Step 인지는 Step 3 우선순위 재배치 시 결정 |

---

## 사용자 리뷰/수정 메모 영역

> 본인이 docs/ 전체 리뷰 후 이 plan 을 수정·승인하기 위한 영역. 자유롭게 채워 사용.

### 수정 사항
- (예시) Step 1 의 canonical 정의를 8h 원본 유지로 결정 → 이유: ...
- (예시) Step 2 의 timeline cap 을 1주로 단축 → 이유: ...

### 추가 발견 사항 (docs 리뷰 중)
- 

### M2 후보 영역에 대한 본인 직관 (사전 메모, Step 3 진입 시 참고)
- 

---

## 비전공자 한 줄 요약

> **"빈 부엌이 영업 직전 상태가 됐으니, 이제 사장이 직접 들어가 자기 음식을 며칠 만들어 먹어보고, 메뉴를 진짜로 늘려야 할 순서대로 짜는 단계."**




  1. docs/PRD.md → Architecture.md → DB_SCHEMA.md → ROADMAP.md → deferred-task.md → task-record/M1-complete.md 순서로 읽기 권장 (개념 → 시스템 → 데이터 → 일정
  → 부채 → 결과)
  2. 읽으면서 발견사항을 docs/M2-plan.md 의 "사용자 리뷰/수정 메모 영역" 에 누적
  3. plan 자체 수정 (Step 순서/내용/timeline 자유 변경)
  4. 수정 완료 후 다음 세션에서 "M2-plan 승인됐어, Step 0 부터 시작하자" 로 진입