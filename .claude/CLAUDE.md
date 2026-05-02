# TRAVIS

"Shape your market." — 암호화폐 트레이더를 위한 다이나믹 UI 플랫폼.

## 나에 대해

- 비전공자 (경영/금융). 코드 설명할 때 쉽게 해줘.
- 바이낸스 선물 3년차 트레이더. 크립토 도메인은 내가 더 잘 아니까 제품 판단은 내 의견 존중해줘.
- 솔직하고 직접적인 피드백 선호. 틀리면 틀렸다고 말해줘.
- 항상 만든 전체적인 구조와 코드에 대해 쉽고 자세히 설명해주세요.(**중요!**)

## 작업 방식

- Plan Mode → 구현 → lint → task-record 작성 및 docs/ 수정(필요 시)->commit -> 깃허브에 업로드(push) → /clear → 반복.
- 한 번에 하나의 작업만. 범위 넓히지 마.
- 구현 전에 항상 계획을 먼저 보여주고 확인 받아.\
- 항상 모든 작업 후, (필요시 playwright mcp 와 @code-reviewer를 사용) 테스트와 검증, 완료된 작업에 대한 설명을 진행해주세요. 
- 항상 작업을 시작하기 전, @genagent 를 이용하여 사용할 만한 서브에이전트가 있는 지 검토하고, 제안해주세요.
- 모든 작업 후, @crypto-trader 서브에이전트 를 활용하여 유저의 입장에서 평가와 피드백을 해주세요
- 계획 시 @roadmap-milestone-manager 서브에이전트를 적절히 활용해주세요\
- 항상 작업/개발/변경 사항에 대해 적절한 @docs 에 반영해주세요.
- **중요** 모르면 모른다고 확실하게 말해주세요. 

## 코드 스타일

- 주석은 한국어로. 변수명은 영어.
- 파일 하나에 너무 많이 넣지 마. 작게 쪼개줘.
- 에러 나면 절대 crash하면 안 됨. graceful하게 처리.
- 코드나 구조가 전체적으로 확장 가능한 구조여햐 해. 
- 코드가 전체적으로 지저분하거나 스파게티 코드가 되지 않게 깔끔하게 작성해주세요. 
- **유저 요청은 글로벌 기준 English-only** (글로벌 타겟). 시스템 프롬프트·AI 출력 문자열·UI 텍스트 전부 영어. 한국어는 코드 내 주석과 docs/ 내부 문서에 한정.
- **쿼리→컴포넌트 매핑 하드코딩 금지**: `buildSystemPrompt.ts` / 라우팅 코드에 `if (query.includes("chart")) → kline-chart-card` 같은 규칙을 절대 심지 않는다. AI 는 각 엔트리의 `componentRegistry.description` 을 읽고 유저 의도를 추론해야 한다. 새 컴포넌트 추가 시 registry 에 등록만 하면 자동으로 AI 가 선택 가능해야 함.
- **AI 의 의도 추론 공간을 하드코딩으로 좁히지 마라** (상위 원칙): 특정 쿼리 패턴·유저 시나리오에 대한 if-else 분기 / 정적 매핑 테이블 / "이럴 땐 이렇게 답해" 류의 룰을 registry·시스템 프롬프트·코드 어디에도 추가 금지. AI 가 레지스트리의 description·예시·가드레일만 읽고 **유저 의도를 파악해 자율적으로 화면을 구성** 하도록 구조를 비워둘 것. 그래야 새 유즈케이스·새 컴포넌트 추가 시 AI 가 자동으로 활용 가능 (= 확장성 담보). `feedback_no_query_to_component_hardcoding` memory 참조.

## Registry description 키워드 hint 가이드라인 (2026-04-23 code-reviewer W2)

컴포넌트/데이터소스의 `description` 에 "keywords they may use: X, Y, Z" 형태 hint 를 넣는 것은 **유스케이스 선언의 보조 단서**로만 허용. 규칙:

