// Vitest 설정 — apps/web (M1.4 Step 4-3 갱신).
//
// 현재 범위: lib/hooks / realtime / action dispatcher / sanitize 단위 테스트.
// React 훅 (renderHook) 테스트가 필요해지면 environment를 "jsdom"으로 바꾸고
// @testing-library/react를 devDep에 추가한다.
//
// resolve.alias:
//   Next.js tsconfig 의 `@/*` 경로를 vitest 에도 인식시켜, 실제 코드와 테스트
//   양쪽이 동일 import 규칙을 공유한다 (Step 4-3, 2026-04-22).
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    include: ["lib/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
