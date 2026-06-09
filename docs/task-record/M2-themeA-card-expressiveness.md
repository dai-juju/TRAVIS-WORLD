# M2 테마 A — 카드 표현력 확장 (진행 중)

> **상태**: 🔄 **진행 중** (2026-06-09 착수). M2-plan §Step 2 확장 루프의 첫 테마.
> **단일 진실**: 본 파일 = 테마 A 전체(Step 0~5) 추적처. 실사용 발견 맥락 = `docs/task-record/M2-step2-usage-feedback.md §H`. deferred = `[10-1]`(F1 liveness) / `[10-3]`(F3 metric 카드) / `[8-27]` #1·#4(배관 빚).
> **분해 출처**: `@roadmap-milestone-manager` (2026-06-09). 메모리 `.claude/agent-memory/roadmap-milestone-manager/project_m2_themeA_breakdown.md`.

---

## 0. 테마 A 는 무엇인가 (비전공자 요약)

실사용 세션 #1 에서 발견된 두 결함을 한 테마로 묶었다 — 둘 다 **"카드의 행(row) 표현력"** 이 부족해서 생긴 같은 뿌리이기 때문:

- **기둥 1 (F3/[10-3])**: "top OI" · "funding + LSR" 쿼리가 빨간 "realtime error" 로 깨짐. → `now_futures_indicator` 의 전 metric(펀딩·OI·LSR·basis·taker)을 카드로 표현. **데이터는 이미 DB 에 다 있음(766행) = 최저 비용·최고 체감.**
- **기둥 2 (F1/[10-1])**: gainers 리스트가 "살아있는 느낌" 약함. → flash + 순위 FLIP 모션. crypto-trader 진단: 체감 80% 가 시각 신호 부재, 20% 만 실제 latency.

두 기둥이 **공통 row 컴포넌트** 를 공유하므로 한 테마.

---

## 1. 6-Step 분해 (예상 13~18h)

| Step | 목표 | 산출물 핵심 | 회수 | 상태 |
|---|---|---|---|---|
| **0** | F3 즉시 안전망 — 깨진 "realtime error" → graceful "coming soon" | 렌더 가능 datasource allowlist (표시 계층 가드) | `[10-3]` 부분 | ✅ **완료 (2026-06-09)** |
| **1** | `[8-27]` 빚 #1·#4 — datasource id ≠ 테이블명 분리 (`fetchKind`/`tableName`) | registry/binding 배관 리팩터 | `[8-27]`#1·#4 | 📋 다음 |
| **2** | IndicatorCard (단일 심볼 metric 카드) | 새 카드 + registry 등록 | `[10-3]` | 📋 |
| **3** | IndicatorListCard (정렬 랭킹) → 기둥1 완결 | 새 카드 | `[10-3]` | 📋 |
| **4** | 공통 LiveRow 추출 (flash + 순위 FLIP) → 기둥2 | TickerCard flash 패턴 공유 | `[10-1]` | 📋 |
| **5** | 통합검증 + 회수 + docs sync | 신규 코드 0 | — | 📋 |

**Scope 경계 (테마 A 에서 안 함)**: 경로 A WS 직결 / `[8-27]` #2·#3·#5·#6 / 거래소 다변화(OKX·Bybit) / 새 데이터소스 / canonical 재설계.

---

## 2. Step 0 — F3 즉시 안전망 ✅ (2026-06-09)

### 문제 (코드 근거)
`initialFetch.ts:29` 의 `datasource` 타입은 실제 테이블명만 받는데, `CoinListCard.tsx:90` / `TickerCard.tsx:105` 가 `datasource as NowTickerTable` 로 강제 캐스트. AI 가 "top OI" → `datasource:"open_interest"` 발행(정당 — registry 등록됨) → `client.from("open_interest")` → 물리 테이블 없음(실테이블은 `now_futures_indicator` 1개) → throw → `status="error"` → 빨간 `! realtime error`.

### 해결 (표시 계층 방어선)
AI 프롬프트 부탁이 아니라 **렌더 직전 구조로** 차단 (M1.5 "id 충돌은 dispatcher 가 구조로 막는다" 철학):

| # | 작업 | 파일 |
|---|---|---|
| 1 | 렌더 가능 `_now` ticker 테이블 allowlist + `isRenderableTickerDatasource()` 순수 함수 + `COMING_SOON_LABEL` 상수 | ➕ `apps/web/lib/cards/renderableDatasource.ts` |
| 2 | CoinListCard: `renderable` 계산 → `enabled && renderable`(구독 skip) → 분기 맨 앞 `!renderable` → "coming soon" | ✏️ `CoinListCard.tsx` |
| 3 | TickerCard: 동일 패턴 + `ComingSoonStub` | ✏️ `TickerCard.tsx` |
| 4 | 가드 회귀 테스트 5 케이스 (ticker→true / indicator 논리id→false / 물리 indicator 테이블→false / nullish→false / allowlist 내용) | ➕ `lib/cards/__tests__/renderableDatasource.test.ts` |

문구는 **중립적 generic** "this data view is coming soon" (사용자 결정 2026-06-09 — datasource 내부 이름 비노출).

### 검증
- `pnpm -F web type-check` green / `lint` green / `test` **138 passed** (기존 133 + 신규 5, 회귀 0).
- `enabled=false` → `channelManager.subscribe()` 미호출 → 채널 누수 0 (code-reviewer 검증, hooks.ts:105-109).

### 자문 결과
- **code-reviewer**: Critical 0. W1(누락 위험 주석)·W2(물리 테이블 false 회귀 케이스)·S1(문구 상수화) **즉시 반영**. S3(타입 단일 진실)은 Step 1 에서 제거될 임시물이라 보류. "쿼리→컴포넌트 하드매핑 금지" 원칙 위반 아님 확인(렌더 가드 ≠ 의도 추론).
- **crypto-trader** (advisory): ① "coming soon" 은 빨간 error 보다 분명 우월(generic 유지 = 사용자 결정 존중). ② ★ **신호** — 하필 막힌 두 metric(OI / funding+LSR)이 본인 기록 "카드 없어 답답함" 1·2위와 일치. 잔잔한 장 며칠로 "버틸 만하다" 결론 위험 — 변동성 큰 날 답답함 1회 발생 시 Step 2(OI 카드) 당길 신호.

### 산출물
- ➕ `apps/web/lib/cards/renderableDatasource.ts`
- ➕ `apps/web/lib/cards/__tests__/renderableDatasource.test.ts`
- ✏️ `apps/web/components/cards/CoinListCard.tsx`
- ✏️ `apps/web/components/cards/TickerCard.tsx`

### Step 1 인계 메모
- 본 allowlist 는 Step 1 에서 `fetchKind`/`tableName` 분리(`[8-27]`#1·#4) 완료 시 **registry 파생 매핑으로 대체·삭제** (DoD 에 명시 필수).
- `COMING_SOON_LABEL` 상수화로 grep 한 번에 제거 지점 추적 가능.
