---
name: time-display-audit-checklist
description: 절대 시각 표기 누락 감사 체크리스트 — grep 전수 + 상대시간 제외 + 래퍼 추적 + 서드파티 임베드 확인.
metadata:
  type: feedback
---

**규칙**: "모든 시각 표기가 X 기준(예: UTC)인가?" 류 감사 요청 시 다음 5단계로 전수한다:

1. **전수 grep**: `toLocale(String|DateString|TimeString|Time)` / `getHours|getMinutes|getDate` / `Intl.DateTimeFormat|new Intl` / `tzDate` / `hour12` / `timeZone` 을 전 `.ts/.tsx`에서.
2. **상대시간 제외**: `formatRelativeTime`("3m ago") / `formatCountdown`("2h 14m") 는 TZ 무관 → 감사 대상 아님. 절대 시각(벽시계)만 대상.
3. **표시 vs 내부 계산 구분**: `Date.parse`/`new Date`/`.getTime()` 이 **화면 표시**인지 아니면 정렬·ms 변환 같은 **내부 값**인지 확인. `created_at`/`updated_at`/`lastSavedAt` 을 store에 넣는 건 표시 아님.
4. **래퍼 함수 추적**: 소비처가 값 포매터를 직접 안 부르고 얇은 래퍼를 거칠 수 있다(예: `formatFeedTime` → `formatEventTime`). 래퍼는 grep에서 다르게 잡히므로 정의를 따라가 실제 포매터 확인.
5. **서드파티 임베드**: TradingView iframe 등 외부 위젯의 자체 타임존 파라미터(`timezone: "Etc/UTC"`) 확인 — 우리 포매터를 안 거치므로 별도 정합 확인 필요.

**Why**: [10-99] UTC 전환 리뷰에서 사용한 절차. 이 방식으로 "표시 경로는 5개 포매터/소비처가 전부, 나머지는 상대시간·내부값·이미 UTC인 TradingView"라고 완결 판정 가능했다. 4번(래퍼)·5번(서드파티)을 빠뜨리면 "누락 없음" 오판 위험.

**How to apply**: 시각/단위/포맷 일관성 감사 요청마다 위 5단계. 라벨 소유권 배치 판정은 [[value-label-ownership-split]] 병행.
