// ============================================================
// BinanceChunkedRelay — 임의 per-symbol 스트림 묶음의 chunked WS 관리자
// (M2 테마 A Step 2.5, [10-11] @arr stall 근본 수정).
//
// 배경 (docs/task-record/M2-themeA-incident-arr-stream-stall.md):
//   `@arr`(전 종목 배열) 스트림은 USDM 608종 기준 프레임이 커서 production
//   연결에서 전송 stall (재연결해도 재발, watchdog 으로 해결 불가). 같은
//   서버에서 chunked per-symbol 인 BinanceKlineRelay(250 streams/conn)는
//   무사고 → 동일 패턴을 임의 스트림 suffix 묶음으로 일반화한 것이 이 클래스.
//
// 책임:
//   1. 마켓별 스트림 리스트를 CHUNK_SIZE(250) 단위로 분할해 N개 연결 생성.
//      심볼당 suffix 들이 인접 배치되므로(buildPerSymbolStreams) USDM 의 경우
//      모든 chunk 에 `@markPrice@1s`(1초 고정 push)가 섞여 연결 생존 신호 보장
//      → sparse 한 `@forceOrder`(청산 없으면 무음, 공식 문서 확인 2026-06-10)가
//      섞여 있어도 watchdog 오발동 없음.
//   2. 수신 메시지를 sink(StreamCoalescer)에 전달 — 이 클래스는 연결 관리만.
//   3. 자동 재연결 / stale 감지 / firstMessage watchdog / graceful shutdown
//      (BinanceKlineRelay 와 동일 메커니즘).
//
// 설계 원칙:
//   - BinanceWsRelay/BinanceKlineRelay 와 연결 관리 코드 3번째 중복 출현.
//     CLAUDE.md "3번째 출현 시 제네릭화" 기준에 닿았으나, kline relay 는
//     무사고 production 코드라 이번 scope 에서 불변 유지 (incident 수정 우선).
//     공통 BaseWsConnection 추출은 deferred 등재 (거래소 2개째 또는 다음 WS 작업 시).
//   - throw 금지. 모든 에러 내부 catch + 로그 (graceful, CLAUDE.md).
//
// 공식 문서 ref (crypto-domain-expert 검증 2026-06-10 조회):
//   - markPrice:  https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/Mark-Price-Stream
//     payload: e/E/s/p/ap/i/P/r/T (@arr 원소와 동일, ap=moving avg 추가 확인)
//   - ticker:     .../Individual-Symbol-Ticker-Streams (17필드, 주기 1000/2000ms 는 배포 시 smoke 실측)
//   - forceOrder: .../Liquidation-Order-Streams ("no liquidation in 1000ms → no stream" = sparse 정상)
//   - 한도: 1024 streams/conn, 24h 강제 단절, SPOT 300 connections/5min/IP
// ============================================================

import WebSocket from "ws";
import {
  BINANCE_WS_BASE,
  buildCombinedStreamUrl,
  type MarketType,
} from "./types.js";

/**
 * 한 연결당 최대 스트림 수 — BinanceKlineRelay 와 동일 250.
 * (1,024 논리 한도 대비 보수적 + Combined Stream URL 414 한계 회피.
 *  2026-04-20 실측: 1,000 chunk 는 HTTP 414 URI Too Long.)
 */
const DEFAULT_CHUNK_SIZE = 250;

const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
/**
 * stale 판정 — kline relay 와 동일 180s.
 * USDM chunk 는 markPrice@1s 가 섞여 1초 주기 수신이 정상이지만, spot chunk 는
 * ticker 전용(거래 없으면 무음 가능)이라 보수적으로 kline 과 같은 3분.
 */
const DEFAULT_STALE_CONNECTION_MS = 180_000;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;
/** 첫 메시지 watchdog — BinanceWsRelay/[3-52] Phase A 와 동일 목적·기본값. */
const DEFAULT_FIRST_MESSAGE_WATCHDOG_MS = 30_000;

/**
 * 수신 메시지를 받아갈 sink 계약 — StreamCoalescer 가 구현.
 * (router 직결이 아닌 이유: per-symbol 단건을 @arr 배열 계약으로 재조립하는
 *  코얼레싱 계층이 사이에 필요. streamCoalescer.ts 헤더 참조.)
 */
export interface ChunkedRelaySink {
  ingest(streamName: string, marketType: MarketType, data: unknown): void;
}

export interface BinanceChunkedRelayConfig {
  sink: ChunkedRelaySink;
  /**
   * 마켓별 구독 스트림 전체 리스트 (이미 조합된 이름).
   * buildPerSymbolStreams() 로 생성 권장 — 심볼당 suffix 인접 배치 보장.
   */
  streamsByMarket: Readonly<Record<MarketType, readonly string[]>>;
  chunkSize?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  staleConnectionMs?: number;
  healthCheckIntervalMs?: number;
  /** 환경변수 override: WS_FIRST_MESSAGE_WATCHDOG_MS (기존 relay 들과 공유). */
  firstMessageWatchdogMs?: number;
}

