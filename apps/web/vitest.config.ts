// Vitest 설정 — apps/web (M1.4 Step 4-3, M1.5 Step 4d 확장).
//
// 이력:
//   M1.4 Step 4-3 — lib/hooks / realtime / action dispatcher / sanitize 단위 테스트.
//   M1.5 Step 4d (2026-04-23):
//     - React 컴포넌트 테스트(RTL)를 위해 environment 를 "jsdom" 으로 전환.
//     - setup 파일 추가 — @testing-library/jest-dom matchers 확장.
//     - include 확장 — components/**/__tests__/**/*.test.{ts,tsx} 도 탐색.
//
// resolve.alias:
//   Next.js tsconfig 의 `@/*` 경로를 vitest 에도 인식시켜, 실제 코드와 테스트
//   양쪽이 동일 import 규칙을 공유한다.
//
// 주의:
//   - jsdom 은 node 보다 무겁다(메모리 +50MB). pure Node 테스트(lib/**)도
//     jsdom 에서 문제없이 돌지만, 저사양 로컬 환경에서 부담이면 옵션 `--environment node`
//     로 케이스별 오버라이드 가능.
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  // esbuild automatic JSX runtime — React 17+ 이후 import 불필요.
  //   (Next.js 는 이미 automatic 이지만 vitest 는 별도 transformer 설정이 필요.)
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    include: [
      "lib/**/__tests__/**/*.test.{ts,tsx}",
      "components/**/__tests__/**/*.test.{ts,tsx}",
    ],
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Playwright spec 는 별도 runner 라 vitest 가 오인 실행하지 않도록 제외.
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**", "playwright-report/**"],
  },
});
