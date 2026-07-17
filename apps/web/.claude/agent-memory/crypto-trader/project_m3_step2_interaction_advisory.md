---
name: m3-step2-interaction-advisory
description: M3-step2(뷰포트 spawn 배치+2hop 체인+AI 타겟 다양성) 트레이더 자문 시 남긴 3대 미결 트레이드오프
metadata:
  type: project
---

M3-step2 "인터랙션 완성 2탄" 구현 완료(2026-07-17) 후 crypto-trader 자문. 구현 사실: spawn = 원본 오른쪽→뷰포트 내 가까운 빈자리→만차 시 화면 밖+"Show" 토스트(줌 유지 300ms 팬, 자동 팬 없음). 체인 = 2-hop(소스→mid→leaf, leaf 클릭 불가). 어포던스 = 클릭 가능 헤더/행 hover 시 포인터+5% 하이라이트. AI 타겟 다양성 = 프롬프트 capability 안내(매핑 규칙 0).

내가 founder 결정으로 넘긴 3대 미결(자문 시 일관되게 유지):
1. **만차 Undo 소실** — 토스트 슬롯 1개라 만차 시 Show 가 Undo 대체. 만차=오클릭 카드 찾기 가장 어려운 상황이라 Undo 가 가장 필요한 케이스에서 사라지는 트레이드오프 지적. 옵션 A(현행)/B(만차 시 Undo 우선)/C(슬롯2 예외).
2. **2-hop 상한** — 주 드릴 경로 95% 커버라 판단. 유일한 3-hop 수요 = "차트→같은 심볼 청산맵/호가"인데 이건 3-hop 체인보다 linked_selection([4-13])으로 푸는 게 자연스럽다고 관찰.
3. **체인 어포던스 저대비** — hover+5% 하이라이트가 다크 테마 저대비로 거의 안 보일 가능성 + hover 는 정지 상태 광고 불가 + 터치 미지원. **[[project_m2_themeC_step0_shell]] 의 저대비 발견성 우려 재발 패턴** — 정지 상태 영구 어포던스(chevron 등) 제안은 roadmap 위임.

부수: 스캘퍼가 이 개선 최대 수혜자인데 카드 클러터로 가장 빨리 만차로 밀려나는 구조 관찰(spawn 모델 이슈, 다음 사이클). 다음 사이클 트레이더 1픽 = linked_selection([4-13], 심볼 클릭→열린 카드 포커스). 저사양 300ms 팬 duration:0 폴백 미구현.

**Why:** M1 완료 전 UX 가설 검증 단계([[feedback_m1_user_feedback_first]]) — 위 3건은 founder 결정 대기 상태이지 확정 아님.
**How to apply:** 다음 인터랙션/어포던스 자문 시 위 세 트레이드오프에 대한 founder 결정을 먼저 확인하고, 저대비 어포던스는 테마 C 계보로 묶어 반복 제안하지 말 것(이미 2회 관찰 = 패턴).
