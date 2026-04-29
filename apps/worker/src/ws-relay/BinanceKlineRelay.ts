// ============================================================
// BinanceKlineRelay — 전 심볼 1m kline WebSocket 관리자 (M1.3 Step 5e, E1 scope).
//
// 책임:
//   1. Binance 심볼 리스트(SPOT + USDM + COINM)를 받아 `<symbol>@kline_1m`
//      스트림들을 **Combined Stream 1개 연결당 최대 1,000 streams** 로 chunk
//      (공식 1,024 한도에 24 여유 확보).
//   2. 마켓별로 N개 WebSocket 연결 생성 (N = ceil(symbolCount / CHUNK_SIZE)).
//   3. 수신 메시지를 StreamRouter 에게 dispatch — 클래스 자체는 연결 관리만.
//   4. 자동 재연결 / stale 감지 / graceful shutdown (BinanceWsRelay 와 동일 패턴).
//
// 설계 원칙:
//   - BinanceWsRelay 와 코드 중복 있음. "3번째 출현 시 제네릭화" 원칙(CLAUDE.md)
//     기준으로 아직 허용. 향후 OKX WS 추가 시 BaseWsConnection 으로 공통화 검토.
//   - kline 특성: 심볼 리스트가 크고 동적 (exchangeInfo 변경 시 update 가능).
//     이번 E1 scope 에서는 bootstrap 시 1회 로드 → 재시작까지 유지. 24시간 단절
//     재연결 시에도 동일 심볼 리스트 사용. 정기 refresh 는 follow-up.
//
// 참고:
//   https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams
//   "1 connection can listen to a maximum of 1024 streams"
//
// CHUNK_SIZE 를 1,000 으로 두면 논리 한도(1,024)는 지키지만
// Combined Stream URL 이 ~18KB 로 폭증 → Binance 가 HTTP 414 (URI Too Long) 반환.
// 스트림 이름 평균 18 chars 기준 250개면 ~4.5KB 로 일반 HTTP 헤더 8KB 한계에 안전.
// SPOT TRADING 1,408 → 6 연결, USDM TRADING 608 → 3, COINM TRADING 30 → 1 = 총 10 연결
// (Binance 5분당 300 연결 한도에 충분히 여유). 2026-04-20 MCP 실측 기준.
// 2026-04-20 실측 414 확인 후 CHUNK_SIZE 하향 + `status="TRADING"` 필터 적용.
// ============================================================

import WebSocket from "ws";
import { StreamRouter } from "./streamRouter.js";
import {
  BINANCE_WS_BASE,
  buildCombinedStreamUrl,
  type MarketType,
} from "./types.js";

/** 한 연결당 구독할 최대 스트림 수 (URL 길이 한계 회피용으로 250). */
const CHUNK_SIZE = 250;

const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
const DEFAULT_STALE_CONNECTION_MS = 180_000; // kline 은 거래 없으면 공백 길 수 있어 3분
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;
/**
 * 첫 메시지 watchdog (deferred [3-52] Phase A, 2026-04-30 회수).
 * BinanceWsRelay 와 동일 목적 — 연결 open 후 N초 내 메시지 0건이면 강제 재연결.
 * 환경변수 override: WS_FIRST_MESSAGE_WATCHDOG_MS=30000.
 *
 * Note: kline 은 거래가 거의 없는 심볼이 chunk 에 섞여 있을 수 있으나, chunk 당
 * 250 streams 이므로 30초 내 어느 한 심볼에서라도 update 가 와야 정상.
 * 30초 무응답은 connection 자체가 죽은 신호.
 */
const DEFAULT_FIRST_MESSAGE_WATCHDOG_MS = 30_000;

