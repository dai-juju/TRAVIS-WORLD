// ============================================================
// smokeArrMigration — `[10-11]` @arr → chunked per-symbol 이전 사전 라이브 smoke.
//
// 목적 (read-only, DB 접근 0, 커밋 게이트):
//   구현 전 외부 API 사실 4가지를 라이브로 확정한다
//   (메모리 feedback_external_api_live_smoke — 문서/자문만 믿고 커밋하면
//    COINM dapi 사례처럼 필드/주기 가정이 틀릴 수 있음).
//
//   [A] USDM `<symbol>@markPrice@1s` payload 키 셋 — 공식 문서상 9필드
//       (e/E/s/p/ap/i/P/r/T). 특히 `ap`(moving average) 실재 + `r`(funding) 확인.
//   [B] USDM `<symbol>@ticker` push 간격 — 공식 문서 충돌 (Individual 페이지
//       2000ms vs @arr 페이지 1000ms). 실측으로 확정 → stale 임계값 설계 입력.
//   [C] USDM `<symbol>@forceOrder` — sparse (청산 없으면 무음) 정상 확인.
//   [D] SPOT `<symbol>@ticker` — 21필드 (b/B/a/A/x 포함) + 1000ms.
//   [E] fstream 다중 연결 sanity — chunked 설계는 USDM ~8연결. 동시 2연결이
//       각각 독립으로 메시지 수신하는지 확인.
//
// 공식 문서 ref (2026-06-10 조회):
//   USDM markPrice: https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/Mark-Price-Stream
//   USDM ticker:    .../Individual-Symbol-Ticker-Streams
//   USDM forceOrder:.../Liquidation-Order-Streams
//   SPOT streams:   https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams
//
// 실행: pnpm -F @travis/worker exec tsx src/scripts/smokeArrMigration.ts
// ============================================================

import WebSocket from "ws";

const RUN_DURATION_MS = 45_000;

/** 스트림별 수신 타임스탬프 + 마지막 payload 키 셋 수집기 */
interface StreamStats {
  timestamps: number[];
  lastPayloadKeys: string[] | null;
  samplePayload: unknown;
}

const stats = new Map<string, StreamStats>();

function record(connLabel: string, streamName: string, data: unknown): void {
  const key = `${connLabel} ${streamName}`;
  let s = stats.get(key);
  if (!s) {
    s = { timestamps: [], lastPayloadKeys: null, samplePayload: null };
    stats.set(key, s);
  }
  s.timestamps.push(Date.now());
  if (data && typeof data === "object" && !Array.isArray(data)) {
    s.lastPayloadKeys = Object.keys(data as Record<string, unknown>).sort();
    if (s.samplePayload === null) s.samplePayload = data;
  }
}

/** combined stream 연결 1개 열고 메시지를 record 로 흘림. graceful — throw 금지. */
function openCombined(label: string, baseUrl: string, streams: string[]): WebSocket {
  const url = `${baseUrl}/stream?streams=${streams.join("/")}`;
  const ws = new WebSocket(url, { perMessageDeflate: false });
  ws.on("open", () => console.log(`[${label}] connected (${streams.length} streams)`));
  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString("utf8")) as {
        stream?: string;
        data?: unknown;
      };
      if (typeof msg.stream === "string") record(label, msg.stream, msg.data);
    } catch {
      // 파싱 실패 메시지는 무시 (smoke 목적상 카운트 불필요)
    }
  });
  ws.on("error", (err: Error) => console.error(`[${label}] error: ${err.message}`));
  ws.on("close", (code: number) => console.log(`[${label}] closed code=${code}`));
  return ws;
}

/** 간격 통계 (ms): 연속 수신 간격의 min/median/max */
function intervalStats(timestamps: number[]): string {
  if (timestamps.length < 2) return `msgs=${timestamps.length} (간격 측정 불가)`;
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const cur = timestamps[i];
    const prev = timestamps[i - 1];
    if (cur === undefined || prev === undefined) continue; // noUncheckedIndexedAccess 방어
    gaps.push(cur - prev);
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return `msgs=${timestamps.length} gap min=${gaps[0]}ms median=${median}ms max=${gaps[gaps.length - 1]}ms`;
}

