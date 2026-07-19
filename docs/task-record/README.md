# task-record — 완료된 작업의 공식 로그

> TRAVIS의 각 ROADMAP step이 완료될 때마다, 여기에 **한 개의 마크다운 파일**로 요약 기록을 남깁니다.
> ROADMAP은 "앞으로 할 일 + 현재 위치", task-record는 "이미 한 일 + 그때의 결정 맥락".
> Git log는 "무엇이 바뀌었는가"(diff)를, task-record는 "왜 그렇게 했는가 + 다음에 무엇을 조심할 것인가"를 보존합니다.

---

## 왜 이 폴더가 존재하는가

1. **`/clear` 후에도 프로젝트 기억이 살아있게 하기 위해**
   Claude Code 세션을 `/clear`하면 대화 이력이 사라집니다. 이때 다음 세션의 Claude가 "지난 step에서 무슨 일이 있었고, 어떤 경고가 있었는지"를 **파일로 읽을 수 있어야** 같은 실수를 반복하지 않습니다. task-record가 그 매개입니다.

2. **비전공자 창업자(본인)가 6개월 뒤 프로젝트를 돌아봤을 때 30초 안에 이해 가능하게**
   코드 diff만으로는 "왜 이렇게 결정했지?"를 알 수 없습니다. 각 record의 첫 섹션이 **비전공자 친화 설명**이라 기술 지식 없이도 맥락을 따라갈 수 있습니다.

3. **ROADMAP·Memory와 역할 분리**
   - `docs/ROADMAP.md` → 미래 + 현재 체크박스
   - `C:\Users\samsung\.claude\projects\C--TRAVIS-world\memory\` → 본인의 사적 선호·피드백
   - `docs/task-record/` → **공적 실행 기록** (팀·미래의 나 공유)

---

## 📘 핵심 원칙 (반드시 준수)

### 1. 비전공자 친화 설명이 맨 앞에 온다
각 record는 `## 📖 비전공자 친화 설명` 섹션으로 시작합니다.
- 1~3문단 분량
- **쉽고 자세히** — 전문 용어는 괄호 안에 풀이, 또는 비유(집 짓기·요리·가구 조립 등)로 치환
- 독자 대상: 바이낸스 트레이더 출신 경영/금융 전공자. 코드 문법은 모름.
- 이 섹션이 없거나 기술 용어로 도배되어 있으면 **record 완성 전**입니다.
- 이유: 사용자(창업자)가 **본인의 프로젝트를 본인 언어로 이해할 수 있어야** 제품 결정의 주도권이 유지됩니다.

### 2. A4 1장 이내 (~200줄 이내)
CLAUDE.md의 "파일 하나에 너무 많이 넣지 마" 원칙 준수. 넘치면 별도 부록 파일로 분리.

### 3. TEMPLATE.md 구조 엄수
자유 형식 금지. 섹션 이름·순서 고정. 일관된 형식이 빠른 스캔을 가능하게 함.

### 4. Deferred decision은 기록하지 않음
"M1.2에서 결정 예정" 같은 지연 항목은 ROADMAP의 `**⚠️ deferred**` 줄과 중복되므로 여기 넣지 않습니다. 이 파일은 **이미 결정된 것**의 로그입니다.

### 5. 다음 step에서 조심할 것만 기록, 일반 코딩 팁은 제외
code-reviewer가 남긴 Warning/Suggestion 중 **미래 step에 영향 있는 것만** 선택 기록. 범용 베스트 프랙티스는 CLAUDE.md 또는 서브에이전트 정의에 속함.

---

## 📂 파일명 규칙

```
M{milestone}-step{N}-{짧은-주제}.md
```

예시:
- `M1.1-step1-monorepo-root.md`
- `M1.3-step3-binance-adapter.md`
- `M3-step1-interaction-wire.md`

