/**
 * Vitest global setup — @testing-library/jest-dom matchers 확장 + cleanup +
 *   M1.6 Step 5 (D6) act() warning 승격.
 *
 * 이력:
 *   M1.5 Step 4d (2026-04-23) — RTL jest-dom matcher + auto-cleanup.
 *   M1.6 Step 5 (2026-05-03) — `act()` warning 을 즉시 error 로 승격.
 *     nextjs-frontend-specialist 자문 (2026-05-03) 채택. 비동기 setState /
 *     useEffect 부수효과 누락을 조용히 통과시키지 않도록 강제 — 한 번 도입하면
 *     향후 RTL 깨짐을 자동 검출.
 *   사이클 2 Step 5 (2026-07-09) — matchMedia 스텁 (jsdom 미구현 API).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// ─── matchMedia 스텁 (사이클 2 Step 5) ──────────────────────
//
// jsdom 은 window 는 제공하지만 matchMedia 는 미구현. uPlot 이 모듈 로드 시점에
// `domEnv && setPxRatio()` → matchMedia 를 호출하므로(uPlot.cjs L175 — Node SSR 은
// domEnv=false 라 안전, jsdom 만 걸림), chart-card 등록 후 registerCards 를 import
// 하는 모든 테스트가 수집 단계에서 죽는다. 개별 테스트 vi.mock 산포 대신 셋업에서
// 1회 스텁 — 실 구현이 생기면(브라우저) 덮어쓰지 않도록 가드.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined, // deprecated 레거시 시그니처 (라이브러리 호환)
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(() => {
  cleanup();
});

// ─── act() warning 승격 (M1.6 Step 5, D6) ──────────────────
//
// React 가 "An update to ... was not wrapped in act(...)" 형태의 console.error
// 를 발생시키면 이 자리에서 throw — 테스트가 silent 통과되는 함정 차단.
//
// 다른 console.error 는 원본으로 통과 (디버그 정보 보존).
const originalConsoleError = console.error;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(
    (msg: unknown, ...args: unknown[]) => {
      const text =
        typeof msg === "string"
          ? msg
          : msg instanceof Error
            ? msg.message
            : String(msg);
      if (text.includes("not wrapped in act")) {
        throw new Error(`act() warning escalated:\n${text}`);
      }
      // Reflect.apply 로 originalConsoleError 호출 — bound this 안전.
      Reflect.apply(originalConsoleError, console, [msg, ...args]);
    },
  );
});
