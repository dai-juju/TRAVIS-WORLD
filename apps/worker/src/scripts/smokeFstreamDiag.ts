// ============================================================
// smokeFstreamDiag — fstream per-symbol 침묵 정밀 진단 (Step 2.5 배포 게이트).
//
// 배경: smokeArrMigration 에서 production 서버조차 fstream per-symbol
//   (markPrice@1s/ticker) 메시지 0건. 같은 서버의 kline relay(fstream chunked)
//   는 무사고 → 모순. 어느 축이 문제인지 분리:
//     A: raw 단일 스트림 endpoint (/ws/btcusdt@markPrice@1s) — combined 경로 의심 검증
//     B: combined markPrice (/stream?streams=btcusdt@markPrice@1s)
//     C: combined kline (/stream?streams=btcusdt@kline_1m) — known-good 스트림 타입 대조
//     D: combined ticker 단독 (/stream?streams=btcusdt@ticker)
//   모든 연결의 raw 프레임을 카운트 + 첫 프레임 앞 160자 출력 + ping 이벤트 관측.
//
// read-only. 실행: npx tsx src/scripts/smokeFstreamDiag.ts
// ============================================================

import WebSocket from "ws";

const RUN_MS = 30_000;
const FSTREAM = "wss://fstream.binance.com";

interface ConnStat {
  frames: number;
  pings: number;
  firstFrame: string | null;
  errors: string[];
  closed: string | null;
}

const stats = new Map<string, ConnStat>();

function open(label: string, url: string): WebSocket {
  const s: ConnStat = { frames: 0, pings: 0, firstFrame: null, errors: [], closed: null };
  stats.set(label, s);
  const ws = new WebSocket(url, { perMessageDeflate: false });
  ws.on("open", () => console.log(`[${label}] open`));
  ws.on("message", (raw: Buffer) => {
    s.frames += 1;
    // 앞 3프레임은 내용 출력 (구독 ACK / LIST 응답 / 첫 데이터 관측용)
    if (s.frames <= 3) {
      const head = raw.toString("utf8").slice(0, 160);
      if (s.firstFrame === null) s.firstFrame = head;
      console.log(`[${label}] 프레임#${s.frames}: ${head}`);
    }
  });
  ws.on("ping", () => {
    s.pings += 1;
  });
  ws.on("error", (err: Error) => {
    s.errors.push(err.message);
    console.error(`[${label}] error: ${err.message}`);
  });
  ws.on("close", (code: number, reason: Buffer) => {
    s.closed = `code=${code} reason=${reason.toString("utf8") || "-"}`;
  });
  return ws;
}

/** 연결 후 SUBSCRIBE 컨트롤 메시지로 구독하는 변형 — URL 파라미터 구독 불능 가설 검증 */
function openWithSubscribe(label: string, url: string, params: string[]): WebSocket {
  const ws = open(label, url);
  ws.on("open", () => {
    try {
      ws.send(JSON.stringify({ method: "SUBSCRIBE", params, id: 1 }));
      console.log(`[${label}] SUBSCRIBE 전송: ${params.join(",")}`);
    } catch (e) {
      console.error(`[${label}] SUBSCRIBE 전송 실패:`, e);
    }
  });
  return ws;
}

async function main(): Promise<void> {
  console.log(`=== fstream 진단 (${RUN_MS / 1000}s) ===`);
  const sockets = [
    open("A raw-markPrice", `${FSTREAM}/ws/btcusdt@markPrice@1s`),
    open("B comb-markPrice", `${FSTREAM}/stream?streams=btcusdt@markPrice@1s`),
    open("C comb-kline", `${FSTREAM}/stream?streams=btcusdt@kline_1m`),
    open("D comb-ticker", `${FSTREAM}/stream?streams=btcusdt@ticker`),
    // E/F: URL 파라미터 없이 bare 연결 후 SUBSCRIBE 메시지 (가설 검증 핵심)
    openWithSubscribe("E subscribe-markPrice", `${FSTREAM}/ws`, [
      "btcusdt@markPrice@1s",
    ]),
    openWithSubscribe("F subscribe-combined", `${FSTREAM}/stream`, [
      "btcusdt@ticker",
    ]),
    // G: COINM dstream 대조 (production 에서 무사고인 호스트)
    open(
      "G dstream-comb-markPrice",
      "wss://dstream.binance.com/stream?streams=btcusd_perp@markPrice@1s",
    ),
    // H: 고빈도 aggTrade + 5초 후 LIST_SUBSCRIPTIONS (구독이 서버에 등록됐는지 확인)
    openWithSubscribe("H subscribe-aggTrade", `${FSTREAM}/ws`, [
      "btcusdt@aggTrade",
    ]),
    // I: 레거시 fstream3 호스트 (과거 병행 운영 이력)
    open(
      "I fstream3-comb-markPrice",
      "wss://fstream3.binance.com/stream?streams=btcusdt@markPrice@1s",
    ),
    // J: ★ 신규 /market 경로 (2026-04-23 레거시 폐지 공지의 이전 대상) —
    //    markPrice/ticker/kline/forceOrder 전부 /market 소속 (공식 Excerpt, 2026-06-10 조회)
    open(
      "J market-comb-mixed",
      `${FSTREAM}/market/stream?streams=btcusdt@markPrice@1s/btcusdt@ticker/btcusdt@kline_1m/btcusdt@forceOrder`,
    ),
  ];

  // H 연결의 구독 등록 여부 확인 — 5초 후 LIST_SUBSCRIPTIONS 전송
  setTimeout(() => {
    const h = sockets[7];
    if (h && h.readyState === WebSocket.OPEN) {
      try {
        h.send(JSON.stringify({ method: "LIST_SUBSCRIPTIONS", id: 2 }));
        console.log("[H] LIST_SUBSCRIPTIONS 전송");
      } catch {
        // 무시
      }
    }
  }, 5_000);

  await new Promise((r) => setTimeout(r, RUN_MS));

  console.log("\n=== 결과 ===");
  for (const [label, s] of stats) {
    console.log(
      `■ ${label}: frames=${s.frames} pings=${s.pings} closed=${s.closed ?? "open유지"} errors=${s.errors.join(";") || "-"}`,
    );
  }

  for (const ws of sockets) {
    try {
      ws.close(1000, "diag done");
    } catch {
      // 종료 단계 — 무시
    }
  }
  await new Promise((r) => setTimeout(r, 500));
  process.exit(0);
}

void main();
