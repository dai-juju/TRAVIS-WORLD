---
name: schema-component-datasource-coupling
description: AiCardConfigSchema 의 componentId↔datasource 결합 검증 — registry dataShapes 파생 + 필드레벨 선실행으로 !comp 중복 메시지 방지
metadata:
  type: project
---

`AiCardConfigSchema.superRefine` (packages/shared/src/schemas/aiCardConfig.ts) 의 (1) 블록은
componentId 와 data.datasource 의 **결합** 을 검증한다. 허용 조합은 `getComponent(id).dataShapes`
에서 런타임 파생 (하드매핑 아님). issue path = `["data","datasource"]`, 메시지에 허용 datasource
목록 dump ([3-7]/[3-32] 패턴).

**Why:** `coin-list-card + open_interest` 같은 말 안 되는 조합이 기존엔 각 id 의 "존재" 만
검증돼 통과 → ticker 카드가 indicator row 읽어 silent "—" 리스트 (F3 잔재). M2 테마 A Step 3
(2026-06-11) 에서 추가. Step 5 의 renderableDatasource.ts allowlist 제거의 선결 조건.

**How to apply:**
- `!comp` 시 결합 검증 skip 은 빈틈 아님 — componentId 필드의 RegisteredComponentIdSchema
  (필드 레벨 refinement) 가 superRefine(객체 레벨)보다 **먼저** 실행돼 unknown id 를 이미 잡으므로
  중복 메시지만 방지. `if (!ds) return` 과 동일 정합. [[feedback_zod_field_level_runs_before_superrefine]] 참조.
- indicator-card(value) 와 indicator-list-card(content) 는 동일 5 datasource 공유 →
  schema 로는 둘 다 valid, 변별은 description/updateMode 뿐 (schema 사각지대). UX 변별은
  ai-orchestrator/crypto-trader 라이브 관찰 영역.
- Step 5 에서 allowlist 제거 시 이 schema 가 단일 방어선 → 결합 검증 테스트 커버리지 재점검 필수.
