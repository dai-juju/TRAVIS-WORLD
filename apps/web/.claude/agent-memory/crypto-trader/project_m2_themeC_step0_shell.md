---
name: project-m2-themeC-step0-shell
description: M2 테마 C Step 0 UI 셸(좌 My Views / 우 Session Log rail+Push 패널) 자문 시점 관찰. 발견성/카피 미결 질문.
metadata:
  type: project
---

M2 테마 C Step 0 (UI 셸 골격) 라이브 스크린샷 2장 자문 (2026-06-15).

**구현 상태**: 좌/우 가장자리 얇은 세로 rail (라벨 "My Views"/"Session Log") + Push 방식 패널(캔버스 실제 축소). 기본 둘 다 닫힘. 패널 내용은 placeholder (저장 뷰=Step 2, 세션 로그=Step 3). 떠있는 요소(테마토글/Sign in/채팅바) 캔버스 기준 재배치로 패널 침범 없음.

**Why**: 사전 자문에서 지적한 "패널이 차트 가림" 리스크 → Push + 컨트롤 재배치로 해소 확인. 발견성/카피는 첫날 짚을 수 있고, 정보밀도/실수유발은 패널 콘텐츠 찬 뒤로 보류.

**How to apply**: 향후 테마 C Step 2/3 자문 시 아래 미결 관찰을 재점검 —
- rail 세로 텍스트+셰브론 저대비 → 첫 세션 발견성 우려 (nudge는 scope 확장 = roadmap 위임 권고)
- 용어 불일치: rail "Views" vs 카피 "Saved layouts" → 통일 권고
- "Clears on refresh" 카피 = 복기 중시(스윙/포지션) 유형에 불안 신호 가능성 (Step 3 영속화 여부 따라 톤 달라짐)
- both-open 시 Sign in 캔버스 안쪽 이동 → 패널 콘텐츠 스크롤 생기면 겹침 여부 내용 찬 뒤 재확인
- 저사양(UHD620/8GB): 정적 rail 렌더 부담 없음. 단 카드 다수 + 패널 open/close Push reflow 체감은 카드 찬 뒤 항목

관련: [[project_m1_5_ux_baseline]], [[feedback_m1_user_feedback_first]]
