// ============================================================
// MarkPriceWriteCoalescer — markPrice DB 쓰기 전용 시간창 코얼레서
// ([10-77] Realtime throttle, M2 사이클 1, 2026-07-07).
//
// 배경 (docs/task-record/M2-[10-77]-realtime-throttle.md):
//   markPriceWsHandler 가 now_futures_indicator 에 ~1초 주기 partial upsert
//   (~719 row/초) → 이 테이블을 Realtime 구독하는 모든 카드가 markPrice churn
//   메시지를 수신 = Supabase Realtime "Message Count Exceeded" 의 잔여 주범.
//   화면의 실시간 마크가격은 경로 A(WS 직결, handler 의 publish)가 담당하므로,
//   **DB 쓰기만** 60초 창으로 모아 1회 flush 해도 사용자 체감 0.
//
// 책임:
//   - enqueue: 마켓별 Map<symbol, row> 에 최신 row 만 보관 (latest-wins —
//     StreamCoalescer.ingest 와 동형 dedupe).
//   - flush(60초 주기): 마켓별 배열로 retryOnTransient(upsert...Partial) —
//     마켓 간 **순차 await** (동시 upsert deadlock 금지 규율).
//   - stop: 타이머 정지 + 잔여 버퍼 최종 flush **await** (shutdown 유실 방지).
//
// 하지 않는 것 (경계):
//   - 경로 A publish 는 이 모듈과 무관 — handler 상류에서 이미 방송됨.
//     ★ StreamCoalescer(수신측 1초 재조립)의 flushIntervalMs 를 올리는 방식은
//     금물: publish 까지 늦춰져 경로 A 실시간이 죽고, COINM(@arr 직행,
//     수신 코얼레서 미경유)은 throttle 되지도 않는다. throttle 은 반드시
//     이 모듈(핸들러 하류, DB 전용 지점)에서만.
//   - markPrice 도메인(동일 6키 partial row) 외 다른 도메인 row 는 넣지 않는다
//     — mixed-batch 불변(feedback_mixed_batch_invariant)을 버퍼 격리로 보장.
//
// 유실 경계 (의도된 트레이드오프):
//   - flush 실패(재시도 소진): 로그만 남기고 버림 — markPrice 는 1초마다
//     재도착하므로 버퍼가 즉시 최신값으로 재충전, 다음 flush 가 회복.
//   - crash: 최대 1 창(60초)분 DB 미반영. premiumIndexTask 30분 sweep +
//     재부팅 즉시 재수신이 회복 경로. 경로 A(인메모리 방송)는 무손실.
// ============================================================

import type {
  IDataService,
  NowFuturesIndicatorInsert,
} from "@travis/data-service";
import { retryOnTransient } from "@travis/exchange-collectors";
import type { MarketType } from "./types.js";

export interface MarkPriceWriteCoalescerConfig {
  dataService: IDataService;
  /** DB flush 창 (ms). 기본 60초 — 사용자 확정 2026-07-07 (절감 최대). */
  flushIntervalMs?: number;
}

const DEFAULT_FLUSH_INTERVAL_MS = 60_000;

export class MarkPriceWriteCoalescer {
  private readonly dataService: IDataService;
  private readonly flushIntervalMs: number;

  /** marketType → (symbol → 최신 markPrice partial row). flush 시 values 배열. */
  private readonly buffers: Map<
    MarketType,
    Map<string, NowFuturesIndicatorInsert>
  > = new Map();

  private flushTimer: NodeJS.Timeout | null = null;
  /**
   * 진행 중 flush 추적 (겹침 가드 + shutdown 대기 겸용).
   * ★ boolean 가드 대신 promise 를 들고 있는 이유 (code-reviewer W1, 2026-07-07):
   *   stop() 이 "진행 중 flush 의 upsert await 구간"과 겹치면, boolean early-return
   *   가드는 최종 flush 를 삼켜 그 사이 유입된 잔여 rows 가 유실된다(좁은 창이지만
   *   "shutdown 유실 방지" 계약 위반). stop() 은 진행분을 await 한 뒤 재flush.
   */
  private flushPromise: Promise<void> | null = null;

