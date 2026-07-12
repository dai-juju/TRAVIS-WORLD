# M2 사이클 4a — `[10-101]` 차트 스타일 자유 — task-record, 단일 진실

> **상태**: 🔄 **Step 1+2 구현·커밋 완료 (`844c1e5`, 2026-07-12) — 잔여 = 라이브 G2-a + 마감.**
> **배경**: 사용자 "쿼리 자유도" 영구 재확정(2026-07-12, PRD §2 명문화) 의 첫 실현. 사이클 4 는 테마급(13~19h 실측)이라 **4a/4b 분리**(사용자 결정) — 4a = 본 항목(quick win), 4b = `[10-102]`(a) 크로스 스크리너 + `[10-91]`/`[10-78]` 스키마 파생 강제 (후속 세션, 계획 개요 승인됨 — plan `serialized-wibbling-pebble.md`).
> **계획 승인**: 2026-07-12. Explore 3(계약/스타일/필터 정찰) + Plan(설계 Q1~Q6) + roadmap-mgr(4a/4b 분리 + 보강 4건) + genagent(신규 에이전트 불필요) + 사용자 결정 3건.

---

## 0. 한 줄 요약 (비전공자용)

> **"지금까지 각 지표의 차트 모양(펀딩=막대, OI=면적)이 레시피에 못박혀 있어 '펀딩비를 선차트로'가 불가능했다. 이제 레시피의 모양은 '기본값'으로 강등되고, 유저가 명시적으로 요구하면 AI 가 카드 계약의 style 다이얼로 모양만 바꾼다 — 데이터·색 정책·기준선(도메인 안전장치)은 그대로."**

---

## 1. 설계 결정 (Plan 자문 Q1/Q2 + 리뷰 반영)

- **계약**: top-level(카드 레벨) `style: { series?: "line"|"area"|"bars" }.strict().optional()` — `data`(무엇을 fetch)가 아닌 표현 계층 = Form↔Data 직교. 미래 스타일 축(표 밀도 등)은 이 객체 내부로만 확장(키 산탄 방지). `stepped` 는 enum 제외 — 오버레이 겹침 판독 불가 시 form 이 자동 전환하는 픽셀 정책(form 소유)이지 유저 선택지가 아님.
- **descriptor = default 강등**: ChartCard 가 `config.style?.series` 존재+상이 시에만 `{...descriptor, seriesStyle: override}` 파생 — title/kicker 의 "config 우선 ?? descriptor 안전망" 선례 동형. **tone(방향색)/midline(기준선)은 원본 유지** = 도메인 가드레일은 스타일과 직교(예: OI 방향색 금지는 bars 로 바꿔도 불변 — neutral 폴백 fill 이 모노크롬 유지).
- **픽셀 정책**: ① y스케일 0 포함 강제는 effective 스타일 기준(bars 기하 소속 — bars→line 시 auto-scale 해제) ② 유저가 bars 명시 + 다중 심볼 오버레이 → **stepped 자동 전환 유지**(가독성은 form 소유, 2026-07-09 사용자 결정 존중) ③ midlinePlugin 은 seriesStyle 무관이라 기준선 자동 보존.
- **프롬프트**: promptInjection 무수정(스타일은 registry 메타가 아닌 계약 다이얼). OUTPUT_FORMAT 에 "card-level style" 다이얼 문단(sort/limit 문구와 동형 스켈레톤 — 기능 사실 + 발동 조건만, 쿼리→값 매핑 0) + `metric-history-chart` few-shot 1건(**style 없이** — 과다사용 편향 방지 + marketType/symbol/interval 완비 모범답안 = 4b Step 5 스코프 규칙 대비 겸용). chart-card description 1문장.
- **chartFormat.ts 무수정** — 파생 descriptor 가 흘러들어 기존 분기(isBars/0강제/stepped/tone)가 그대로 원하는 거동 = `[10-98]` 분할 선행 불필요 판정.

## 2. Step 1+2 ✅ — 구현 (2026-07-12, 커밋 `844c1e5`, 원자적 1 push)

**변경 파일 (10개, +225/-3)**:
- `packages/shared/src/schemas/cardStyle.ts` **신설** — SeriesStyleSchema + CardStyleSchema(strict).
- `aiCardConfig.ts` — `style: CardStyleSchema.optional()` (top-level). `schemas/index.ts`/`src/index.ts` 수출.
- `defaults.ts` — chart-card description 스타일 다이얼 사실 1문장 ("card-level style contract").
- `apps/web/lib/ai/buildSystemPrompt.ts` — OUTPUT_FORMAT 문단 + few-shot 1건.
- `apps/web/lib/cards/chartDescriptors.ts` — `ChartSeriesStyle = SeriesStyle`(shared 단일 진실 재수출).
- `apps/web/components/cards/ChartCard.tsx` — `effectiveDescriptor` 파생(makeOptions 만 소비 — aligned/timeField/헤더는 원본, seriesStyle 만 상이라 정합) + **seriesKey 에 style 축 승계**(reviewer W1).

