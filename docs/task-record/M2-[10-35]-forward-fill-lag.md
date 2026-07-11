# M2 사이클 — `[10-35]` forward-fill lag 해소 — task-record, 단일 진실

> **상태**: 🔄 **Step 1 ✅ (코드+baseline, 2026-07-11) — 잔여 = Step 2 배포+라이브 실측(G2)부터.**
> **선행**: 사이클 2(GenericChart) ✅ 완결 (2026-07-10). 사용자 확정(2026-07-10): 다음 사이클 = 본 항목, Stage 4 선행 — 차트가 가시화한 사용자-facing 신선도 결함(history 차트 우측 최신 구간 공백).
> **계획 승인**: 2026-07-11 (plan `smooth-swinging-pizza.md`). Explore 조사 + `@backend-infra-specialist` 자문 + `@roadmap-milestone-manager` 5-step 분해 + CTO 코드 검증(3중 확정).

---

## 0. 한 줄 요약 (비전공자용)

> **"과거 데이터를 채우는 수집 서버가 요청 예산(분당 150회)을 웨이터 6명 몫으로 6등분해놨는데, 실제 주문은 1명에게만 몰려 예산의 83%가 놀고 있었다. 칸막이(6등분)를 치우면 문지기(전역 token-bucket)가 이미 총량을 지키고 있으므로 안전은 그대로, 한 바퀴 순회가 ~6배 빨라져 차트 오른쪽 끝 공백(최대 8.6h)이 줄어든다."**

---

## 1. 원인 (조사·자문·코드 검증 3중 확정, 2026-07-11)

- **병목**: `apps/collector-history/src/poller/forwardFillTask.ts` 의 `perTaskReqPerMin = Math.max(10, Math.floor(150 / taskCount))` — USDM+COINM 6 task 분할 → **25 req/min**. steady-state 에선 short 그룹 task 만 상시 가동(mid/long 은 restMs 휴식)이라 **예산의 ~83%(125/min)가 stranded**.
- **cycle 하한 공식**: 심볼(~700) × metric(6) × interval(그룹당 3) ÷ 25/min ≈ **8.4h** — 관측 5m lag 8.6h(2026-07-09)와 정합 = 모델 검증됨. lag 은 버그가 아니라 순회 구조의 수학적 하한.
- **분할이 잉여인 이유**: 이 분할은 전역 token-bucket(`futuresDataRateLimiter.ts`, `[8-31]`ⓐ 2026-06-05) 도입 **이전**의 안전장치. token-bucket 이 stats 150/min · basis 30/min · funding 80/min 을 **프로세스 전역 합산 hard cap**(acquire=대기형·throw 금지·abort 협조)으로 이미 보장 → IP quota(1000req/5min) 안전은 분할 제거와 무관하게 불변. 같은 파일 W2 주석("min() 관계 — 함께 검토할 것")이 이 재검토를 예고.
- **대안 부재 확인**: /futures/data 는 다심볼 배치 API 미존재(fetcher 전수 + 공식 문서) → 예산 재배분만이 지렛대. 동적 신선도 큐(B)=과잉설계 기각, 최신-구간 2-pass(C)=anchor 증분이 이미 그 상태(중복) 기각.

## 2. 설계 — 2 레버 (레버 2 는 조건부)

- **레버 1 (커밋된 scope)**: per-task 분할 제거 → token-bucket 을 유일 aggregate limiter 로. 추정 5m lag 8.6h → **~1.5h**.
- **레버 2 (Step 3 게이트 통과 시에만)**: GROUPS 재편 — hot `[5m]` / warm `[15m,30m,1h]` / cool `[2h,4h,6h]` / cold `[12h,1d]` + restMs. 추정 5m ~30분 (물리 하한 ~28분 = IP 한도. 버킷 경쟁 탓에 추정 불확실 → **실측 기반 튜닝**).
- **신선도 목표 = "실측 보고 결정"** (사용자 확정 2026-07-11). 참고: `[8-31]`ⓒ 에 "1~3h 허용" 과거 결정 있으나 차트 이전 시절 — Step 3 에서 재판정.

**Scope 차단선**: TierPoller 우선순위 큐 / 심볼 tiering(모든 심볼 공평) / worker(now-poller) 변경 / `[10-86]` / 멱등·anchor·upsert·`computeForwardFillStartMs` 무접촉 / `[8-31]`ⓓ 코드 구현 / STAGGER 제거 — 전부 금지.

## 3. Baseline (변경 전 실측 — 2026-07-11 06:14 UTC, Supabase MCP)

`history_futures_indicator` interval 별 `max(recorded_at)` age (freshness 인덱스 LATERAL 조회):

