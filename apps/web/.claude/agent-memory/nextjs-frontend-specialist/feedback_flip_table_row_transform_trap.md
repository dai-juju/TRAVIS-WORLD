---
name: flip-table-row-transform-trap
description: <tr>/table-row 에 직접 transform 은 Safari/Firefox/border-collapse 에서 비호환 — FLIP 은 grid/flex 행으로
metadata:
  type: feedback
---

리스트 순위 FLIP 모션을 `<table>` 위에 구현할 때 두 가지 고전 함정. M2 테마 A Step 4 검토(2026-06-11)에서 적발.

**1. `<tr>`(display:table-row)에 직접 `transform` 금지.**
- WebKit(Safari)/Firefox 는 table-row transform 을 무시하거나, `border-collapse: collapse` + 행 border 와 조합 시 잔상/깜빡임. TRAVIS 행은 `border-b` 가 걸려 정확히 함정 조건.
- **How to apply:** 리스트 FLIP 은 table 대신 grid/flex 행으로(또는 tbody/tr/td 를 `display:block/grid` 로 강제). transform 을 td 내부 wrapper 에 거는 건 셀마다 동일 delta 적용이라 스파게티 — 비권장.

**2. 단일 `requestAnimationFrame` 으로 Invert→Play 하면 transition 간헐 미발동.**
- 브라우저가 invert 스타일을 같은 프레임에 배칭 → transform="" 가 transition 없이 점프. 저사양일수록 빈발.
- **How to apply:** double-rAF 또는 (권장) Invert 직후 `void container.offsetHeight` 강제 reflow 1회로 커밋 보장 후 Play. 저사양에선 강제 reflow 1회가 rAF 1프레임 소비보다 결정적·빠름.

**Why:** UHD 620 저사양 타겟에서 모션이 씹히거나 아예 안 도는 사고를 사전 차단. FLIP 의 정석은 transform 일급 지원 요소(div grid)이지 table-row 가 아님.

연관: [[feedback_flash_reflow_vs_web_animations]]