export interface BinanceKlineRelayConfig {
  router: StreamRouter;
  /** 마켓별 소문자 심볼 리스트 (예: { spot: ["btcusdt", ...] }) */
  symbols: Readonly<Record<MarketType, readonly string[]>>;
  /** 구독 interval 목록. E1 scope 에서는 ["1m"] 로 호출. 확장성 위해 배열. */
  intervals: readonly string[];
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  staleConnectionMs?: number;
  healthCheckIntervalMs?: number;
  /**
   * 옵션: 첫 메시지 watchdog ms. 기본 30000 (env: WS_FIRST_MESSAGE_WATCHDOG_MS).
   * 연결 open 후 이 시간 내 메시지 0건이면 ws.terminate() → 재연결.
   */
  firstMessageWatchdogMs?: number;
}

interface KlineConnection {
  marketType: MarketType;
  chunkIndex: number;
  ws: WebSocket | null;
  reconnectAttempts: number;
  lastMessageAt: number | null;
  streams: readonly string[];
  reconnectTimer: NodeJS.Timeout | null;
  /** 첫 메시지 watchdog timer (deferred [3-52] Phase A, 2026-04-30). */
  firstMessageTimer: NodeJS.Timeout | null;
  /** watchdog 등록 시각 — 첫 메시지 도착 여부 판정에 사용. */
  firstMessageArmedAt: number | null;
}

export class BinanceKlineRelay {
  private readonly router: StreamRouter;
  private readonly chunksPerMarket: Readonly<Record<MarketType, string[][]>>;
  private readonly intervals: readonly string[];
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly staleConnectionMs: number;
  private readonly healthCheckIntervalMs: number;
  private readonly firstMessageWatchdogMs: number;

  private connections: KlineConnection[] = [];
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private shuttingDown = false;

  constructor(config: BinanceKlineRelayConfig) {
    this.router = config.router;
    this.intervals = config.intervals;
    this.reconnectBaseMs = config.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = config.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
    this.staleConnectionMs = config.staleConnectionMs ?? DEFAULT_STALE_CONNECTION_MS;
    this.healthCheckIntervalMs =
      config.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS;
    // 환경변수 override → config → default 순. NaN/0/음수 방어.
    const envWatchdog = Number(process.env.WS_FIRST_MESSAGE_WATCHDOG_MS);
    const envWatchdogValid =
      Number.isFinite(envWatchdog) && envWatchdog > 0 ? envWatchdog : null;
    this.firstMessageWatchdogMs =
      config.firstMessageWatchdogMs ??
      envWatchdogValid ??
      DEFAULT_FIRST_MESSAGE_WATCHDOG_MS;

    // 심볼 × interval → stream 이름 조합 생성 후 chunk 나누기.
    const markets: MarketType[] = ["spot", "futures_usdm", "futures_coinm"];
    const chunksPerMarket: Record<MarketType, string[][]> = {
      spot: [],
      futures_usdm: [],
      futures_coinm: [],
    };
    for (const market of markets) {
      const symbols = config.symbols[market] ?? [];
      const streams: string[] = [];
      for (const sym of symbols) {
        for (const interval of this.intervals) {
          // Binance 스트림 이름은 소문자 심볼 + @kline_<interval>
          streams.push(`${sym.toLowerCase()}@kline_${interval}`);
        }
      }
      chunksPerMarket[market] = chunkArray(streams, CHUNK_SIZE);
    }
    this.chunksPerMarket = chunksPerMarket;
  }

  // ─── 공개 API ────────────────────────────────