**테스트**: shared `aiCardConfig.test.ts` +5 (수용/하위호환/strict 오타/enum 밖 candle·stepped 거부/비소비 컴포넌트 통과 정책) + web `chartFormat.test.ts` +3 파생 descriptor 핀 (funding bars→line = y auto+midline·tone 불변 / OI area→bars = 0 포함+neutral fill / override bars+오버레이 = stepped 유지). few-shot 전수 safeParse 감사에 신규 예시 자동 포함. **shared 94/94 + web 450/450 + type-check 전 패키지 + ESLint 0.**

**자문 3종 (Critical 0)**:
- **code-reviewer 0C/2W/3S**: W1 반영 — `seriesKey` 에 styleOverride 포함 (uPlot 은 생성 시점에만 옵션을 읽어, 미래 "형태 사후 변경"이 style 만 바꾸면 무음 no-op 이 될 갭을 1줄로 선차단). W2 = few-shot 감사 존재 확인(자동 포함 확인됨). S1 = "OI→bars 시 0 포함 강제로 납작해지는" 도메인 비최적 조합 → **crypto-trader 자문 대상 (G2-a 동반)** — CLAUDE.md §5 경계(유저 명시 요구 = 논리 한계, 결함 아님) + 도메인 위생(단위·site=DB) 불변이라 수용 방향.
- **zod-schema-architect 조정 0건**: top-level 배치/비소비 통과(no-op 이라 superRefine YAGNI)/styleAxes 미도입 전부 타당. styleAxes 도입 트리거 = ⓐ 2번째 스타일 축 × 다른 form ⓑ 프롬프트 안내 스케일 정지 ⓒ 파괴적 축 등장. `.strict()` 상 롤백(구버전) 시 style 가진 저장 카드는 graceful skip = forward-only 배포라 수용.
- **ai-orchestrator**: 하드코딩 규율 통과(sort/limit 동형 스켈레톤) / 번역 신호 3중(문단+describe+enum 표면)이라 few-shot style 예시 추가는 오히려 과다사용 리스크 = 불필요 / **"top-level"→"card-level"(+ sibling of data 명시) 문구 반영** — 응답 루트/data 내부 오배치 strict reject 로 인한 self-correction 왕복 선차단 / tool input_schema 는 zodToJsonSchema 자동 노출 확인(route.ts 무수정). 부수: style describe 한국어 = 기존 kicker/title 과 일관된 기존 부채(신규 회귀 아님 — English-only 청소 시 일괄 회수 대상).

## 3. ▶ 잔여 — 라이브 G2-a 게이트 (Vercel 배포 후)

| # | 쿼리 | 기대 (log_chat 박제) |
|---|---|---|
| 1 | "show BTC funding history as a simple line chart" | chart-card + funding_history + **카드 레벨** `style:{series:"line"}` — 라인 렌더, y auto, 0 midline 점선(범위 내일 때), 부호/툴팁 정상 |
| 2 | "funding rate history for BTC" | style **생략** = 기본 bars 부호색 (무회귀 + 과다사용 없음) |
| 3 | "open interest of BTC and ETH over time as bars" | 오버레이 → stepped 자동 전환 + neutral 유지 |
| 4 | 회귀 | "BTC price" / "top gainers" / kline 차트 기존 거동 |
| 5 | (선택) Custom Instructions 스타일 취향 vs 명시 쿼리 | 명시 쿼리 승리 (사이클 2 선례) |

이후: crypto-trader 자문(S1 포함) → 본 문서 완결 + deferred `[10-101]` 묘비 + ROADMAP/usage-feedback/composable §11/MEMORY 전파 + commit·push.

## 4. 진행 로그

| 날짜 | Step | 결과 |
|---|---|---|
| 2026-07-12 | 계획 | ✅ Explore 3 + Plan 설계(Q1~Q6) + roadmap-mgr(4a/4b 분리 권고→사용자 확정) + genagent(신규 불필요) + 사용자 결정 3건 + 계획 승인. |
| 2026-07-12 | Step 1+2 | ✅ 계약+프롬프트+소비 구현, 테스트 +8, 검증 전부 green, 자문 3종 0C(W1·문구 반영), 원자적 커밋 `844c1e5` push. |
