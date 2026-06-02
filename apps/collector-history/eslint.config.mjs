// apps/collector-history 자체 ESLint flat config (apps/worker 복제).
// Next.js와 무관 → typescript-eslint v8 공식 권장 패턴 사용.
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 수집기는 stdout/stderr 로깅이 정당한 사용 — no-console 끔.
      "no-console": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