interface ChunkedConnection {
  marketType: MarketType;
  chunkIndex: number;
  ws: WebSocket | null;
  reconnectAttempts: number;
  lastMessageAt: number | null;
  streams: readonly string[];
  reconnectTimer: NodeJS.Timeout | null;
  firstMessageTimer: NodeJS.Timeout | null;
}

export class BinanceChunkedRelay {
  private readonly sink: ChunkedRelaySink;
  private readonly chunksPerMarket: Readonly<Record<MarketType, string[][]>>;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly staleConnectionMs: number;
  private readonly healthCheckIntervalMs: number;
  private readonly firstMessageWatchdogMs: number;

  private connections: ChunkedConnection[] = [];
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private shuttingDown = false;

  constructor(config: BinanceChunkedRelayConfig) {
    this.sink = config.sink;
    this.reconnectBaseMs = config.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = config.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
    this.staleConnectionMs =
      config.staleConnectionMs ?? DEFAULT_STALE_CONNECTION_MS;
    this.healthCheckIntervalMs =
      config.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS;
    // 환경변수 override → config → default 순. NaN/0/음수 방어 (기존 relay 동일).
    const envWatchdog = Number(process.env.WS_FIRST_MESSAGE_WATCHDOG_MS);
    const envWatchdogValid =
      Number.isFinite(envWatchdog) && envWatchdog > 0 ? envWatchdog : null;
    this.firstMessageWatchdogMs =
      config.firstMessageWatchdogMs ??
      envWatchdogValid ??
      DEFAULT_FIRST_MESSAGE_WATCHDOG_MS;

    const chunkSize = config.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const markets: MarketType[] = ["spot", "futures_usdm", "futures_coinm"];
    const chunksPerMarket: Record<MarketType, string[][]> = {
      spot: [],
      futures_usdm: [],
      futures_coinm: [],
    };
    for (const market of markets) {
      const streams = config.streamsByMarket[market] ?? [];
      chunksPerMarket[market] = chunkStreams(streams, chunkSize);
    }
    this.chunksPerMarket = chunksPerMarket;
  }

  // ─── 공개 API ────────────────────────────────

