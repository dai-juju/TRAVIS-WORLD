import { defineConfig } from "vitest/config";

// apps/collector-history 단위 테스트 (apps/worker vitest.config 복제).
export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
