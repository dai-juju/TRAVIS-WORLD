# M{X.Y} Step {N} — {짧은 주제 한국어}

> **이 파일은 복사해서 시작하는 템플릿입니다. 실제 record 작성 시 이 줄과 모든 `{{...}}` 플레이스홀더를 삭제하세요.**
> README.md의 "핵심 원칙 1"에 따라 **📖 비전공자 친화 설명 섹션을 가장 먼저 작성**하세요.

---

**Milestone**: M{X.Y}
**Step**: {N} / {총 step 개수}
**완료일**: YYYY-MM-DD
**예상 소요**: {예: 1.5~2시간} / **실소요**: {예: ~55분}
**ROADMAP 체크박스**: `docs/ROADMAP.md` §M{X.Y} Steps 섹션

---

## 📖 비전공자 친화 설명

> **이 섹션은 생략/축소 금지.** TRAVIS 창업자는 바이낸스 트레이더 출신 경영/금융 전공자이며, 본인 프로젝트를 본인의 언어로 이해할 권리가 있습니다.
> 1~3문단 분량, 쉽고 자세히, 필요하면 비유 사용.

{이 step이 무엇을 달성했는지, 왜 필요했는지, 만약 이 step을 건너뛰었다면 어떤 고통이 있었을지를 비유와 함께 설명.
전문 용어를 쓸 때는 괄호로 풀이. 예: "모노레포(여러 프로젝트를 한 저장소에 묶어 관리하는 방식)".
"그래서 이 부분이 TRAVIS의 어떤 원칙(예: 3개 데이터 경로, 4개 레지스트리, crash 금지)에 어떻게 기여하는지"를 가능하면 한 문장 포함.}

---

## 🔨 무엇을 했는가 (기술 요약)

{3~5개 bullet, 간결하게. diff 나열이 아니라 "의도"를 남길 것.}

- {예: 루트 `package.json`에 pnpm workspace 선언 + 공통 devDeps 3종 설치}
- {예: `tsconfig.base.json`에 strict + `noUncheckedIndexedAccess` 추가해 배열 접근 시 undefined 처리 강제}
- ...

---

## ✅ 검증 결과

ROADMAP의 완료 기준을 그대로 복사해 실제 결과 표시:

- [x] {완료 기준 1} — {실제 결과, 예: `pnpm install` 3.1s 성공, lockfile 생성}
- [x] {완료 기준 2}
- [x] {완료 기준 3}

검증 시 사용한 명령·도구:
- {예: `pnpm install`, `pnpm lint`, `pnpm type-check`, `git status`}
- {예: Playwright MCP (UI 확인용) — 해당 없음 / 사용됨}
- {예: code-reviewer subagent — 판정 🟢 GREEN}

---

## 🧭 주요 의사결정 (2~3개)

각 항목은 **"A 대신 B를 골랐다 + 왜"** 형태로:

1. **{결정 제목}**: {선택한 것} ← {대안 A, 대안 B 중 왜 이것인가}
2. ...

> Deferred decision("나중에 정하자")은 여기에 기록하지 않습니다 — ROADMAP의 `**⚠️ deferred**` 줄과 중복.

---

## ⚠️ 다음 step에서 조심할 것

code-reviewer·roadmap-milestone-manager·crypto-domain-expert 등이 남긴 Warning/Suggestion 중 **미래 step에 영향 있는 것만** 선택 기록:

- **{Step N에서}**: {조심할 점} — {간단한 배경/근거}
- ...

> 범용 코딩 팁(예: "주석은 한국어로")은 CLAUDE.md에 이미 있으므로 기록하지 않음.

---

## 📁 관련 파일 경로

다음 세션이 재진입할 때 읽어야 할 파일들:

**신규 생성**
- `path/to/file1`
- ...

**수정**
- `path/to/file2` (라인 A~B)
- ...

**참고**
- `docs/ROADMAP.md` §M{X.Y}
- `docs/PRD.md` §{관련 섹션}
- `docs/Architecture.md` §{관련 섹션}

---

## 🔗 링크

- **이전 step record**: {있으면 상대경로, 없으면 "없음 (첫 step)"}
- **다음 step record**: {작성 예정 파일명}
- **관련 Plan 파일**: {있으면 경로}
