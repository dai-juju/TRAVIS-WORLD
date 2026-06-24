// LiveWsServer 통합 테스트 (M2 경로 A Step 2, 2026-06-22).
//
// 실제 ws 서버 + ws 클라로 보안 동작 검증: 핸드셰이크 인증 거부/통과 +
// 구독 cap + 메시지 rate limit close(4429). 한계값은 limits 주입으로 테스트.
// 각 테스트가 고유 포트로 서버를 띄우고 finally 에서 정리(병렬 충돌 방지).

import { describe, it, expect, beforeAll } from "vitest";
import { WebSocket, type RawData } from "ws";
import { SignJWT, generateKeyPair, type CryptoKey } from "jose";
import { LiveBus } from "../LiveBus.js";
import { LiveWsServer, WS_SUBPROTOCOL } from "../WsServer.js";
import { createTokenVerifier } from "../auth.js";

// Step 4 Phase B (2026-06-24): HS256 → ES256(비대칭). 로컬 키페어로 서명/검증.
let publicKey: CryptoKey;
let privateKey: CryptoKey;
let portCounter = 8240;

beforeAll(async () => {
  ({ publicKey, privateKey } = await generateKeyPair("ES256"));
});

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sign(expSecFromNow = 3600): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expSecFromNow;
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256" })
    .setSubject("user-1")
    .setAudience("authenticated")
    .setExpirationTime(exp)
    .sign(privateKey);
}

interface ServerCtx {
  server: LiveWsServer;
  bus: LiveBus;
  port: number;
}

type TestLimits = {
  maxSubscriptionsPerConn?: number;
  rateBurst?: number;
  rateRefillPerSec?: number;
};

async function makeServer(limits?: TestLimits): Promise<ServerCtx> {
  const port = portCounter++;
  const bus = new LiveBus();
  const server = new LiveWsServer({
    liveBus: bus,
    verifyToken: createTokenVerifier(() => publicKey),
    port,
    host: "127.0.0.1",
    limits,
  });
  server.start();
  await wait(120); // listen 대기
  return { server, bus, port };
}

/** 접속 + open 대기 (실패 시 reject). */
function openClient(port: number, protocols?: string[]): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, protocols);
    ws.on("open", () => resolve(ws));
    ws.on("error", (e) => reject(e));
  });
}

describe("LiveWsServer 인증 + 오남용 방어", () => {
  it("유효 토큰 → 접속 + subscribe + 방송 수신", async () => {
    const { server, bus, port } = await makeServer();
    try {
      const token = await sign();
      const ws = await openClient(port, [WS_SUBPROTOCOL, token]);
      const got: { topic: string; payload: { v?: number } }[] = [];
      ws.on("message", (raw: RawData) => {
        got.push(JSON.parse(raw.toString()));
      });
      ws.send(JSON.stringify({ type: "subscribe", topic: "t:1" }));
      await wait(100);
      bus.publish("t:1", { v: 42 });
      for (let i = 0; i < 20 && got.length < 1; i++) await wait(25);
      expect(got).toHaveLength(1);
      expect(got[0]?.payload).toEqual({ v: 42 });
      ws.close();
      await wait(50);
    } finally {
      await server.stop();
    }
  });

  it("무토큰 접속 → 핸드셰이크 거부", async () => {
    const { server, port } = await makeServer();
    try {
      await expect(openClient(port)).rejects.toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  it("잘못된 토큰 → 핸드셰이크 거부", async () => {
    const { server, port } = await makeServer();
    try {
      await expect(openClient(port, [WS_SUBPROTOCOL, "garbage.token.x"])).rejects.toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  it("구독 cap 초과분 graceful 무시 (소켓 유지)", async () => {
    const { server, bus, port } = await makeServer({
      maxSubscriptionsPerConn: 3,
      rateBurst: 100,
      rateRefillPerSec: 100,
    });
    try {
      const token = await sign();
      const ws = await openClient(port, [WS_SUBPROTOCOL, token]);
      for (let i = 0; i < 5; i++) {
        ws.send(JSON.stringify({ type: "subscribe", topic: `t:${i}` }));
      }
      await wait(150);
      // cap=3 → 5개 중 3개만 실제 구독(나머지 무시), 소켓은 살아있음.
      expect(bus.subscriberCount()).toBe(3);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
      await wait(50);
    } finally {
      await server.stop();
    }
  });

  it("토큰 만료 시 close(4401) — 재인증 유도", async () => {
    const { server, port } = await makeServer();
    try {
      const token = await sign(2); // 2초 뒤 만료
      const ws = await openClient(port, [WS_SUBPROTOCOL, token]);
      const closeCode = new Promise<number>((resolve) => {
        ws.on("close", (code: number) => resolve(code));
      });
      const code = await Promise.race([closeCode, wait(5000).then(() => -1)]);
      expect(code).toBe(4401);
    } finally {
      await server.stop();
    }
  });

  it("메시지 rate 초과 → close(4429)", async () => {
    const { server, port } = await makeServer({
      rateBurst: 2,
      rateRefillPerSec: 0, // refill 없음 → 버스트 소진 즉시 차단
    });
    try {
      const token = await sign();
      const ws = await openClient(port, [WS_SUBPROTOCOL, token]);
      const closeCode = new Promise<number>((resolve) => {
        ws.on("close", (code: number) => resolve(code));
      });
      // 버스트 2 + 1 = 3번째에서 rate 초과 → close 4429
      for (let i = 0; i < 3; i++) {
        ws.send(JSON.stringify({ type: "subscribe", topic: `r:${i}` }));
      }
      const code = await Promise.race([closeCode, wait(2000).then(() => -1)]);
      expect(code).toBe(4429);
    } finally {
      await server.stop();
    }
  });
});