  start(): void {
    if (this.shuttingDown) {
      console.warn("[BinanceKlineRelay] start() 호출됨 but shuttingDown — 무시");
      return;
    }

    for (const [market, chunks] of Object.entries(this.chunksPerMarket) as [
      MarketType,
      string[][],
    ][]) {
      if (chunks.length === 0) {
        console.log(`[BinanceKlineRelay] ${market} 심볼 0개 — 연결 생략`);
        continue;
      }
      console.log(
        `[BinanceKlineRelay] ${market} 심볼 → ${chunks.length}개 WS 연결로 분할`,
      );
      chunks.forEach((chunkStreams, chunkIndex) => {
        const conn: KlineConnection = {
          marketType: market,
          chunkIndex,
          ws: null,
          reconnectAttempts: 0,
          lastMessageAt: null,
          streams: chunkStreams,
          reconnectTimer: null,
          firstMessageTimer: null,
          firstMessageArmedAt: null,
        };
        this.connections.push(conn);
        this.connect(conn);
      });
    }
    this.startHealthCheck();
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    this.stopHealthCheck();

    for (const conn of this.connections) {
      if (conn.reconnectTimer) {
        clearTimeout(conn.reconnectTimer);
        conn.reconnectTimer = null;
      }
      // firstMessage watchdog 도 함께 정리 (shutdown 후 spurious terminate 방지)
      this.clearFirstMessageWatchdog(conn);
    }

    const closeTasks: Promise<void>[] = [];
    for (const conn of this.connections) {
      const ws = conn.ws;
      if (!ws) continue;
      closeTasks.push(
        new Promise<void>((resolve) => {
          if (ws.readyState === WebSocket.CLOSED) {
            resolve();
            return;
          }
          ws.once("close", () => resolve());
          try {
            ws.close(1000, "graceful shutdown");
          } catch (e) {
            console.error(
              `[BinanceKlineRelay] ${conn.marketType}#${conn.chunkIndex} close 예외:`,
              e,
            );
            resolve();
          }
          setTimeout(() => resolve(), 5_000);
        }),
      );
    }
    await Promise.all(closeTasks);
    this.connections = [];
  }

