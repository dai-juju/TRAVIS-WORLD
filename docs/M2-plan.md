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