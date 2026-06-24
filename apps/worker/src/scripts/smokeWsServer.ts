// ============================================================
// smoke:ws-server — 경로 A(WS 프론트 직결) Step 1+2 격리 통합 smoke (2026-06-22).
//
// 검증: LiveBus + LiveWsServer + JWT 인증 + ws 클라 end-to-end (Binance/Supabase 불필요).
//   0. (Step 2) 무토큰 접속 → 핸드셰이크 거부 (인증 게이트)
//   1. 구독 전 publish 는 무비용 no-op (subscriberCount=0)
//   2. 유효 토큰 접속 → subscribe → 1초 내 방송 tick 수신 (topic/payload 보존)
//   3. 다른 topic 은 미전달 (격리)
//   4. unsubscribe → 전달 중단
//   5. graceful stop
//
// 인증은 테스트 전용 secret + jose 로 서명한 토큰으로 격리 검증(실 Supabase 불필요).
//
// 실행: pnpm -F @travis/worker smoke:ws-server
// ============================================================

import { WebSocket, type RawData } from "ws";
import { SignJWT, generateKeyPair, type CryptoKey } from "jose";
import { LiveBus, LiveWsServer, WS_SUBPROTOCOL, createTokenVerifier } from "../ws-server/index.js";

const PORT = Number.parseInt(process.env.WS_SMOKE_PORT ?? "", 10) || 8099;
const HOST = "127.0.0.1";
// 운반층은 토픽을 불투명하게 다루므로 값 자체는 임의 — 단 Step 4 canonical 형식과
// 일관되게 유지(buildLiveTopic("now_futures_ticker", {market_type, symbol}) 결과 형식).
const TOPIC = "binance:ticker:futures_usdm:BTCUSDT";

interface ReceivedMsg {
  topic: string;
  ts: number;
  seq: number;
  payload: { symbol?: string; last_price?: number };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 테스트용 Supabase 스타일 ES256 토큰(aud=authenticated, sub, exp +1h). */
async function signTestToken(privateKey: CryptoKey): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256" })
    .setSubject("smoke-user")
    .setAudience("authenticated")
    .setExpirationTime("1h")
    .sign(privateKey);
}

async function main(): Promise<void> {
  const failures: string[] = [];
  const check = (cond: boolean, label: string): void => {
    if (cond) {
      console.log(`  ✓ ${label}`);
    } else {
      console.error(`  ✗ ${label}`);
      failures.push(label);
    }
  };

  // Step 4 Phase B (2026-06-24): HS256 → ES256(비대칭). 로컬 키페어로 서명/검증.
  const { publicKey, privateKey } = await generateKeyPair("ES256");

  const bus = new LiveBus();
  const server = new LiveWsServer({
    liveBus: bus,
    verifyToken: createTokenVerifier(() => publicKey),
    port: PORT,
    host: HOST,
  });
  server.start();
  await wait(150); // 서버 listen 대기

  // (0) 무토큰 접속 → 핸드셰이크 거부 (Step 2 인증 게이트)
  const noAuth = new WebSocket(`ws://${HOST}:${PORT}`);
  const noAuthRejected = await new Promise<boolean>((resolve) => {
    noAuth.on("open", () => resolve(false)); // 열리면 인증 실패(=거부 안 됨)
    noAuth.on("error", () => resolve(true)); // 거부 시 error
    setTimeout(() => resolve(false), 1000);
  });
  check(noAuthRejected, "무토큰 접속 핸드셰이크 거부 (인증 게이트)");

  // (1) 구독 전 publish 무비용 no-op
  bus.publish(TOPIC, { last_price: 1 });
  check(bus.subscriberCount() === 0, "구독 전 subscriberCount=0 (무비용 idle)");

  // (2) 유효 토큰 접속
  const token = await signTestToken(privateKey);
  const client = new WebSocket(`ws://${HOST}:${PORT}`, [WS_SUBPROTOCOL, token]);
  const received: ReceivedMsg[] = [];
  client.on("message", (raw: RawData) => {
    received.push(JSON.parse(raw.toString()) as ReceivedMsg);
  });
  await new Promise<void>((resolve, reject) => {
    client.on("open", () => resolve());
    client.on("error", reject);
  });
  check(true, "유효 토큰 WS 접속 성공");

  // 구독
  client.send(JSON.stringify({ type: "subscribe", topic: TOPIC }));
  await wait(150); // 서버측 구독 등록 대기
  check(bus.subscriberCount() === 1, "subscribe 후 subscriberCount=1");

  // 방송 2건 → 1초 내 수신
  const t0 = Date.now();
  bus.publish(TOPIC, { symbol: "BTCUSDT", last_price: 61300.1 });
  bus.publish(TOPIC, { symbol: "BTCUSDT", last_price: 61301.2 });
  for (let i = 0; i < 20 && received.length < 2; i++) await wait(50);
  const elapsed = Date.now() - t0;
  check(received.length === 2, `방송 2건 수신 (got ${received.length})`);
  check(
    received[0]?.topic === TOPIC && received[0]?.payload?.last_price === 61300.1,
    "envelope topic/payload 보존",
  );
  check(elapsed < 1000, `1초 내 도착 (${elapsed}ms)`);

  // (3) 다른 topic 미전달 (격리 — TOPIC 과 다른 토픽이기만 하면 됨)
  bus.publish("binance:ticker:futures_usdm:ETHUSDT", { last_price: 9 });
  await wait(150);
  check(received.length === 2, "다른 topic 은 미전달 (격리)");

  // (4) unsubscribe → 중단
  client.send(JSON.stringify({ type: "unsubscribe", topic: TOPIC }));
  await wait(150);
  check(bus.subscriberCount() === 0, "unsubscribe 후 subscriberCount=0");
  bus.publish(TOPIC, { last_price: 99999 });
  await wait(150);
  check(received.length === 2, "unsubscribe 후 전달 중단");

  // close → 서버측 구독 정리 (close 후에도 누수 없는지)
  client.close();
  await wait(150);

  // (5) graceful stop
  await server.stop();
  check(true, "server.stop() graceful 완료");

  if (failures.length > 0) {
    console.error(`\n[smoke:ws-server] FAILED — ${failures.length}건: ${failures.join(" / ")}`);
    process.exit(1);
  }
  console.log(
    "\n[smoke:ws-server] PASSED — 경로 A JWT 인증 + 토픽 pub/sub + WS fan-out + unsubscribe 정상",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[smoke:ws-server] 예외:", e);
  process.exit(1);
});
