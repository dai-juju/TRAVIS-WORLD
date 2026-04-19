// ============================================================
// 심볼별 롤링 윈도우 (M1.3 Step 4 Substep 4a).
//
// 목적:
//   변화율(price_chg_5m, oi_chg_1h 등) 계산을 위해 워커 프로세스
//   메모리에 "심볼 -> 최근 N개 샘플 큐"를 유지한다.
//   DB(_history)를 매번 SQL 조회하지 않고 O(1) 근처 시간에 과거 값 조회.
//
// 핵심 불변:
//   - throw 금지 — 모든 입력은 graceful 처리 (잘못된 입력은 조용히 무시).
//   - 샘플링 간격(sampleIntervalMs) 이내 push는 큐 맨 뒤 sample을 "교체"
//     (새 값이 더 최신이므로). 이로 인해 호출자가 매 초 push해도
//     실제 저장은 심볼당 1분 1샘플로 유지된다.
//   - maxSize 초과 시 가장 오래된 sample 제거 (FIFO).
//   - `getAt`은 "stepsAgo 지점의 sample"을 반환 — 샘플이 부족하면 null.
//
// 사용 예 (의사코드):
//   const win = new RollingWindow<TickerSample>({ maxSize: 1500, sampleIntervalMs: 60_000 });
//   win.push("BTCUSDT", { ts: Date.now(), price: 50000, volume: 1_000_000 });
//   const fiveMinAgo = win.getAt("BTCUSDT", 5); // 5스텝(=5분) 전 sample
// ============================================================

/** 롤링 윈도우 생성 옵션. */
export interface RollingWindowOptions {
  /** 심볼당 최대 저장 sample 수. 초과 시 FIFO로 가장 오래된 sample 제거. */
  maxSize: number;

  /**
   * 샘플링 최소 간격(ms). 이 간격 이내 push는 새 sample을 큐에 추가하지 않고
   * 맨 뒤 sample을 "교체"한다. 기본값 60,000 (1분).
   *
   * 호출자가 매 초 또는 매 틱 push해도 실제 큐는 1분 1샘플로 유지되어
   * 메모리와 시간축 일관성이 둘 다 보장된다.
   */
  sampleIntervalMs?: number;
}

/** 롤링 윈도우에 저장되는 sample의 최소 계약 (`ts` 필수). */
export interface HasTimestamp {
  /** 이 sample이 생성된 시각 (epoch ms). */
  ts: number;
}

export class RollingWindow<T extends HasTimestamp> {
  private readonly buffers: Map<string, T[]> = new Map();
  /**
   * 심볼별 "큐에 확정(commit)된 마지막 sample의 ts".
   * 교체된 sample이 아니라 push로 추가된 sample의 ts만 기록.
   * 이 값 기준으로 다음 push가 추가(commit)인지 교체(replace)인지 결정한다.
   * 이유: 교체 시 ts를 갱신하면 "1ms마다 교체하는" 호출 패턴에서
   *       영원히 commit이 안 되어 큐가 1개로 고정되는 버그 발생.
   */
  private readonly lastCommittedTs: Map<string, number> = new Map();
  private readonly maxSize: number;
  private readonly sampleIntervalMs: number;

  constructor(options: RollingWindowOptions) {
    if (!Number.isFinite(options.maxSize) || options.maxSize <= 0) {
      // graceful: 잘못된 값은 기본값으로 보정 (throw 금지 불변).
      this.maxSize = 1500;
    } else {
      this.maxSize = Math.floor(options.maxSize);
    }

    const interval = options.sampleIntervalMs ?? 60_000;
    this.sampleIntervalMs = Number.isFinite(interval) && interval > 0 ? interval : 60_000;
  }

  /**
   * sample을 큐에 추가한다.
   * 같은 심볼의 "확정된 마지막 sample"과 `sampleIntervalMs` 이내 간격이면
   * 큐 맨 뒤를 새 sample로 교체 (확정 ts는 유지).
   * 간격이 충분하면 맨 뒤에 새로 추가하고 확정 ts를 갱신. maxSize 초과 시 맨 앞 제거.
   */
  push(symbol: string, sample: T): void {
    if (!symbol || !sample || !Number.isFinite(sample.ts)) {
      // graceful: 잘못된 입력은 조용히 무시.
      return;
    }

    const buffer = this.buffers.get(symbol) ?? [];
    const committed = this.lastCommittedTs.get(symbol);

    if (committed !== undefined && sample.ts - committed < this.sampleIntervalMs) {
      // 샘플링 간격 이내 → 맨 뒤 교체 (확정 ts는 유지).
      if (buffer.length > 0) {
        buffer[buffer.length - 1] = sample;
      } else {
        // 정상 경로에서는 도달 불가 (clear가 buffers·lastCommittedTs 둘 다 삭제).
        // 외부에서 buffer를 직접 조작한 비정상 상태만 여기 들어옴 → 관측용 경고 + 복구.
        console.warn(
          `[RollingWindow] 비정상 상태 감지 (symbol=${symbol}): committed 있는데 buffer 비어있음 — 복구 push`,
        );
        buffer.push(sample);
        this.lastCommittedTs.set(symbol, sample.ts);
      }
    } else {
      buffer.push(sample);
      this.lastCommittedTs.set(symbol, sample.ts);
      if (buffer.length > this.maxSize) {
        buffer.shift();
      }
    }

    this.buffers.set(symbol, buffer);
  }

  /**
   * `stepsAgo` 스텝 전 sample을 반환.
   * - 0: 가장 최신 sample
   * - 1: 직전 sample
   * - N: N 스텝 전 sample
   * 큐가 부족하면 null.
   */
  getAt(symbol: string, stepsAgo: number): T | null {
    if (!Number.isFinite(stepsAgo) || stepsAgo < 0) return null;

    const buffer = this.buffers.get(symbol);
    if (!buffer || buffer.length === 0) return null;

    const idx = buffer.length - 1 - Math.floor(stepsAgo);
    if (idx < 0) return null;

    return buffer[idx] ?? null;
  }

  /** 심볼의 현재 저장된 sample 수 (디버깅/모니터링용). */
  size(symbol: string): number {
    return this.buffers.get(symbol)?.length ?? 0;
  }

  /** 심볼의 최근 n개 sample을 배열로 반환 (오래된 → 최신 순). */
  getRecent(symbol: string, n: number): T[] {
    if (!Number.isFinite(n) || n <= 0) return [];

    const buffer = this.buffers.get(symbol);
    if (!buffer || buffer.length === 0) return [];

    return buffer.slice(Math.max(0, buffer.length - Math.floor(n)));
  }

  /**
   * 전체 심볼 수 (메모리 사용량 모니터링용).
   * 30분 smoke 중 로그에 찍어 메모리 증가 추세 관찰.
   */
  symbolCount(): number {
    return this.buffers.size;
  }

  /** 특정 심볼 또는 (인자 생략 시) 전체 큐 초기화. */
  clear(symbol?: string): void {
    if (symbol) {
      this.buffers.delete(symbol);
      this.lastCommittedTs.delete(symbol);
    } else {
      this.buffers.clear();
      this.lastCommittedTs.clear();
    }
  }
}
