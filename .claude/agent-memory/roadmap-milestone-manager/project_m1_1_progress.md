---
name: M1.1 progress log
description: TRAVIS M1.1 (모노레포 + 툴체인) 마일스톤 step별 완료 이력 및 예상 대비 실제 편차
type: project
---

# M1.1 Step 진행 이력

## Step 1 — pnpm 모노레포 루트 초기화
- 완료일: 2026-04-15
- 예상: 1.5~2시간
- 검증 통과 기준:
  1. `pnpm install` 성공 (pnpm-lock.yaml 생성, prettier 3.8.3 / prettier-plugin-tailwindcss 0.6.14 / typescript 5.9.3)
  2. `pnpm lint` exit 0 ("No projects matched the filters" — apps/packages 비어있어 정상)
  3. `pnpm type-check` exit 0 (동일)
- 계획 대비 편차:
  - pnpm 10.29.0 → **10.33.0**으로 교체 (npm registry에 10.29.0 없음, 현행 최신 stable 사용)
  - `package.json`의 `packageManager` 필드도 10.33.0으로 동기화
- **Why:** 다음 마일스톤 분해 시 "외부 버전 고정은 registry 존재 여부 먼저 검증" 패턴 재발 방지.
- **How to apply:** 이후 step에서도 라이브러리 버전 pin할 때 실제 registry에 있는지 확인 후 권고.

## Step 2 — `packages/shared` + `packages/data-service` 스켈레톤
- 완료일: 2026-04-15
- 예상: 1시간
- 검증 통과 기준:
  1. `pnpm -F @travis/shared type-check` exit 0
  2. `pnpm -F @travis/data-service type-check` exit 0
  3. `pnpm -r type-check` 양 패키지 모두 green
  4. `packages/data-service/src/IDataService.ts` 존재 (메서드 0개 빈 인터페이스 — Architecture.md §10 deferred decision 준수)
- 계획 대비 편차:
  - 예상 범위 내 완료. code-reviewer 지적(C1/W1/W2/W3/S1) 모두 반영하여 🟡→🟢 등가 상태.
  - 상세 record: `docs/task-record/M1.1-step2-packages-skeleton.md`
- **Why:** Architecture §10 "인터페이스 메서드 시그니처는 실제 web/worker에서 첫 사용 시점에 결정" 원칙을 Step 2 단계에서 실제로 집행한 사례 — deferred decision 원칙이 "미루기"가 아니라 "근거 있는 지연"임을 후속 step 판단에 활용.
- **How to apply:** 이후 step에서 사용자가 "미리 메서드 다 정의하자" 같은 scope 확장 제안 시, 이 사례를 근거로 "첫 consumer에서 필요할 때 추가" 권고.
