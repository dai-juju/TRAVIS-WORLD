# M2 [10-33] "모든 코인 보기" 표현력 — task-record

> **상태**: 🔄 진행 중 (2026-06-14 착수). Step 0 ✅ baseline 박제 완료.
> **단일 진실**: 본 파일 = [10-33] 전체 추적처. 승인 plan = `~/.claude/plans/travis-golden-thompson.md`.
> **발견 맥락**: 테마 B 라이브 G2 (`M2-themeB-quote-asset.md §7`) — "show me spot USDT pairs" 가 449개 중 50개만 표시.
> **회수 대상 deferred**: `[10-33]`(최종) + `[10-26]`(order pushdown 소비) + 일부 `[3-65]`(initialFetch 확장).

---

## 0. 무엇을 왜 (비전공자 요약)

> **"'USDT 페어 다 보여줘'라고 해도 449개 중 50개만 나오던 문제. 원인은 ① AI가 몇 개 보여줄지(limit) 기준이 없어 마음대로 정하고 ② 초기 조회가 500개로 막혀있고 ③ 카드가 20개만 잘라 그리기 때문. '순위(sort)'와 '개수(limit)'를 별개 다이얼로 분리하고, 유저가 말한 만큼(숫자 말하면 그만큼·안 말하면 전부) AI가 채우게 한 뒤, 1,400행도 부드럽게 그리도록 가상 스크롤을 넣는다."**

---

## Step 0 — baseline 박제 (✅ 2026-06-14, 코드 변경 0)

### DB 실측 (Supabase MCP read-only, 2026-06-14)

| 테이블 | 전체 row | USDT row |
|---|---|---|
| `now_spot_ticker` | **1,447** | 449 |
| `now_futures_ticker` | **720** | 650 |

**spot quote 분포** (상위 12):
USDT 449 · TRY 320 · USDC 293 · BTC 87 · FDUSD 47 · **U 43(⚠️ 결함 의심)** · IDR 29 · EUR 29 · USD1 27 · BNB 27 · JPY 24 · ETH 20.

### 현재 잘림 동작 (수정 전 기준점)
- "show me spot USDT pairs" → 매칭 **449행** 중 **50행만 표시** (테마 B G2 log_chat 실측: AI 가 `limit:50` 발행).
- 원인 3겹 (plan Context):
  1. AI `limit` 재량 — describe 가이드 부재 (`aiCardConfig.ts:84-90` 한국어 "결과 상한 (1~500)").
  2. 초기 조회 상한 500 (`initialFetch.ts:55 DEFAULT_INITIAL_LIMIT`).
  3. 카드 `limit = 20` 기본 + slice (`CoinListCard.tsx:77,155`).

### Step 2 핵심 제약 실증
- **"all spot" = 1,447 > PostgREST `db-max-rows` 1,000** → 진짜 "전부"는 `.range()` 다회 fetch 필요(plan Step 2).
- **"spot USDT" = 449 < 1,000** → 필터된 흔한 케이스는 단일 SELECT 로 충분.

### Step 5 비교 검증 기준 (이 숫자를 Step 5 G2 에서 재현)
- "show me spot USDT pairs" → **449행 전부**(현재 50 → 목표 449).
- "all spot" → **1,447행 전부**(range fetch 실증).
- "top 10 gainers" → **10행**(유저가 "10" 명시 → limit:10).
- "top gainers"(숫자 없음) → **전체를 순위대로**(limit 생략).

---

## Step 1 — sort/limit 다이얼 describe 정정 (✅ 2026-06-14)

### 핵심 설계 (사용자 지적으로 정정)
초안의 "랭킹 의도→top N / 리스트 의도→전체" 구분은 **그 자체가 소프트 하드코딩** → 폐기.
대신 `sort`(순위)·`limit`(개수)를 **직교 분리**, describe 는 다이얼의 *기능 사실*만 기술.
AI 가 유저 발화(숫자 명시 여부)를 다이얼에 매핑하게 둠. "쿼리 유형→정책" 문구 0.

### 자문 2종 (둘 다 수렴)
- **`@zod-schema-architect`**: limit/sort describe 영문+기능사실 문구 / **`max(500)` 제거(c) 권고**(인프라 천장은 fetch 레이어로 분리) / 예시는 정책이 아니라 형식 시연.
- **`@ai-orchestrator-specialist`**: ★ **describe 는 system prompt 가 아니라 tool `input_schema` 경로로 AI 도달**(`route.ts:126` zodToJsonSchema, describe 보존 — tool schema 가 English-only 감사 사각지대였음). `[10-33]` 은 describe 부족이 아니라 **예시 편향 + 직교규칙 부재 복합 문제** → describe + output_format 본문 규칙 + 생략 예시 **3중 조합** 필요.

### 산출물
- ✏️ `packages/shared/src/schemas/aiCardConfig.ts:72-99` — filters/sort/limit describe **영문화** +
  sort "controls rank only, does not cap count" + limit "Omit to show every matching row; set only when user names a count" + **`max(500)` 제거**(min(1).int().optional() 유지).
- ✏️ `apps/web/lib/ai/buildSystemPrompt.ts` — output_format 에 **sort/limit 직교 분리 규칙 1문단** +
  **`full-list-content` 예시**(sort 有·limit 無) 추가. 기존 `filtered-list-content`(limit:10) 와 대구 → "limit 은 선택적" 형식 시연(쿼리→정책 매핑 0).

### 검증 (코드 게이트 ✅)
- `@travis/shared` type-check + 38 test / `web` type-check + 186 test / `web` lint — **전부 green, 회귀 0**.
- `max(500)` 제거 안전: 기존 테스트 limit 값(10/20) 전부 범위 내, `limit>500` 거부 단언 테스트 부재.
- ⚠️ **라이브 AI 동작 검증("all spot"→limit 생략 / "top 10"→limit:10)은 Step 5 G2 로**(전체 경로가 Step 2/4 완료 전엔 카드가 여전히 20행 slice 라 부분 확인이 혼란).

### 후속/이월
- **`[10-38]` 신규**: 이 파일의 나머지 한국어 describe(datasource/exchange/marketType/symbol/kicker/title/subtitle/interval + CardAction) 전수 영문화 — tool schema 경로로 AI 도달하므로 English-only 위반. 범위 분리(이번은 list 다이얼 3개만).
- **`max(500)` → fetch 레이어 hard cap** 이관 = Step 2 책임(무제한 limit→무거운 쿼리 방지, Disk IO `[10-15]` 이력).

---

## 관찰 (범위 외 — 수정 안 함, deferred 후보)

| 항목 | 내용 | 처리 |
|---|---|---|
| `quote_asset='U'` 43건 | `AAVEU`/`ADAU`/`APTU`/`ASTERU`/`AVAXU`... 심볼이 quote_asset="U" 로 파싱됨 (단일 문자 = quote 파싱 결함 의심). 테마 B quote 파싱(symbols 마스터) 잔여. **새 baseline 조회가 잠복 결함 가시화** (메모리 `feedback_new_card_surfaces_latent_data_defect` 패턴). | 🟡 deferred 후보 — [10-33] 범위 외 (테마 B/데이터 위생). 본 작업과 분리. |

> ⚠️ `U` 페어는 [10-33] 의 "전부 표시" 가 구현되면 화면에 더 잘 드러날 수 있음 — Step 5 G2 시 quote 필터 정확도 함께 관찰.