- ✅ **OK**: `"Use when the user wants a visual price history (keywords they may use: chart, candle, kline)."` — description 본문은 유스케이스, 키워드는 부수 단서.
- ❌ **NOT OK**: `"If the query contains 'chart', emit kline-chart-card."` — 직접 매핑. 이 패턴은 `buildSystemPrompt.ts` 또는 라우팅 로직에서도 절대 금지.
- **상한**: 한 description 당 키워드 hint 는 **1줄** 을 넘지 않음. 5~6 단어까지.
- **공통 용어만**: 도메인 보편 용어(chart, candle, screener, ticker)에 한정. TRAVIS 내부 조어는 금지.
- **남용 방지**: 5개 이상 컴포넌트 전부에 키워드 덤프가 생기면 실질적 prompt 하드코딩이 됨. 그 전에 "description 본문을 더 명확히 쓰기" 로 해결.

## 데이터 소스 위생 원칙 (필수)

**배경** (M1.4 Step 4.7, 2026-04-22): Binance `!miniTicker@arr` 가 SETTLING/CLOSE 된 심볼
(ALPACAUSDT 등)을 계속 푸시해 상장폐지 코인이 "Top gainers"에 +391% 로 등장 +
BTCUSDT volume_chg_5m 이 -53% 극단값 표시되는 사고 발생. 재발 방지 체크리스트.

**신규 데이터 소스(거래소/지표 adapter) 추가 시 반드시 확인:**

1. **Instrument lifecycle status 필드 파악** — 해당 공급자의 공식 문서에서 심볼/계약/펀드
   의 전체 status enum(예: Binance `TRADING / PRE_TRADING / SETTLING / DELIVERING /
   DELIVERED / PRE_SETTLE / CLOSE / PENDING_TRADING`)을 context7 또는 WebFetch 로
   먼저 조회. "정상 거래" 에 해당하는 값 1~2개만 allowlist.

2. **REST + WS 양쪽 allowlist 필터** — WS 는 공급자가 비정상 상태 심볼도 계속 push
   하는 경우가 많다 (Binance `!miniTicker@arr` 가 대표). REST 쿼리뿐 아니라 WS
   handler 의 normalize 직후 allowlist 체크를 반드시 넣는다.

3. **주기적 재로드 매커니즘** — symbols/contract 마스터는 **24h 이하 주기로 자동
   재로드** 하고 allowlist Set 을 in-place 교체. 상장폐지/신규상장 감지 지연 상한을
   24h 로 보장. Hetzner worker 재시작 타이밍에만 의존 금지.

4. **stale row 정리 + 감지** — `updated_at` 이 일정 시간(예: 10분) 이상 갱신 안 된
   row 는 (a) DB trigger/scheduled job 으로 자동 삭제, 또는 (b) 프론트 쿼리에서
   `updated_at > now() - interval '...'` 필터 반드시 포함. 미실행 시 구 데이터가
   무기한 생존.

5. **극단값 sanity guard** — 변화율/비율 계산 결과가 예상 범위(예: volume_chg_5m ±50%)
   를 벗어나면 (a) 워밍업 부족이거나 (b) stale 비교이거나 (c) 공급자 API 이상. 기본
   null 처리 + 콘솔 경고 로그. 사용자에게 "이상해 보이는 숫자"는 표시하지 않는다.

6. **워밍업 가드** — 롤링 윈도우 기반 계산은 **샘플이 기대 개수에 도달하기 전까지 null**.
   부팅 직후 1~N 분 극단값 송출 금지. STEPS[window] 이상 확보됐는지 `getRecent().length`
   로 확인.

7. **Supabase RLS 경로 사전 점검** — 신규 테이블 추가 시 `SELECT * FROM pg_policies
   WHERE tablename = ?` 으로 프론트(anon) 가 읽을 policy 존재 확인. RLS 활성화만
   하고 policy 0개면 deny-all 로 "200 OK + 빈 결과" 반환 — 가장 디버깅 어려운 함정.