  /** 상태 요약 (로그용) */
  getStatus(): {
    totalConnections: number;
    connectedByMarket: Record<MarketType, number>;
  } {
    const connectedByMarket: Record<MarketType, number> = {
      spot: 0,
      futures_usdm: 0,
      futures_coinm: 0,
    };
    for (const conn of this.connections) {
      if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        connectedByMarket[conn.marketType] += 1;
      }
    }
    return {
      totalConnections: this.connections.length,
      connectedByMarket,
    };
  }

  // ─── 연결 라이프사이클 ─────────────────────────

  private connect(conn: KlineConnection): void {
    const baseUrl = BINANCE_WS_BASE[conn.marketType];
    const url = buildCombinedStreamUrl(baseUrl, conn.streams);
    // M1.6 Step 4 hotfix (2026-04-28): BinanceWsRelay 와 동일 이유 —
    //   permessage-deflate 압축 disable 로 큰 페이로드 stall 회피.
    //   kline relay 도 250 streams/connection × 1m 봉 push 라 ticker 와
    //   유사한 페이로드 스케일. 향후 [3-41] 모니터링 영역.
    const ws = new WebSocket(url, {
      perMessageDeflate: false,
      maxPayload: 100 * 1024 * 1024,
    });
    conn.ws = ws;

    const label = `${conn.marketType}#${conn.chunkIndex}`;

    ws.on("open", () => {
      conn.reconnectAttempts = 0;
      conn.lastMessageAt = Date.now();
      console.log(
        `[BinanceKlineRelay] ${label} connected (${conn.streams.length} streams)`,
      );
    });
    ws.on("message", (raw: Buffer) => {
      conn.lastMessageAt = Date.now();
      // 첫 메시지 도착 — watchdog 해제 (이미 해제됐으면 no-op).
      this.clearFirstMessageWatchdog(conn);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString("utf8"));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[BinanceKlineRelay] ${label} JSON parse 실패: ${msg}`);
        return;
      }
      const msg = parsed as { stream?: unknown; data?: unknown };
      if (typeof msg.stream !== "string" || msg.data === undefined) return;
      void this.router.route(msg.stream, conn.marketType, msg.data);
    });
    ws.on("error", (err: Error) => {
      console.error(`[BinanceKlineRelay] ${label} error: ${err.message}`);
    });
    ws.on("close", (code: number, reason: Buffer) => {
      const reasonStr = reason.toString("utf8") || "(no reason)";
      conn.ws = null;
      // close 시 watchdog 해제 (정상/비정상 모두). leak + spurious 발동 방지.
      this.clearFirstMessageWatchdog(conn);
      if (this.shuttingDown) {
        console.log(`[BinanceKlineRelay] ${label} closed (shutdown): code=${code}`);
        return;
      }
      console.warn(
        `[BinanceKlineRelay] ${label} closed — 재연결 예약: code=${code} reason="${reasonStr}"`,
      );
      this.scheduleReconnect(conn);
    });

    // 첫 메시지 watchdog 등록 (deferred [3-52] Phase A, 2026-04-30).
    // open 후 firstMessageWatchdogMs 내 메시지 0건이면 ws.terminate() → 재연결.
    this.armFirstMessageWatchdog(conn, ws);
  }

  /**
   * 첫 메시지 watchdog timer 등록 (BinanceWsRelay 와 동일 패턴, connection 단위).
   */
  private armFirstMessageWatchdog(
    conn: KlineConnection,
    ws: WebSocket,
  ): void {
    this.clearFirstMessageWatchdog(conn);
    const watchdogMs = this.firstMessageWatchdogMs;
    const armedAt = Date.now();
    conn.firstMessageArmedAt = armedAt;
    const label = `${conn.marketType}#${conn.chunkIndex}`;

    conn.firstMessageTimer = setTimeout(() => {
      conn.firstMessageTimer = null;
      conn.firstMessageArmedAt = null;
      if (this.shuttingDown) return;

      // 동일 ws 인스턴스 + 첫 메시지 미수신 검증.
      if (conn.ws !== ws) return; // 이미 close/재연결됨 → no-op
      if (conn.lastMessageAt !== null && conn.lastMessageAt >= armedAt) {
        // 정상: 첫 메시지 도착 → 발동 안 함.
        return;
      }

      const elapsed = Date.now() - armedAt;
      console.warn(
        `[BinanceKlineRelay] ${label} firstMessage watchdog 발동 (${elapsed}ms 무응답) — 강제 재연결`,
      );
      try {
        ws.terminate();
      } catch (e) {
        console.error(
          `[BinanceKlineRelay] ${label} firstMessage terminate 예외:`,
          e,
        );
      }
    }, watchdogMs);
  }

  private clearFirstMessageWatchdog(conn: KlineConnection): void {
    if (conn.firstMessageTimer) {
      clearTimeout(conn.firstMessageTimer);
      conn.firstMessageTimer = null;
    }
    conn.firstMessageArmedAt = null;
  }

  private scheduleReconnect(conn: KlineConnection): void {
    if (this.shuttingDown) return;
    conn.reconnectAttempts += 1;
    const delay = this.backoffMs(conn.reconnectAttempts);
    const label = `${conn.marketType}#${conn.chunkIndex}`;
    console.log(
      `[BinanceKlineRelay] ${label} 재연결 예약: attempt=${conn.reconnectAttempts}, delay=${delay}ms`,
    );
    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null;
      if (this.shuttingDown) return;
      this.connect(conn);
    }, delay);
  }

  backoffMs(attempts: number): number {
    if (attempts <= 0) return this.reconnectBaseMs;
    const exp = this.reconnectBaseMs * 2 ** (attempts - 1);
    return Math.min(exp, this.reconnectMaxMs);
  }

  // ─── 헬스체크 ─────────────────────────────────

  private startHealthCheck(): void {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(() => {
      this.checkStaleConnections();
    }, this.healthCheckIntervalMs);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private checkStaleConnections(): void {
    if (this.shuttingDown) return;
    const now = Date.now();
    for (const conn of this.connections) {
      if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) continue;
      if (conn.lastMessageAt === null) continue;
      const elapsed = now - conn.lastMessageAt;
      if (elapsed > this.staleConnectionMs) {
        const label = `${conn.marketType}#${conn.chunkIndex}`;
        console.warn(
          `[BinanceKlineRelay] ${label} stale 감지 (${elapsed}ms) — 강제 재연결`,
        );
        try {
          conn.ws.terminate();
        } catch (e) {
          console.error(`[BinanceKlineRelay] ${label} terminate 예외:`, e);
        }
      }
    }
  }
}

// ─── 유틸 ──────────────────────────────────────

/** 배열을 chunkSize 단위로 쪼갠다. */
function chunkArray<T>(arr: readonly T[], chunkSize: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    out.push(arr.slice(i, i + chunkSize));
  }
  return out;
}