**`{N}` = 그 마일스톤 안에서 착수한 순서의 일련번호 (2026-07-16 사용자 확립, M3부터 의무)**:
- 파일명만 훑어도 개발이 진행된 순서를 재구성할 수 있어야 한다.
- 한 step 이 record 를 여러 개 낳으면 `M3-step1a-`, `M3-step1b-` 로 이어붙인다 (hotfix·부록 포함).
- 확장 루프 마일스톤(M3+)에서도 사이클 번호 = step 번호로 일치시킨다 (`M3-plan.md §사이클 추적` 의 M3-1 사이클 → `M3-step1-...`).
- **M2 이하의 기존 파일(`M2-cycle5-...`, `M2-themeA-...`, `M2-[10-33]-...` 등)은 이력으로 동결 — 개명 금지** (링크 파손 방지).

---

## 🔄 통합 운영 루프

CLAUDE.md의 `Plan Mode → 구현 → lint → commit → /clear → 반복`을 다음과 같이 보강:

```
Plan Mode
  ↓
구현 (파일 작성)
  ↓
lint / type-check 검증
  ↓
subagent 리뷰 (code-reviewer 등)
  ↓
[★ NEW ★] task-record 작성 (이 폴더)
  ↓
ROADMAP 체크박스 업데이트 (roadmap-milestone-manager)
  ↓
git commit
  ↓
/clear
  ↓
다음 step: CLAUDE.md + ROADMAP + 직전 task-record만 읽고 재진입
```

**/clear 직전에 task-record가 반드시 존재해야** `/clear` 후 세션이 무지 상태로 떨어지지 않습니다.

---

## 📑 인덱스 (최신순, 맨 위가 최근)

| Milestone | Step | 주제 | 완료일 | 파일 |
|---|---|---|---|---|
| M3 | Step 3a | 청산 events→series 집계 ([10-84] Phase 1 — 집계 RPC + registry fetchKind 축 + [10-81] 회수 + 청산 마켓 오분류 hotfix) | 2026-07-19 | [M3-step3a-liquidation-series.md](./M3-step3a-liquidation-series.md) |
| M3 | Step 2 | 인터랙션 완성 2탄 (뷰포트 배치 + 재클릭 체인 깊이1 + hover 힌트 + [10-114] 실측 해소) | 2026-07-17 | [M3-step2-interaction-2.md](./M3-step2-interaction-2.md) |
| M3 | Step 1 | 인터랙션 wire (Spawn 관통) + UX 웜업 | 2026-07-16 | [M3-step1-interaction-wire.md](./M3-step1-interaction-wire.md) |
| M1.1 | Step 1 | 모노레포 루트 초기화 | 2026-04-15 | [M1.1-step1-monorepo-root.md](./M1.1-step1-monorepo-root.md) |

> ⚠️ M1.1-step2 ~ M2 기간의 record 는 인덱스 미등재 상태로 누적됨(파일은 전부 존재) — 신규 record 부터 등재 재개 (M3-step1, 2026-07-16).

> 새 record를 추가할 때 이 표에 한 줄 삽입.

---

## 새 record 작성 체크리스트 (재사용용)

- [ ] `TEMPLATE.md`를 복사해서 새 파일로 시작
- [ ] 📖 비전공자 친화 설명 섹션을 **가장 먼저** 채움 (기술 섹션보다 먼저)
- [ ] 완료 기준 체크박스를 ROADMAP에서 그대로 복사해 ✅ 표시
- [ ] 예상 시간 vs 실소요 시간 기록 (다음 step 추정 보정용)
- [ ] 주요 의사결정은 2~3개로 압축 (왜 A 대신 B였는가)
- [ ] 다음 step에서 조심할 것만 선택적으로 기록 (범용 팁 제외)
- [ ] 관련 파일 경로를 모두 열거 (다음 세션 재진입용)
- [ ] 인덱스 표에 한 줄 추가
- [ ] ROADMAP 체크박스 [x] 갱신
- [ ] git commit 후 /clear
