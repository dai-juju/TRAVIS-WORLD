// Vitest 설정 — apps/web (M1.4 Step 2, 2026-04-20).
//
// 현재 범위: lib/hooks 유틸 단위 테스트만.
// React 훅 (renderHook) 테스트가 필요해지면 environment를 "jsdom"으로 바꾸고
// @testing-library/react를 devDep에 추가한다.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
