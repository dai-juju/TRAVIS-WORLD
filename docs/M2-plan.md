# TRAVIS — M1 완료 후 M2 진입까지의 단계 계획

> **상태**: 초안 (2026-05-18 작성). 사용자가 docs/ 전체 리뷰 후 수정/승인 예정.
> **선행 의사결정** (사용자 확인 2026-05-18):
> 1. M1.7 Closed Beta Ops 건너뛰고 M2 직행 (본인 혼자 실사용 단계에선 베타 게이트 불필요)
> 2. `[3.5-7]` funding/OI 단위 변환 선행 처리 (실사용 중 misread 차단)

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

### Step 1 — `[3.5-7]` funding/OI 단위 변환 선행 fix (~30m~1h)

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
- [ ] crypto-trader advisory 8건 + 실사용 추가 발견 항목이 M2 Step 매핑으로 traceable
- [ ] 보안 감사 0 Critical 유지 (Step 1 코드 변경 후 회귀 없음)
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