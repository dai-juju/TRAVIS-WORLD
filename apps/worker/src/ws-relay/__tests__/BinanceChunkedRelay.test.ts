// ============================================================
// BinanceChunkedRelay 순수 헬퍼 테스트 (M2 테마 A Step 2.5, [10-11]).
//
// WS 라이프사이클은 production 검증 영역 (BinanceKlineRelay 와 동일 정책 —
// 기존 relay 테스트도 순수 부분만 커버). 여기서는:
//   - buildPerSymbolStreams 조합 (심볼당 suffix 인접 배치)
//   - chunkStreams 분할 + "모든 chunk 에 markPrice 포함" 생존 신호 보장
//   - backoffMs 산식 (기존 relay 동일)
// ============================================================

import { describe, expect, it } from "vitest";
import {
  BinanceChunkedRelay,
  buildPerSymbolStreams,
  chunkStreams,
} from "../BinanceChunkedRelay.js";

const USDM_SUFFIXES = ["@ticker", "@markPrice@1s", "@forceOrder"] as const;

describe("buildPerSymbolStreams", () => {
  it("심볼 × suffix 조합 — 소문자 변환 + 심볼당 suffix 인접 배치", () => {
    const out = buildPerSymbolStreams(["BTCUSDT", "ETHUSDT"], [
      "@ticker",
      "@markPrice@1s",
    ]);
    expect(out).toEqual([
      "btcusdt@ticker",
      "btcusdt@markPrice@1s",
      "ethusdt@ticker",
      "ethusdt@markPrice@1s",
    ]);
  });

  it("빈 심볼 리스트 → 빈 배열 (연결 생략 경로)", () => {
    expect(buildPerSymbolStreams([], ["@ticker"])).toEqual([]);
  });
});

describe("chunkStreams", () => {
  it("USDM 608 심볼 × 3 suffix = 1824 streams → 8 chunks (250 단위)", () => {
    const symbols = Array.from({ length: 608 }, (_, i) => `SYM${i}USDT`);
    const streams = buildPerSymbolStreams(symbols, USDM_SUFFIXES);
    expect(streams).toHaveLength(1_824);

    const chunks = chunkStreams(streams, 250);
    expect(chunks).toHaveLength(8); // ceil(1824/250)
    expect(chunks.slice(0, 7).every((c) => c.length === 250)).toBe(true);
    expect(chunks[7]).toHaveLength(1_824 - 250 * 7); // 74
  });

  it("★ 생존 신호 보장: 심볼당 suffix 인접 배치 시 모든 chunk 에 markPrice@1s 포함", () => {
    // sparse 한 forceOrder 만 모인 chunk 가 생기면 watchdog 오발동 —
    // 인접 배치 구조가 이를 구조적으로 방지하는지 검증.
    const symbols = Array.from({ length: 608 }, (_, i) => `SYM${i}USDT`);
    const streams = buildPerSymbolStreams(symbols, USDM_SUFFIXES);
    const chunks = chunkStreams(streams, 250);

    for (const chunk of chunks) {
      expect(chunk.some((s) => s.endsWith("@markPrice@1s"))).toBe(true);
    }
  });

  it("spot 1408 심볼 × 1 suffix → 6 chunks", () => {
    const symbols = Array.from({ length: 1_408 }, (_, i) => `S${i}USDT`);
    const streams = buildPerSymbolStreams(symbols, ["@ticker"]);
    const chunks = chunkStreams(streams, 250);
    expect(chunks).toHaveLength(6); // ceil(1408/250)
  });
});

describe("BinanceChunkedRelay.backoffMs", () => {
  const relay = new BinanceChunkedRelay({
    sink: { ingest: () => undefined },
    streamsByMarket: { spot: [], futures_usdm: [], futures_coinm: [] },
  });

  it("exponential backoff with 30s cap (기존 relay 동일 산식)", () => {
    expect(relay.backoffMs(0)).toBe(1_000);
    expect(relay.backoffMs(1)).toBe(1_000);
    expect(relay.backoffMs(2)).toBe(2_000);
    expect(relay.backoffMs(3)).toBe(4_000);
    expect(relay.backoffMs(5)).toBe(16_000);
    expect(relay.backoffMs(6)).toBe(30_000);
    expect(relay.backoffMs(99)).toBe(30_000);
  });
});
