# TRAVIS — M1 완료 후 M2 진입까지의 단계 계획

> **상태**: 초안 (2026-05-18 작성, 2026-05-20 Step 1.5 추가, 2026-05-27 M1.8 §8.3b ✅ + D20/D21/D22 ✅, **2026-06-01 M1.8.5 history backfill ✅ 완료 반영 — 선행 마일스톤 전부 종료, 본 §Step 2 실사용 피드백 진입 대기**).
> **현재 위치 (2026-06-07)**: **M1.9 ✅ 완료 + COINM 24~48h 안정성 PASS + `[8-34]` 회수** — Step 0~3 전부 통과, 종단 게이트 G1~G5 ✅. forward-fill USDM(무중단 `NRestarts=0`) + COINM(20 `_PERP` 라이브 실측, `markets=[usdm,coinm] tasks=6`) 라이브 가동 + site=DB 소수점 일치(USDM ~50셀 + COINM 24셀, OI contract 단위 검증) + ⓑ AbortSignal graceful 종료 2회 검증 + basis -1003 메커니즘 규명(Binance LB 노드 weight 풀 혼잡, basis weight 0, 우리 무관 — backoff 흡수). **✅ COINM 24~48h 안정성 PASS (2026-06-07, 롤아웃+22h: NRestarts=0·same-IP ban 0·DB 무구멍·채움률 ~100%)** + 점검 중 `[8-34]` LSR guard false positive(로그 ~40%) 동시 회수(`maxRatio` USDM 10/COINM 20, worker 134 test). 회수: `[8-26]`/`[8-3]`/`[8-20]`/`[8-31]`ⓐⓑⓒ/`[8-33]`/`[3-68]`/`[8-34]`. 잔여(차단 아님): `[8-31]`ⓓ circuit breaker / `[8-22]` warn 폭발 집계. **다음 = 본 §Step 2 (본인 실사용 + 베타테스터 피드백 수집).** 단일 진실: `docs/task-record/M1.9-complete.md` + `M1.9-coinm-stability.md`.
> **세션 재개 단일 진실 원천 (M1.9 ✅ 완료, 2026-06-06)**: **`docs/task-record/M1.9-complete.md`** ← `/clear` 후 가장 먼저 읽을 파일. **▶ 다음 세션 첫 작업 순서 (사용자 지정)**: ① ✅ **COINM 24~48h 안정성 체크 완료 (2026-06-07 PASS)** — NRestarts=0/22h 무중단 + same-IP ban 0(-1003 676회 전부 내부 LB IP) + DB 무구멍 누적·멱등 0·채움률 ~100%. 점검 중 `[8-34]` LSR guard false positive(로그 40%) 실측·동시 회수(maxRatio USDM 10/COINM 20). 단일 진실 `docs/task-record/M1.9-coinm-stability.md` → ② **본 §Step 2 실사용 피드백 수집 진입 (← 현재 여기, 사용자 결정 대기)**. 잔여(차단 아님): `[8-31]`ⓓ circuit breaker / `[8-22]` warn 폭발 집계 (둘 다 관련 작업 시 회수). (M1.9 상세 이력 `M1.9-step3-rollout.md`, Step 2 `M1.9-step2-forward-fill.md`.)
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

### Step 2 — 실사용 피드백 수집 (자유 페이스, 며칠~2주)

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