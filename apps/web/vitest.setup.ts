/**
 * Vitest global setup — @testing-library/jest-dom matchers 확장 + cleanup.
 *
 * M1.5 Step 4d (2026-04-23) 신설.
 *   RTL 기반 컴포넌트 테스트 (`components/**`) 에서 `toBeInTheDocument`,
 *   `toBeDisabled`, `toHaveAttribute` 등 DOM-친화 matcher 가 필요.
 *   각 테스트 끝에 auto-cleanup 도 수행해 DOM leak 방지.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
