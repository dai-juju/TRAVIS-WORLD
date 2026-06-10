// ============================================================
// StreamCoalescer — per-symbol 스트림 → 기존 `@arr` 배열 계약 재조립 (M2 테마 A Step 2.5).
//
// 배경 ([10-11] @arr stall 사고, docs/task-record/M2-themeA-incident-arr-stream-stall.md):
//   Binance `@arr`(전 종목 배열) 스트림이 production 연결에서 큰 프레임 stall
//   → chunked per-symbol 스트림으로 이전. 단 per-symbol 은 메시지가 "심볼당 단건"
//   으로 도착하므로 그대로 upsert 하면 초당 수백 건 개별 DB 쓰기가 발생한다
//   (동시 upsert deadlock 금지 + mixed-batch 불변 메모리 규율 위반 위험).
//
// 책임:
//   1. per-symbol 단건 payload 를 flushIntervalMs(기본 1초) 동안 모아
//      기존 `@arr` 배열 모양으로 재조립 → StreamRouter 에 synthetic stream
//      이름("!markPrice@arr@1s" 등)으로 전달 → **기존 핸들러 무변경 재사용**.
//   2. 같은 flush 윈도우 안에서 같은 심볼이 2번 오면 최신 payload 가 이김 (dedupe).
//   3. sparse 이벤트 스트림(청산 forceOrder)은 passthrough — 모으지 않고 단건
//      즉시 전달 (기존 forceOrderWsHandler 도 단건 객체 계약).
//
// 설계 원칙:
//   - Binance 비종속 generic: rule(suffix → synthetic) 만 주입하면 어떤 스트림도
//     수용. 새 스트림 추가 시 rule 1줄 추가 (확장성, CLAUDE.md).
//   - throw 금지. 비정상 payload 는 1회 경보 후 drop (graceful).
//   - batch 원소는 **원본 payload 객체 그대로** — 기존 normalize 함수와의
//     shape 계약을 코얼레서가 변형하지 않는다 (테스트로 못박음).
// ============================================================

import type { StreamRouter } from "./streamRouter.js";
import type { MarketType } from "./types.js";

/** per-symbol 스트림 1종 → synthetic @arr 이름 매핑 규칙 */
export interface CoalescerRule {
  /**
   * per-symbol 스트림 이름 suffix. 예: "@markPrice@1s", "@ticker", "@forceOrder".
   * 매칭은 endsWith — "btcusdt@miniTicker" 는 "@ticker" 에 매칭되지 않음
   * (suffix 가 "@" 로 시작하므로 안전).
   */
  readonly suffix: string;
  /**
   * StreamRouter 에 전달할 synthetic stream 이름.
   * 기존 핸들러의 canHandle 과 일치해야 함. 예: "!markPrice@arr@1s".
   */
  readonly synthetic: string;
  /**
   * batch: flush 윈도우 동안 모아 배열로 전달 (ticker/markPrice — 고빈도 upsert 류).
   * passthrough: 단건 즉시 전달 (forceOrder — sparse 이벤트, 기존 계약도 단건).
   */
  readonly mode: "batch" | "passthrough";
}

export interface StreamCoalescerConfig {
  router: StreamRouter;
  rules: readonly CoalescerRule[];
  /** batch flush 주기 (ms). 기본 1000 — 기존 @arr 의 1초 push 주기와 동일. */
  flushIntervalMs?: number;
}

const DEFAULT_FLUSH_INTERVAL_MS = 1_000;

/** batch 버퍼 그룹 키 — 마켓 × synthetic 단위로 독립 배열 재조립 */
function groupKey(marketType: MarketType, synthetic: string): string {
  return `${marketType}|${synthetic}`;
}

export class StreamCoalescer {
  private readonly router: StreamRouter;
  private readonly rules: readonly CoalescerRule[];
  private readonly flushIntervalMs: number;

  /** groupKey → (symbol → 최신 payload). flush 시 values 를 배열로 전달. */
  private readonly buffers: Map<string, Map<string, unknown>> = new Map();
  /** groupKey → {marketType, synthetic} 역참조 (flush 시 라우팅 정보 복원) */
  private readonly groupMeta: Map<
    string,
    { marketType: MarketType; synthetic: string }
  > = new Map();

  private flushTimer: NodeJS.Timeout | null = null;
  /** 비정상 payload 1회 경보용 (suffix 단위) — 로그 폭주 방지 */
  private readonly warnedRules: Set<string> = new Set();

  constructor(config: StreamCoalescerConfig) {
    this.router = config.router;
    this.rules = config.rules;
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  }

  // ─── 공개 API ────────────────────────────────

  /** flush 주기 시작. 중복 호출 무시. */
  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.flushAll();
    }, this.flushIntervalMs);
  }

  /** flush 주기 정지 + 잔여 버퍼 최종 flush (shutdown 시 데이터 유실 방지). */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushAll();
  }

  /**
   * per-symbol 메시지 수신 entry point (relay 가 호출).
   * 매칭 rule 없으면 조용히 무시 (kline 등 다른 relay 소관 스트림).
   * throw 금지.
   */
  ingest(streamName: string, marketType: MarketType, data: unknown): void {
    const rule = this.rules.find((r) => streamName.endsWith(r.suffix));
    if (!rule) return;

    if (rule.mode === "passthrough") {
      // 기존 핸들러 계약이 단건 객체인 스트림 (forceOrder). 즉시 전달.
      void this.router.route(rule.synthetic, marketType, data);
      return;
    }

    // batch — 심볼 키 추출. Binance per-symbol payload 는 모두 `s` 필드 보유.
    const symbol = (data as { s?: unknown } | null)?.s;
    if (typeof symbol !== "string" || symbol.length === 0) {
      if (!this.warnedRules.has(rule.suffix)) {
        this.warnedRules.add(rule.suffix);
        console.warn(
          `[StreamCoalescer] ${rule.suffix} payload 에 symbol(s) 없음 — drop (이후 동일 경보 생략)`,
        );
      }
      return;
    }

    const key = groupKey(marketType, rule.synthetic);
    let buf = this.buffers.get(key);
    if (!buf) {
      buf = new Map();
      this.buffers.set(key, buf);
      this.groupMeta.set(key, { marketType, synthetic: rule.synthetic });
    }
    buf.set(symbol, data); // 같은 윈도우 내 중복 심볼 → 최신이 이김
  }

  /** 관측용 — 5분 status 로그에서 그룹별 버퍼 크기 노출. */
  getStatus(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, buf] of this.buffers) {
      out[key] = buf.size;
    }
    return out;
  }

  // ─── 내부 ────────────────────────────────────

  private flushAll(): void {
    for (const [key, buf] of this.buffers) {
      if (buf.size === 0) continue;
      const meta = this.groupMeta.get(key);
      if (!meta) continue; // 이론상 불가 — 방어
      const batch = [...buf.values()];
      buf.clear();
      // 비동기지만 await 안 함 — relay 의 handleMessage 와 동일 정책
      // (StreamRouter 내부가 graceful 처리, throw 안 함).
      void this.router.route(meta.synthetic, meta.marketType, batch);
    }
  }
}
