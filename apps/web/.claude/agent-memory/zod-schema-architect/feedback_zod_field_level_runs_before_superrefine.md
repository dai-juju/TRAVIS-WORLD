---
name: feedback-zod-field-level-runs-before-superrefine
description: Zod 필드 레벨 refinement 는 객체 레벨 superRefine 보다 먼저 실행 — 결합/cross-field 검증에서 unknown id 중복 메시지 방지의 근거
metadata:
  type: feedback
---

Zod 는 객체 스키마에서 **각 필드의 refinement 를 객체 레벨 `.superRefine` 보다 먼저** 실행한다.
따라서 cross-field/결합 검증을 superRefine 에 둘 때, 이미 필드 레벨에서 unknown id 가
잡히는 경우 superRefine 안에서 `if (lookup(id)) { ... }` 가드로 skip 해도 빈틈이 안 생긴다 —
unknown 이면 어차피 필드 레벨 issue 로 전체 safeParse 가 실패하기 때문.

**Why:** TRAVIS registry-derived 검증에서 RegisteredComponentIdSchema / RegisteredDatasourceIdSchema
(필드 레벨) 가 1차 차단선, AiCardConfigSchema.superRefine 의 결합/필드 검증이 cross-field 2차선
이라는 분업이 성립하는 근거. `!comp` / `!ds` 가드가 "중복 메시지 방지" 라고 주장하려면 이 실행
순서가 전제. [[schema-component-datasource-coupling]] 검토 (2026-06-11) 에서 확인.

**How to apply:** 새 cross-field superRefine 추가 시, 참조하는 id 필드가 이미 registry-derived
필드 schema 로 보호되면 superRefine 안에서는 lookup 성공 시에만 검증하고 실패 시 graceful skip
(`if (!x) return` 또는 `if (x) {}`) 하면 됨 — 중복 issue 걱정 불필요. 단, 그 id 필드가
`z.string().min(1)` 같은 무방비 schema 면 이 전제가 깨지므로 [[feedback_zod_string_not_defense]]
먼저 적용.
