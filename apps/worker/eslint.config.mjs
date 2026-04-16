// apps/worker 자체 ESLint flat config.
// Next.js와 무관 → typescript-eslint v8 공식 권장 패턴 사용.
// 참조: https://typescript-eslint.io/getting-started (2025 flat config)
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 워커는 stdout/stderr 로깅이 정당한 사용 — no-console 끔.
      // M1.3에서 pino/winston 도입 시 재검토.
      "no-console": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