  constructor(config: MarkPriceWriteCoalescerConfig) {
    this.dataService = config.dataService;
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  }

  // ─── 공개 API ────────────────────────────────

  /**
   * markPriceWsHandler 가 매 배치(~1초)마다 호출. 심볼별 최신 row 만 남긴다.
   * 동기·비차단 — 핸들러의 publish(경로 A) 지연에 영향 0.
   */
  enqueue(
    marketType: MarketType,
    rows: ReadonlyArray<NowFuturesIndicatorInsert>,
  ): void {
    let buf = this.buffers.get(marketType);
    if (!buf) {
      buf = new Map();
      this.buffers.set(marketType, buf);
    }
    for (const row of rows) {
      buf.set(row.symbol, row); // 같은 창 내 중복 심볼 → 최신이 이김
    }
  }

  /** flush 주기 시작. 중복 호출 무시. */
  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flushAll();
    }, this.flushIntervalMs);
  }

  /**
   * 타이머 정지 + 잔여 버퍼 최종 flush.
   * shutdown 에서 반드시 await — 최대 1창분 유실 방지 (StreamCoalescer.stop 과
   * 동형이나, DB 왕복이 있어 async).
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // W1: 진행 중 flush 가 있으면 완료를 먼저 기다림 — 겹침 가드에 최종 flush 가
    // 삼켜지지 않게 한 뒤, 그 사이 유입된 잔여 버퍼까지 재flush (유실 0).
    if (this.flushPromise) await this.flushPromise;
    await this.flushAll();
  }

  /** 관측용 — 상태 로그에서 마켓별 대기 row 수 노출. */
  getStatus(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [market, buf] of this.buffers) {
      out[market] = buf.size;
    }
    return out;
  }

  // ─── 내부 ────────────────────────────────────

  private flushAll(): Promise<void> {
    // 겹침 방어 — 진행 중이면 그 promise 를 그대로 반환 (버퍼는 유지되어 다음 기회에).
    if (this.flushPromise) return this.flushPromise;
    const run = this.doFlush();
    // promise 콜백(.finally)은 마이크로태스크 — 이 동기 대입보다 먼저 실행될 수 없음.
    this.flushPromise = run.finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  private async doFlush(): Promise<void> {
    // 마켓별 순차 await — 동시 upsert deadlock 금지 규율
    // (feedback_concurrent_upsert_deadlock).
    for (const [market, buf] of this.buffers) {
      if (buf.size === 0) continue;
      const batch = [...buf.values()];
      buf.clear(); // 먼저 비움 — flush 중 도착하는 새 row 는 다음 창으로
      try {
        const res = await retryOnTransient(
          () => this.dataService.upsertNowFuturesIndicatorPartial(batch),
          { label: `markPriceWriteCoalescer ${market}` },
        );
        if (!res.success) {
          // graceful — markPrice 는 1초마다 재도착하므로 다음 창이 회복.
          console.error(
            `[markPriceWriteCoalescer] ${market} flush 최종 실패 (${batch.length} rows, 다음 창 회복): ${res.error}`,
          );
        } else {
          // 창당 1줄 — Phase B 라이브 게이트(G2)에서 "DB 쓰기 60초 1회" 증거 로그.
          console.log(
            `[markPriceWriteCoalescer] ${market} flush ${batch.length} rows (window ${this.flushIntervalMs}ms)`,
          );
        }
      } catch (e) {
        // dataService 는 Result 반환(throw 금지 규약)이지만, 이 flush 는 interval
        // 위 `void` 실행이라 예기치 못한 throw = unhandledRejection → 방어선 1겹.
        // 다른 마켓 flush 는 계속 진행 (crash 금지).
        console.error(
          `[markPriceWriteCoalescer] ${market} flush 예외 (${batch.length} rows, 다음 창 회복):`,
          e,
        );
      }
    }
  }
}