| market | interval | latest (UTC) | lag(분) | 봉폭 감안 판정 |
|---|---|---|---|---|
| USDM | **1h** | 07-10 21:00 | **554** | 🔴 9.2h — 최악 실측 |
| USDM | 30m | 07-10 23:30 | 404 | 🔴 6.7h |
| USDM | **5m** | 07-11 02:35 | **219** | 🔴 3.7h (순회 위치 따라 요동, 최악 8.6h 실측 07-09) |
| USDM | 15m | 07-11 05:30 | 44 | 순회 직후라 신선 (요동의 반대편) |
| USDM | 2h/4h/12h/1d | 07-11 00:00 | 374 | 봉폭 대비 정상 범위 |
| USDM | 6h | 07-11 06:00 | 14 | 신선 |
| COINM | 5m/15m/30m | 07-11 05:45~06:00 | 14~29 | 20심볼이라 순회 빠름 — 정상 |
| COINM | 12h/1d | 07-10 | 1094/1814 | long 그룹 restMs 12h 특성 요동 |

★ 스냅샷 특성: lag 은 순회가 방금 지나갔는지에 따라 크게 요동(15m 44분 vs 1h 554분) — 병의 본질은 "한 바퀴 8h+". after 비교는 **정상상태 최악치** 기준(catch-up 안정 후, 여러 시점 샘플).

## 4. Step 1 ✅ — 레버 1 구현 (2026-07-11)

**변경** (실코드 = `forwardFillTask.ts` 1곳, 계획대로):
- `createForwardFillTasks`: `taskCount` 나눗셈 + `Math.max(10, …)` 제거 → 각 task 가 `reqPerMin`(기본 150, env `FORWARD_FILL_REQ_PER_MIN` 경로 유지)을 throttle floor 로 그대로 수령. 합산 강제 = token-bucket 소관.
- stale 근거 주석 3곳 현재형 갱신 (`DEFAULT_TOTAL_REQ_PER_MIN` 독 / `STAGGER_STEP_MS` 의 "`[8-31]` 예정" → "ⓐ 도입됨, stagger 는 보조" / deps.reqPerMin 독 / createForwardFillTasks JSDoc) — `feedback_module_deletion_stale_rationale_comments` 규율.
- **무접촉 확인**: STAGGER/initialDelayMs·GROUPS·멱등·anchor·`historyBackfillCore`·`futuresDataRateLimiter`(150/min 유지) 전부 0줄.

**테스트** ➕ `apps/collector-history/src/poller/__tests__/forwardFillTask.test.ts` (4 test):
- ★ 레버 1 회귀 핀: `executeHistoryBackfill` 이 받는 `reqPerMin` = 150 (분할 재도입 시 25 로 깨짐 = lag 회귀 신호) + env 명시값(120) 무분할 전달.
- 스케줄 계약 불변: markets×GROUPS 개수(3/6)·id 네이밍·restMs·staggered initialDelayMs(30s 간격).

**검증**: collector-history 12/12(+4) + worker 272/272 + 전 6패키지 type-check + lint 전부 clean.

**code-reviewer 0 Critical / 0 Warning / 2 Suggestion — 전부 반영**:
- **안전 불변식 정적 확인**: USDM+COINM fetcher **12종 전부** `rateLimiterGroup:"collector"` + path 가 `limiterBucketForPath` non-null → 분할 제거 후에도 전 경로가 전역 token-bucket 통과 = 무제한 구멍 없음. basis 는 자기 floor 2400ms + 전역 30/min 이중 보호(공통 floor 400ms 로 낮아져도 무회귀).
- **S1 반영**: 과거 `Math.max(10, 분할식)` 이 겸하던 하한 클램프가 분할 제거로 무음 소실(env=0 → minIntervalMs=Infinity → throttle 무력화, token-bucket 이 최종 안전망이라 ban 은 없음) → `Math.max(1, …)` 승계 + TokenBucket S1 가드와 대칭. 메모리 신설 `feedback_compound_expression_incidental_guard`.
- **S2 반영**: 테스트 mock 에 `elapsedMin` 포함(BackfillResult 전체 형태 정합).

**▶ 잔여**: 커밋 → Step 2 (push + Hetzner collector 배포[사용자 협업: `ssh travis-collector`, `travis-collector-history` MainPID kill] + G2 3중: ① lag 실측 after 표 ② -1003/418 무발생 ③ chart-card freshness 라이브) → Step 3 레버 2 결정 게이트(사용자) → (조건부 Step 4) → Step 5 docs·회수(`[10-35]` 묘비 / `[8-31]`ⓓ 재평가 / deferred 대장 대청소 별도 세션 항목 신설).

## 5. 진행 로그

| 날짜 | Step | 결과 |
|---|---|---|
| 2026-07-11 | 계획 | ✅ 전체 현황 브리핑 + Explore 2(코드 순회 구조/문서) + backend-infra 자문(3안 기각·레버 1 발굴) + roadmap-mgr 5-step 분해 + 사용자 결정 2건(착수 승인 / 신선도="실측 보고 결정") + 계획 승인. |
| 2026-07-11 | Step 1 | ✅ baseline 박제(§3) + 레버 1 구현 + 회귀 핀 4 test + stale 주석 4곳 갱신 + reviewer 0C/0W/2S 전부 반영(S1 하한 클램프 승계·S2 mock 정합) + 메모리 1건 신설. collector 12/worker 272/type-check 6패키지/lint clean. |