  start(): void {
    if (this.shuttingDown) {
      console.warn("[BinanceChunkedRelay] start() 호출됨 but shuttingDown — 무시");
      return;
    }

    for (const [market, chunks] of Object.entries(this.chunksPerMarket) as [
      MarketType,
      string[][],
    ][]) {
      if (chunks.length === 0) continue;
      console.log(
        `[BinanceChunkedRelay] ${market} 스트림 → ${chunks.length}개 WS 연결로 분할`,
      );
      chunks.forEach((chunkStreamList, chunkIndex) => {
        const conn: ChunkedConnection = {
          marketType: market,
          chunkIndex,
          ws: null,
          reconnectAttempts: 0,
          lastMessageAt: null,
          streams: chunkStreamList,
          reconnectTimer: null,
          firstMessageTimer: null,
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
              `[BinanceChunkedRelay] ${conn.marketType}#${conn.chunkIndex} close 예외:`,
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

  /** 상태 요약 (5분 status 로그용) — kline relay 와 동일 shape + stale 최대값. */
  getStatus(): {
    totalConnections: number;
    connectedByMarket: Record<MarketType, number>;
    /** 연결 중 가장 오래 메시지 못 받은 시간 (ms). 관측용. null = 메시지 0건. */
    maxSilenceMs: number | null;
  } {
    const connectedByMarket: Record<MarketType, number> = {
      spot: 0,
      futures_usdm: 0,
      futures_coinm: 0,
    };
    const now = Date.now();
    let maxSilenceMs: number | null = null;
    for (const conn of this.connections) {
      if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        connectedByMarket[conn.marketType] += 1;
        if (conn.lastMessageAt !== null) {
          const silence = now - conn.lastMessageAt;
          if (maxSilenceMs === null || silence > maxSilenceMs) {
            maxSilenceMs = silence;
          }
        }
      }
    }
    return {
      totalConnections: this.connections.length,
      connectedByMarket,
      maxSilenceMs,
    };
  }

  // ─── 연결 라이프사이클 (BinanceKlineRelay 패턴) ─────

  private connect(conn: ChunkedConnection): void {
    const baseUrl = BINANCE_WS_BASE[conn.marketType];
    const url = buildCombinedStreamUrl(baseUrl, conn.streams);
    // perMessageDeflate disable — M1.6 Step 4 hotfix 와 동일 사유 (압축 +
    // 큰 페이로드 콤보의 stall 회피). chunked 는 프레임이 작지만 일관성 유지.
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
        `[BinanceChunkedRelay] ${label} connected (${conn.streams.length} streams)`,
      );
    });
    ws.on("message", (raw: Buffer) => {
      conn.lastMessageAt = Date.now();
      this.clearFirstMessageWatchdog(conn);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString("utf8"));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[BinanceChunkedRelay] ${label} JSON parse 실패: ${msg}`);
        return;
      }
      const msg = parsed as { stream?: unknown; data?: unknown };
      if (typeof msg.stream !== "string" || msg.data === undefined) return;
      try {
        this.sink.ingest(msg.stream, conn.marketType, msg.data);
      } catch (e) {
        // sink 계약 위반(throw) 방어 — 로그만, 다음 메시지 계속.
        const m = e instanceof Error ? e.message : String(e);
        console.error(`[BinanceChunkedRelay] ${label} sink.ingest threw: ${m}`);
      }
    });
    ws.on("error", (err: Error) => {
      console.error(`[BinanceChunkedRelay] ${label} error: ${err.message}`);
    });
    ws.on("close", (code: number, reason: Buffer) => {
      const reasonStr = reason.toString("utf8") || "(no reason)";
      conn.ws = null;
      this.clearFirstMessageWatchdog(conn);
      if (this.shuttingDown) {
        console.log(
          `[BinanceChunkedRelay] ${label} closed (shutdown): code=${code}`,
        );
        return;
      }
      console.warn(
        `[BinanceChunkedRelay] ${label} closed — 재연결 예약: code=${code} reason="${reasonStr}"`,
      );
      this.scheduleReconnect(conn);
    });

    this.armFirstMessageWatchdog(conn, ws);
  }

  /** 첫 메시지 watchdog (BinanceKlineRelay 와 동일 패턴, connection 단위). */
  private armFirstMessageWatchdog(
    conn: ChunkedConnection,
    ws: WebSocket,
  ): void {
    this.clearFirstMessageWatchdog(conn);
    const armedAt = Date.now();
    const label = `${conn.marketType}#${conn.chunkIndex}`;

    conn.firstMessageTimer = setTimeout(() => {
      conn.firstMessageTimer = null;
      if (this.shuttingDown) return;
      if (conn.ws !== ws) return; // 이미 close/재연결 → no-op
      if (conn.lastMessageAt !== null && conn.lastMessageAt >= armedAt) return;

      const elapsed = Date.now() - armedAt;
      console.warn(
        `[BinanceChunkedRelay] ${label} firstMessage watchdog 발동 (${elapsed}ms 무응답) — 강제 재연결`,
      );
      try {
        ws.terminate();
      } catch (e) {
        console.error(
          `[BinanceChunkedRelay] ${label} firstMessage terminate 예외:`,
          e,
        );
      }
    }, this.firstMessageWatchdogMs);
  }

  private clearFirstMessageWatchdog(conn: ChunkedConnection): void {
    if (conn.firstMessageTimer) {
      clearTimeout(conn.firstMessageTimer);
      conn.firstMessageTimer = null;
    }
  }

  private scheduleReconnect(conn: ChunkedConnection): void {
    if (this.shuttingDown) return;
    conn.reconnectAttempts += 1;
    const delay = this.backoffMs(conn.reconnectAttempts);
    const label = `${conn.marketType}#${conn.chunkIndex}`;
    console.log(
      `[BinanceChunkedRelay] ${label} 재연결 예약: attempt=${conn.reconnectAttempts}, delay=${delay}ms`,
    );
    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null;
      if (this.shuttingDown) return;
      this.connect(conn);
    }, delay);
  }

  /** exponential backoff with cap — 기존 relay 들과 동일 산식. */
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
          `[BinanceChunkedRelay] ${label} stale 감지 (${elapsed}ms) — 강제 재연결`,
        );
        try {
          conn.ws.terminate();
        } catch (e) {
          console.error(`[BinanceChunkedRelay] ${label} terminate 예외:`, e);
        }
      }
    }
  }
}

// ─── 순수 헬퍼 (테스트 대상) ─────────────────────

/**
 * 심볼 리스트 × suffix 리스트 → per-symbol 스트림 이름 조합.
 *
 * **심볼당 suffix 인접 배치** — chunk 분할 시 모든 chunk 에 각 suffix 가
 * 고르게 섞이도록 보장 (USDM: 모든 chunk 에 markPrice@1s 포함 → 연결 생존 신호).
 *
 * 예: (["BTCUSDT","ETHUSDT"], ["@ticker","@markPrice@1s"])
 *  → ["btcusdt@ticker","btcusdt@markPrice@1s","ethusdt@ticker","ethusdt@markPrice@1s"]
 */
export function buildPerSymbolStreams(
  symbols: readonly string[],
  suffixes: readonly string[],
): string[] {
  const out: string[] = [];
  for (const sym of symbols) {
    const lower = sym.toLowerCase();
    for (const suffix of suffixes) {
      out.push(`${lower}${suffix}`);
    }
  }
  return out;
}

/** 배열을 chunkSize 단위로 쪼갠다 (BinanceKlineRelay 의 chunkArray 와 동일). */
export function chunkStreams(
  streams: readonly string[],
  chunkSize: number,
): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < streams.length; i += chunkSize) {
    out.push(streams.slice(i, i + chunkSize));
  }
  return out;
}
