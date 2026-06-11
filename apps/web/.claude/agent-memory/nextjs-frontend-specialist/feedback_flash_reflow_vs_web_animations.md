---
name: flash-reflow-vs-web-animations
description: 값 변경 flash 의 void offsetWidth 재시작 트릭은 동기 reflow — 저사양에선 Web Animations API 로 대체 검토
metadata:
  type: feedback
---

행/셀 flash(값 변동 시 배경 번쩍) 구현에서 `el.classList.remove()` → `void el.offsetWidth` → `add()` 로 CSS 애니메이션을 재시작하는 트릭은 **동기 reflow 를 강제**한다.

- 빈도가 높으면(ticker 1초 다회 × 행 20 × 카드 6) 메인 스레드 블록 누적 → UHD 620 jank.
- 실제로는 `useDataServiceTable` 500ms throttle 덕에 flash 트리거가 행당 ≤2회/초로 완화돼 즉시 사고는 아님.
- **How to apply:** 신규 flash 는 `el.animate([...], {duration})` (Web Animations API)로. 매 호출이 독립 애니메이션이라 offsetWidth 재시작 트릭 불필요 + 동기 reflow 제거. 단 background-color 는 합성 불가 속성이라 paint 는 여전히 유발 — 완전 공짜 아님.

**Why:** 저사양 타겟에서 동기 reflow 의 빈도 누적이 FLIP 측정 reflow 와 겹쳐 끊김 유발. throttle 이 막아주지만 구조적으로 reflow 트릭은 제거하는 편이 깔끔(CLAUDE.md 스파게티 금지).

연관: [[feedback_flip_table_row_transform_trap]]