async function main(): Promise<void> {
  console.log(`=== smokeArrMigration 시작 (${RUN_DURATION_MS / 1000}s 수집) ===\n`);

  const sockets: WebSocket[] = [];

  // [A][B][C] USDM 연결 #1 — markPrice + ticker(고/저유동성) + forceOrder
  // ★ /market 경로 필수 (2026-04-23 레거시 폐지 — types.ts BINANCE_WS_BASE 주석 참조)
  sockets.push(
    openCombined("usdm#1", "wss://fstream.binance.com/market", [
      "btcusdt@markPrice@1s",
      "btcusdt@ticker",
      "ethusdt@ticker",
      "btcusdt@forceOrder",
      "ethusdt@forceOrder",
    ]),
  );

  // [E] USDM 연결 #2 — 동시 다중 연결 sanity (chunked 설계 전제)
  sockets.push(
    openCombined("usdm#2", "wss://fstream.binance.com/market", [
      "solusdt@markPrice@1s",
      "solusdt@ticker",
    ]),
  );

  // [D] SPOT 연결 — full ticker 21필드 + 주기
  sockets.push(
    openCombined("spot#1", "wss://stream.binance.com:9443", [
      "btcusdt@ticker",
      "ethusdt@ticker",
    ]),
  );

  await new Promise((resolve) => setTimeout(resolve, RUN_DURATION_MS));

  console.log("\n=== 결과 ===\n");
  for (const [key, s] of [...stats.entries()].sort()) {
    console.log(`■ ${key}`);
    console.log(`  ${intervalStats(s.timestamps)}`);
    if (s.lastPayloadKeys) {
      console.log(`  keys(${s.lastPayloadKeys.length}): ${s.lastPayloadKeys.join(",")}`);
    }
  }

  // [A] markPrice 필드 판정
  const mark = stats.get("usdm#1 btcusdt@markPrice@1s");
  const markKeys = mark?.lastPayloadKeys ?? [];
  console.log("\n--- 판정 ---");
  console.log(
    `[A] markPrice ap 필드: ${markKeys.includes("ap") ? "✅ 실재" : "❌ 없음"} / r(funding): ${markKeys.includes("r") ? "✅" : "❌"} / i(index): ${markKeys.includes("i") ? "✅" : "❌"} / P(estSettle): ${markKeys.includes("P") ? "✅" : "❌"}`,
  );
  if (mark?.samplePayload) {
    console.log(`    sample: ${JSON.stringify(mark.samplePayload)}`);
  }

  // [B] USDM ticker 주기 판정
  const usdmTicker = stats.get("usdm#1 btcusdt@ticker");
  console.log(
    `[B] USDM ticker 주기: ${usdmTicker ? intervalStats(usdmTicker.timestamps) : "수신 0"} → median 이 ~1000 인지 ~2000 인지 확인`,
  );
  console.log(
    `    필드 수(기대 17): ${usdmTicker?.lastPayloadKeys?.length ?? "?"}`,
  );

  // [C] forceOrder sparse 판정
  const fo =
    (stats.get("usdm#1 btcusdt@forceOrder")?.timestamps.length ?? 0) +
    (stats.get("usdm#1 ethusdt@forceOrder")?.timestamps.length ?? 0);
  console.log(`[C] forceOrder 수신 ${fo}건 — 0건이어도 정상 (sparse)`);

  // [D] SPOT ticker 판정
  const spotTicker = stats.get("spot#1 btcusdt@ticker");
  const spotKeys = spotTicker?.lastPayloadKeys ?? [];
  console.log(
    `[D] SPOT ticker 필드 수(기대 21): ${spotKeys.length} / b,B,a,A 포함: ${["b", "B", "a", "A"].every((k) => spotKeys.includes(k)) ? "✅" : "❌"}`,
  );

  // [E] 다중 연결 판정
  const conn2 = stats.get("usdm#2 solusdt@markPrice@1s");
  console.log(
    `[E] fstream 동시 2연결: usdm#2 markPrice ${conn2 ? `✅ ${conn2.timestamps.length}건 수신` : "❌ 수신 0"}`,
  );

  for (const ws of sockets) {
    try {
      ws.close(1000, "smoke done");
    } catch {
      // 무시 — 종료 단계
    }
  }
  // close 이벤트 플러시 잠깐 대기 후 종료
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  console.log("\n=== smoke 종료 ===");
  process.exit(0);
}

void main();
