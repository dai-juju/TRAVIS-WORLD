# TRAVIS

"Shape your market." — 암호화폐 트레이더를 위한 다이나믹 UI 플랫폼.

## 나에 대해

- 비전공자 (경영/금융). 코드 설명할 때 쉽게 해줘.
- 바이낸스 선물 3년차 트레이더. 크립토 도메인은 내가 더 잘 아니까 제품 판단은 내 의견 존중해줘.
- 솔직하고 직접적인 피드백 선호. 틀리면 틀렸다고 말해줘.
- 항상 만든 전체적인 구조와 코드에 대해 쉽고 자세히 설명해주세요.(**중요!**)

## 작업 방식

- Plan Mode → 구현 → lint → commit → /clear → 반복.
- 한 번에 하나의 작업만. 범위 넓히지 마.
- 구현 전에 항상 계획을 먼저 보여주고 확인 받아.

## 코드 스타일

- 주석은 한국어로. 변수명은 영어.
- 파일 하나에 너무 많이 넣지 마. 작게 쪼개줘.
- 에러 나면 절대 crash하면 안 됨. graceful하게 처리.
- 코드나 구조가 전체적으로 확장 가능한 구조여햐 해. 
- 코드가 전체적으로 지저분하거나 스파게티 코드가 되지 않게 깔끔하게 작성해주세요. 

## Subagent 가이드

- Day 1 core: `genagent` (subagent 생성/진화), `code-reviewer` (시니어+크립토+비전공자 설명), `roadmap-milestone-manager` (scope 관리+step 분해), `crypto-trader` (advisory only UX 자문).
- 마일스톤 도달 시 `genagent`가 나머지 전문 agent를 순차 생성 (M1.2: zod/frontend/backend, M1.3: crypto-domain, M1.5: ai-orchestrator, M1.6: security).
- 자동 위임은 description 매칭. 경계 모호 시 `@agent-<name>`으로 명시 호출.

## 참조 문서

- @docs/PRD.md
- @docs/Architecture.md
- @docs/DB_SCHEMA.md\
- @docs/ROADMAP.md