8. **공식 문서 근거 주석** — adapter/handler 에 "공식 문서 링크 또는 버전 태그 + 조회
   일자" 를 주석으로 인라인 기록. 예: `// Binance USDM contract status enum ref:
   /websites/developers_binance_zh-cn_derivatives, 2026-04-22 조회`.

9. **🔥 유저가 보는 웹사이트와 데이터 일치 (사이트 = DB 진실 일치 원칙, 2026-04-27 신설)** —
   사용자(트레이더)가 거래소 공식 웹사이트(현재 Binance, 미래 OKX/Bybit/Bitget/CoinGlass 등)에서
   직접 보는 모든 데이터가 TRAVIS 의 DB / 카드 / AI 응답과 **완전히 일치해야 함**.
   - **배경 (M1.6 Step 3.5 hotfix, 2026-04-27)**: `!miniTicker@arr` (mini, 6필드) 사용 시
     `priceChangePercent` (24h 변화율) 가 페이로드에 포함 안 돼 DB 가 며칠 stale. 사용자가
     Binance USDM 사이트와 비교해 발견 (BTCUSDT 사이트 +0.80% / DB -0.282%). `!ticker@arr`
     (full, 17필드) 로 즉시 전환.
   - **즉시 적용 규칙 (M1)**: 카드에 표시하는 모든 metric 은 거래소 공식 사이트의 동일
     값과 일치하는지 도메인 검증 필수. 폴링 stale / WS 미지원 / 단위 불일치 / 계산법 차이
     모두 **사용자 신뢰 깨짐 = 도메인 결함** 으로 분류.
   - **확장 지향 원칙 (M2+)**: 거래소 공식 사이트가 보여주는 **모든 데이터**(가격 / OI /
     funding / 청산 / LSR / 호가 / 차트 / 뉴스 등)를 TRAVIS 가 동일 정확도로 지원하는 것을
     장기 목표로 함. "이 데이터 빼도 되나?" 는 자동으로 "아니오, 도메인 단점 누적" 답.
   - **현실 한계 3가지** (crypto-domain-expert 자문 2026-04-27):
     (a) WS 미지원 데이터는 별도 stream / REST 조합으로 보완 (예: USDM bid/ask 는 `<symbol>@bookTicker`)
     (b) 거래소별 metric 정의 차이 (예: Funding Rate 의 8h 표시 vs 1h 환산) → canonical 정의로 통일
     (c) WS first / REST fallback only — 폴링은 마지막 수단
   - **PR / task-record 의무**: 새 metric 추가 시 "거래소 공식 사이트의 동일 metric 을 어떤
     URL 에서 비교했는지" 와 "수치 일치 검증 결과" 를 기록.
   - **canonical metrics 정의 docs**: M2 전 `docs/canonical-metrics.md` 신설 예정 (deferred [3-43]).

**Adapter/handler 를 추가하거나 계산식을 바꿀 때 위 9개 항목을 PR 본문(또는 task-record)
에 하나하나 체크 로그로 남길 것.** 누락 발견 시 code-reviewer 가 Critical 로 표시.

## Subagent 가이드

- Day 1 core: `genagent` (subagent 생성/진화), `code-reviewer` (시니어+크립토+비전공자 설명), `roadmap-milestone-manager` (scope 관리+step 분해), `crypto-trader` (advisory only UX 자문).
- 마일스톤 도달 시 `genagent`가 나머지 전문 agent를 순차 생성 (M1.2: zod/frontend/backend, M1.3: crypto-domain, M1.5: ai-orchestrator, M1.6: security).
- 자동 위임은 description 매칭. 경계 모호 시 `@agent-<name>`으로 명시 호출.

## 이월 사항 관리 (Deferred Tasks)

모든 연기/보류/미뤄진 결정은 `docs/deferred-task.md` 에 **즉시 기록**, 처리 완료 시 **즉시 제거**.

- **기록 시점**: Step 완료·code-reviewer·서브에이전트 자문 중 "지금 안 함" 판단이 나왔을 때.
- **필수 필드**: 설명 / 사유 / 출처(`파일:§섹션`) / 회수 예정 시점 / 블록킹 여부 / (선택) 구현 힌트.
- **카테고리**: 🔴 현 Step 블록킹 · 🟠 현 마일스톤 완료 기준 · 🟡 다음 마일스톤 · 🟢 M2+ 확장 루프 · 🔵 Launch Readiness · ⚪ 무기한 · 📋 상시 부채 · 💭 ROADMAP 미결정.
- **새 Step 착수 전** `docs/deferred-task.md` §1 (🔴 블록킹) 반드시 확인. **중복 금지** — 기존 항목 먼저 검색, 같은 이슈는 출처만 추가.

## 참조 문서

- @docs/PRD.md
- @docs/Architecture.md
- @docs/DB_SCHEMA.md\
- @docs/ROADMAP.md
- @docs/deferred-task.md
- @docs/task-record/