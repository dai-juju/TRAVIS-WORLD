// apps/web/lib/__tests__/relativeTime.test.ts
//
// formatRelativeTime 단위 테스트 (M2 테마 A Step 2). now(ms)를 인자로 받는 순수 함수라
// Date.now() mocking 없이 결정적으로 검증.

import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../format/relativeTime";

const base = Date.parse("2026-06-09T08:00:00Z");

describe("formatRelativeTime", () => {
  it("5초 미만 → just now", () => {
    expect(formatRelativeTime("2026-06-09T08:00:00Z", base + 3000)).toBe(
      "just now",
    );
  });

  it("초 단위 (5~59s)", () => {
    expect(formatRelativeTime("2026-06-09T08:00:00Z", base + 42_000)).toBe(
      "42s ago",
    );
  });

  it("분 단위", () => {
    expect(formatRelativeTime("2026-06-09T08:00:00Z", base + 180_000)).toBe(
      "3m ago",
    );
  });

  it("시간 단위", () => {
    expect(
      formatRelativeTime("2026-06-09T08:00:00Z", base + 2 * 3600_000),
    ).toBe("2h ago");
  });

  it("일 단위", () => {
    expect(
      formatRelativeTime("2026-06-09T08:00:00Z", base + 3 * 86_400_000),
    ).toBe("3d ago");
  });

  it("미래 timestamp(시계 오차) → 음수 방지, just now", () => {
    expect(formatRelativeTime("2026-06-09T08:00:00Z", base - 5000)).toBe(
      "just now",
    );
  });

  it("null/빈 문자열/파싱 불가 graceful", () => {
    expect(formatRelativeTime(null, base)).toBe("—");
    expect(formatRelativeTime(undefined, base)).toBe("—");
    expect(formatRelativeTime("not-a-date", base)).toBe("—");
  });
});
