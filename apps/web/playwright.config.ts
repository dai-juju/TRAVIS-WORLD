/**
 * Playwright 설정 — M1.5 Step 4a (2026-04-23).
 *
 * 목적: "말로 화면을 조립한다"는 TRAVIS 핵심 루프(ChatInputBar → /api/orchestrate →
 *   Haiku 4.5 → Zod 검증 → CardContainer 렌더) 의 E2E 재현 가능성 확보.
 *
 * 현 단계 스코프 (Step 4):
 *   · 로컬 수동 실행 (`pnpm -F @travis/web exec playwright test`)
 *   · chromium only — Intel UHD 620 + 8GB RAM 환경 고려, firefox/webkit 생략
 *   · CI 자동화는 M1.6 (인증 gate 와 함께)
 *
 * 비결정성 대응:
 *   · Haiku 호출은 실 API → 평균 2~3s. timeout 을 카드 렌더까지 90s 로 널널히
 *   · workers=1 — Anthropic rate limit + LLM 비결정성 누수 최소화
 *   · retries=0 — 실패 시 개발자가 직접 원인 파악 (LLM 재시도는 route.ts 가 이미 처리)
 *
 * 환경 변수:
 *   · PLAYWRIGHT_BASE_URL (default http://localhost:3000) — 다른 포트 사용 시 override
 *   · SKIP_LIVE_E2E=1 → 테스트 describe 에서 `test.skip()` 호출 (spec 파일이 자체 gate)
 *
 * webServer:
 *   `reuseExistingServer: true` — 개발자가 이미 `pnpm -F @travis/web dev` 로 띄웠으면
 *   재사용 (저사양 환경에서 next dev 두 번 띄우면 메모리 부담). 안 띄워져 있으면
 *   Playwright 가 자동 실행. `command` 는 workspace root 가 아니라 `apps/web` 기준.
 *
 * 공식 문서: https://playwright.dev/docs/test-configuration (조회일: 2026-04-23)
 */

import { defineConfig, devices } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // 전체 테스트 타임아웃 — LLM 호출 느림 대응 (2~3s × 재시도 × 카드 실데이터 도달 여유)
  timeout: 90_000,
  // 단일 assertion 대기 — Supabase Realtime 가격 첫 틱까지 넉넉히
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: BASE_URL,
    // 실패 시만 증거 자동 수집 (성공 케이스는 디스크 절약)
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // 이미 dev 서버가 떠 있으면 재사용 — 저사양 환경에서 두 번 띄우지 않는다.
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
