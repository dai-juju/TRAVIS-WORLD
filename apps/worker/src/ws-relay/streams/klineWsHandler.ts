// ============================================================
// klineWsHandler — `<symbol>@kline_1m` 스트림 처리 (M1.3 Step 5e, E1 scope).
//
// 책임:
//   - Binance `<symbol>@kline_1m` 페이로드 파싱
//   - volumeKlineWindow 에 KlineVolumeSample push → preComputeTicker 가
//     volume_chg_5m 해석 B 계산에 활용
//   - DB 저장 **없음** (사용자 결정 E1: 1m kline DB 저장 스토리지 부담 큼, follow-up)
//
// 페이로드 스펙 (Binance 공식):
//   Combined Stream 수신: { stream: "btcusdt@kline_1m", data: {e,E,s,k:{...}} }
//   k 필드:
//     t: start time, T: close time, s: symbol, i: interval,
//     o: open, c: close, h: high, l: low,
//     v: base volume, q: quote volume, n: trade count,
//     x: is closed (bool), V: taker buy vol, Q: taker buy quote vol
//
// 동작 원칙:
//   - 미완성봉(x=false) 도 최신값으로 push → RollingWindow의 "1분 내 교체" 로직이
//     같은 window step을 덮어씀. 봉 완성 시점에 최종값이 자리잡음.
//   - 봉 완성(x=true) 시 별도 DB 저장 로직 없음 (E1 scope).
//   - symbol key: "{marketType}:{symbol}" — tickerWindow 와 동일 네임스페이스 규칙.
// ============================================================

import { RollingWindow } from "../../compute/RollingWindow.js";
import type { KlineVolumeSample } from "../../compute/preCompute.js";
import type { MarketType, StreamHandler } from "../types.js";

/** 1m kline 원시 페이로드 */
interface KlineRaw {
  e?: string; // "kline"
  E?: number;
  s?: string; // symbol (대문자)
  k?: KlineDetail;
}

interface KlineDetail {
  t?: number; // start time (ms)
  T?: number; // close time (ms)
  s?: string;
  i?: string; // interval — "1m"
  o?: string;
  c?: string;
  h?: string;
  l?: string;
  v?: string; // base volume
  q?: string; // quote volume
  n?: number; // trade count
  x?: boolean; // is closed
  V?: string;
  Q?: string;
}

export interface KlineWsHandlerDeps {
  /** 1m kline volume 전용 window. preComputeTicker 에서 참조됨. */
  volumeKlineWindow: RollingWindow<KlineVolumeSample>;
}

/**
 * 1m kline 스트림 전용 핸들러. 스트림 이름 패턴 `<symbol>@kline_1m`.
 * 5m/1h/1d 는 E1 scope에서 제외.
 */
export function createKlineWsHandler(deps: KlineWsHandlerDeps): StreamHandler {
  return {
    id: "klineWsHandler",
    canHandle: (streamName: string): boolean =>
      // 예: "btcusdt@kline_1m"
      streamName.endsWith("@kline_1m"),
    handle: async (
      _streamName: string,
      marketType: MarketType,
      data: unknown,
    ): Promise<void> => {
      if (typeof data !== "object" || data === null) return;
      const raw = data as KlineRaw;
      const k = raw.k;
      if (!k || typeof k.s !== "string" || typeof k.T !== "number") return;

      const volume = parseNum(k.v);
      if (volume === null) return;

      const sample: KlineVolumeSample = {
        ts: k.T, // close time — window.push 의 1분 교체 판정에 쓰임
        volume,
        isClosed: k.x === true,
      };
      const key = `${marketType}:${k.s}`;

      // RollingWindow.push 내부에서 lastCommittedTs 기반 replace/push 자동 처리.
      deps.volumeKlineWindow.push(key, sample);
      // async handler 계약 유지 (StreamHandler.handle 은 Promise<void>).
      await Promise.resolve();
    },
  };
}

function parseNum(v: string | undefined): number | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
