// rateLimiter.ts (TokenBucket) 단위 테스트 (M2 경로 A Step 2, 2026-06-22).
//
// now() 주입으로 시간 결정적 검증 (실 타이머 불필요).

import { describe, it, expect } from "vitest";
import { TokenBucket } from "../rateLimiter.js";

describe("TokenBucket", () => {
  it("가득 찬 상태로 시작 — capacity 만큼 연속 소비 허용", () => {
    const now = 1000;
    const b = new TokenBucket({ capacity: 3, refillPerSec: 1, now: () => now });
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(true);
  });

  it("고갈되면 거부(false)", () => {
    const now = 1000;
    const b = new TokenBucket({ capacity: 2, refillPerSec: 1, now: () => now });
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(false); // 고갈
  });

  it("시간 경과로 refill — 1초 뒤 refillPerSec 만큼 회복", () => {
    let now = 1000;
    const b = new TokenBucket({ capacity: 5, refillPerSec: 2, now: () => now });
    // 5개 모두 소비
    for (let i = 0; i < 5; i++) expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(false);
    // 1초 경과 → 2개 회복
    now += 1000;
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(false); // 다시 고갈
  });

  it("refill 은 capacity 를 넘지 않음", () => {
    let now = 1000;
    const b = new TokenBucket({ capacity: 3, refillPerSec: 10, now: () => now });
    b.tryConsume(); // 2 남음
    now += 10_000; // 100개치 충전 시도 → capacity(3) 상한
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(true);
    expect(b.tryConsume()).toBe(false); // 3개 초과 회복 안 됨
  });
});
