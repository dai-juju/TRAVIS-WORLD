// ============================================================
// _upsertRetry 단위 테스트 (M1.3 Step 4 사후 보강 — 2026-04-20).
//
// 검증 시나리오:
//   1. 성공 — 1회만 실행, 즉시 반환
//   2. deadlock detected → 재시도로 복구
//   3. fetch failed → 재시도로 복구
//   4. 502 Bad Gateway → 재시도로 복구
//   5. 영구 에러(스키마 위반 등) → 재시도 없이 즉시 반환
//   6. 최대 시도 초과 → 마지막 실패 Result 반환 (crash 금지)
//   7. isTransientError 헬퍼 — 패턴 매칭 정확도
// ============================================================

import type { Result } from "@travis/data-service";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTransientError, retryOnTransient } from "../_upsertRetry.js";

describe("retryOnTransient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("성공 시 1회만 실행하고 즉시 Result 반환", async () => {
    const op = vi.fn(async (): Promise<Result<void>> => ({
      success: true,
      data: undefined,
    }));

    const result = await retryOnTransient(op, { label: "test" });

    expect(op).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it("deadlock detected 시 재시도하여 성공 복구", async () => {
    const op = vi
      .fn<() => Promise<Result<void>>>()
      .mockResolvedValueOnce({ success: false, error: "deadlock detected" })
      .mockResolvedValueOnce({ success: true, data: undefined });

    const promise = retryOnTransient(op, { label: "test", baseDelayMs: 10 });
    // 재시도 backoff(10ms) 통과시키기
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;

    expect(op).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  });

  it("fetch failed 네트워크 에러 시 재시도 복구", async () => {
    const op = vi
      .fn<() => Promise<Result<void>>>()
      .mockResolvedValueOnce({
        success: false,
        error: "TypeError: fetch failed",
      })
      .mockResolvedValueOnce({ success: true, data: undefined });

    const promise = retryOnTransient(op, { label: "test", baseDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;

    expect(op).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  });

  it("502 Bad Gateway HTML 응답 시 재시도 복구", async () => {
    const op = vi
      .fn<() => Promise<Result<void>>>()
      .mockResolvedValueOnce({
        success: false,
        error: "<html><body>502 Bad Gateway cloudflare</body></html>",
      })
      .mockResolvedValueOnce({ success: true, data: undefined });

    const promise = retryOnTransient(op, { label: "test", baseDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;

    expect(op).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  });

  it("영구 에러(스키마 위반)는 재시도 없이 즉시 실패 반환", async () => {
    const op = vi.fn<() => Promise<Result<void>>>().mockResolvedValue({
      success: false,
      error: 'column "foo" does not exist',
    });

    const result = await retryOnTransient(op, { label: "test" });

    expect(op).toHaveBeenCalledTimes(1); // 재시도 안 함
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("does not exist");
    }
  });

  it("최대 시도 초과 시 마지막 실패 Result를 그대로 반환 (crash 없음)", async () => {
    const op = vi.fn<() => Promise<Result<void>>>().mockResolvedValue({
      success: false,
      error: "deadlock detected",
    });

    const promise = retryOnTransient(op, {
      label: "test",
      baseDelayMs: 10,
      maxAttempts: 3,
    });
    // 2번의 backoff(10ms, 30ms) 통과.
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(30);
    const result = await promise;

    expect(op).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("deadlock detected");
    }
  });

  it("성공 데이터 타입을 보존한다 (Result<number> 케이스)", async () => {
    const op = vi.fn(async (): Promise<Result<number>> => ({
      success: true,
      data: 42,
    }));

    const result = await retryOnTransient(op, { label: "test" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(42);
  });
});

describe("isTransientError", () => {
  it("deadlock detected 포함 문자열을 transient로 판정", () => {
    expect(isTransientError("deadlock detected")).toBe(true);
    expect(isTransientError("ERROR: deadlock detected on table xyz")).toBe(true);
  });

  it("네트워크 에러 계열을 전부 transient로 판정", () => {
    expect(isTransientError("TypeError: fetch failed")).toBe(true);
    expect(isTransientError("ECONNRESET")).toBe(true);
    expect(isTransientError("ETIMEDOUT while connecting")).toBe(true);
    expect(isTransientError("connect ECONNREFUSED 127.0.0.1:5432")).toBe(true);
  });

  it("상위 인프라 5xx 계열을 transient로 판정", () => {
    expect(isTransientError("502 Bad Gateway")).toBe(true);
    expect(isTransientError("<html>503 Service Unavailable</html>")).toBe(true);
    expect(isTransientError("504 Gateway Timeout from cloudflare")).toBe(true);
  });

  it("Too Many Requests(429) 를 transient로 판정", () => {
    expect(isTransientError("Too Many Requests")).toBe(true);
  });

  it("영구 에러는 transient가 아니라고 판정", () => {
    expect(isTransientError('column "foo" does not exist')).toBe(false);
    expect(isTransientError("permission denied for table now_spot_ticker")).toBe(
      false,
    );
    expect(isTransientError("invalid input syntax for type numeric")).toBe(false);
  });

  it("빈 문자열은 false", () => {
    expect(isTransientError("")).toBe(false);
  });
});
