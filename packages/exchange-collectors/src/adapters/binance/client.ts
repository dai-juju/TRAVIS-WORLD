// ============================================================
// Binance REST 공통 HTTP 클라이언트 (M1.3 Step 3a, 2026-04-19)
//
// 역할:
//  - fetch wrapper (spot/usdm/coinm 3마켓이 공유)
//  - 429/418/5xx 자동 재시도 (exponential backoff, max 3회)
//  - Retry-After 헤더 존중
//  - X-MBX-USED-WEIGHT-1M 감지 시 경계 근접 경고
//  - per-symbol 순회 헬퍼 (throttle 50ms, batchPerSymbol)
//  - 모든 결과를 FetchResult<T>로 감싸 반환 (throw 금지)
//
// Adapter 파일들은 URL + 응답 파싱에만 집중하고, 공통 에러·재시도·
// rate limit은 전부 이 파일에서 처리.
//
// M1.9 Step 1 (2026-06-02): apps/worker → packages/exchange-collectors 이동 (로직 변경 0).
//   ⚠️ rate-limit module state (lastSpotObservation 등) 는 여전히 module 싱글톤 —
//      Binance 전용. 다거래소 진입 시 Map<exchange:group, Obs> 일반화 필요 (M2, [8-27]).
// ============================================================

import type { FetchResult } from "../IExchangeAdapter";

// ─── 상수 ──────────────────────────────────────────

/** 기본 재시도 횟수 */
const DEFAULT_MAX_RETRIES = 3;

/** per-symbol 순회 시 각 요청 간 sleep (ms) — Binance rate limit 보호. */
const DEFAULT_PER_SYMBOL_THROTTLE_MS = 50;

/**
 * Binance spot은 1200 weight/min, futures(fapi/dapi)는 2400 weight/min.
 * 80% 도달 시 경고 로그. 실제 ban은 100% 초과 시 발생.
 * (W-5 code-reviewer 반영: base URL에 따라 다른 한도 적용)
 */
const WEIGHT_WARNING_THRESHOLD = 0.8;

/** M1.8 §8.2a-2 D17 — 90% 도달 시 batchPerSymbol 자동 throttle 2배 (60초 sticky). */
const WEIGHT_CRITICAL_THRESHOLD = 0.9;
const WEIGHT_CRITICAL_STICKY_MS = 60_000;

const SPOT_WEIGHT_LIMIT_PER_MIN = 1200;
const FUTURES_WEIGHT_LIMIT_PER_MIN = 2400;

/** per-symbol 배치 진행률 로그 간격 (W-4 code-reviewer 반영). */
const BATCH_PROGRESS_INTERVAL = 50;

// ─── Rate-limit module state (M1.8 §8.2a-2 D17, 2026-05-26) ─────
// perSymbolTask 6 fetcher 직선 확장 후 IP weight 누적 가시성 확보 + 90% 도달 시 자동 throttle.
// Full dispatcher (queue + priority + state machine) 는 deferred [8-10] M2+ 분리.

interface RateLimitObservation {
  /** 마지막 헤더 capture 시점 (epoch ms) */
  observedAt: number;
  /** 누적 weight 값 (1m window) */
  usedWeight: number;
  /** 사용률 (used / limit, 0~1+) */
  ratio: number;
  /** base URL group ("spot" or "futures") */
  group: "spot" | "futures";
}

let lastSpotObservation: RateLimitObservation | null = null;
let lastFuturesObservation: RateLimitObservation | null = null;

/** 90% 도달 직후 sticky throttle 종료 시점 (epoch ms). 0 이면 정상. */
let criticalUntilAt = 0;

/**
 * 현재 rate-limit 상태 export (모니터링용 / 향후 dispatcher 의존).
 * 마지막 capture 결과 + critical sticky 종료 시점 반환.
 */
export function getRateLimitState(): {
  spot: RateLimitObservation | null;
  futures: RateLimitObservation | null;
  isCritical: boolean;
  criticalUntilAt: number;
} {
  return {
    spot: lastSpotObservation,
    futures: lastFuturesObservation,
    isCritical: Date.now() < criticalUntilAt,
    criticalUntilAt,
  };
}

// ─── 타입 ──────────────────────────────────────────

export interface BinanceRequestOptions {
  /** 거래소 기본 URL (예: "https://api.binance.com") — adapter가 지정 */
  baseUrl: string;
  /** 엔드포인트 path (예: "/api/v3/ticker/24hr") */
  path: string;
  /** 쿼리 파라미터 (object → URLSearchParams) */
  query?: Record<string, string | number | undefined>;
  /** 취소용 signal (타임아웃 구현 시 활용) */
  signal?: AbortSignal;
  /** 재시도 횟수. 기본 DEFAULT_MAX_RETRIES */
  maxRetries?: number;
}

export interface BatchPerSymbolResult<T> {
  /** 성공 결과 배열 */
  success: T[];
  /** 실패 심볼 + 에러 메시지 */
  failed: Array<{ symbol: string; error: string }>;
}

// ─── 공개 함수 ─────────────────────────────────────

/**
 * Binance REST API 호출. 재시도·rate limit·에러를 모두 처리한 후 JSON 반환.
 *
 * 중요: 호출자는 반환된 FetchResult의 `success` 필드를 반드시 체크할 것.
 * graceful 처리가 목적이므로 throw하지 않는다.
 */
export async function binanceFetch<T>(
  opts: BinanceRequestOptions,
): Promise<FetchResult<T>> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const url = buildUrl(opts.baseUrl, opts.path, opts.query);

  let lastError = "unknown";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal: opts.signal });

      checkRateLimitHeaders(res.headers, opts.path, opts.baseUrl);

      // 429 (rate limit) / 418 (ip ban) — Retry-After 존중 후 재시도
      if (res.status === 429 || res.status === 418) {
        const retryAfterSec = parseRetryAfter(res.headers);
        lastError = `Binance ${res.status} (rate limit) — Retry-After ${retryAfterSec}s`;
        if (attempt < maxRetries) {
          console.warn(`[binanceFetch] ${lastError}, waiting before retry`);
          await sleep(retryAfterSec * 1000);
          continue;
        }
        return { success: false, error: lastError };
      }

      // 5xx 서버 에러 — exponential backoff 재시도
      if (res.status >= 500 && res.status < 600) {
        lastError = `Binance ${res.status} server error`;
        if (attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        return { success: false, error: lastError };
      }

      // 4xx 클라이언트 에러 — 재시도 금지, 즉시 반환
      if (res.status >= 400) {
        const body = await safeReadText(res);
        return {
          success: false,
          error: `Binance ${res.status}: ${body.slice(0, 200)}`,
        };
      }

      // 2xx 정상 — JSON 파싱
      let data: T;
      try {
        data = (await res.json()) as T;
      } catch (e) {
        return {
          success: false,
          error: `JSON parse failed: ${errorMessage(e)}`,
        };
      }
      // ★ Binance 가 2xx 로 에러 envelope {code, msg} 를 반환하는 경우 방어 (M1.8.5 Step 4 hotfix).
      //   특히 -1003/-1015 rate limit — /futures/data/* 류가 IP quota 초과 시 429/418 대신
      //   200 + {"code":-1003,"msg":"Too many requests"} 로 오는 사례. 미감지 시 호출자가
      //   배열 가정 .map() 호출 → crash. 우리 read-only 엔드포인트의 정상 응답엔 top-level
      //   {code:number, msg:string} 가 없어 오탐 0 (success 응답은 array 또는 code/msg 없는 object).
      if (isBinanceErrorEnvelope(data)) {
        lastError = `Binance ${data.code}: ${data.msg}`;
        // -1003 (too many requests) / -1015 (too many orders) → rate limit, backoff 재시도.
        if ((data.code === -1003 || data.code === -1015) && attempt < maxRetries) {
          console.warn(`[binanceFetch] ${lastError} (2xx rate-limit envelope) at ${opts.path} — backoff 재시도`);
          await sleep(backoffMs(attempt));
          continue;
        }
        return { success: false, error: lastError };
      }
      return { success: true, data };
    } catch (e) {
      // fetch 자체 throw (네트워크 장애·DNS 등) — 재시도
      lastError = `network: ${errorMessage(e)}`;
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { success: false, error: lastError };
    }
  }
  return { success: false, error: lastError };
}

/**
 * per-symbol 엔드포인트(OI, topLongShortRatio, takerLongShortRatio 등)를
 * 전 심볼 순회하며 호출하는 헬퍼. 각 요청 사이 throttleMs만큼 sleep 삽입
 * → Binance rate limit 내 안전 유지.
 *
 * 실패한 심볼은 failed 배열에 모아 반환 (crash 금지). 호출자는 성공만
 * 배치 upsert. Step 2의 mixed-batch hazard 회피를 위해 도메인별로
 * 별도 호출 배치 유지할 것.
 */
export async function batchPerSymbol<T>(
  symbols: string[],
  fetcher: (symbol: string) => Promise<FetchResult<T>>,
  throttleMs: number = DEFAULT_PER_SYMBOL_THROTTLE_MS,
): Promise<BatchPerSymbolResult<T>> {
  const success: T[] = [];
  const failed: Array<{ symbol: string; error: string }> = [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i] as string;
    const res = await fetcher(symbol);
    if (res.success) {
      success.push(res.data);
    } else {
      failed.push({ symbol, error: res.error });
    }
    // M1.8 §8.2a-2 D17 — critical sticky throttle 활성화 시 2배 throttle.
    // 90%+ 도달 직후 60초 동안 모든 batchPerSymbol 호출이 자동으로 sleep 2배.
    // 정상 흐름 복귀 시 자연 해제 (Date.now() >= criticalUntilAt).
    const effectiveThrottle =
      Date.now() < criticalUntilAt ? throttleMs * 2 : throttleMs;
    if (effectiveThrottle > 0) {
      await sleep(effectiveThrottle);
    }
    // 긴 배치(수백 심볼) 진행률 가시성 (W-4 code-reviewer 반영).
    if (
      i > 0 &&
      (i + 1) % BATCH_PROGRESS_INTERVAL === 0 &&
      symbols.length > BATCH_PROGRESS_INTERVAL
    ) {
      console.log(
        `  [batchPerSymbol] ${i + 1}/${symbols.length} (ok=${success.length}, fail=${failed.length})`,
      );
    }
  }

  return { success, failed };
}

// ─── 내부 유틸 ────────────────────────────────────

function buildUrl(
  base: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const url = new URL(path, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/**
 * Retry-After 헤더는 "초 단위 정수" 또는 "HTTP-date".
 * 간단히 정수만 처리하되 실패 시 1초 기본값.
 */
function parseRetryAfter(headers: Headers): number {
  const raw = headers.get("retry-after");
  if (!raw) return 1;
  const sec = parseInt(raw, 10);
  return Number.isFinite(sec) && sec > 0 ? sec : 1;
}

/**
 * Binance rate limit 헤더 감지.
 * X-MBX-USED-WEIGHT-1M이 80% 이상이면 경고 로그만 — throttle은 호출자가
 * batchPerSymbol로 이미 적용 중이므로 여기선 가시성만 제공.
 *
 * base URL에 따라 한도가 다름:
 *   - api.binance.com (spot): 1200/min
 *   - fapi/dapi.binance.com (futures): 2400/min
 */
function checkRateLimitHeaders(headers: Headers, path: string, baseUrl: string): void {
  const usedWeight = headers.get("x-mbx-used-weight-1m");
  if (!usedWeight) return;
  const used = parseInt(usedWeight, 10);
  if (!Number.isFinite(used)) return;
  const limit = weightLimitFor(baseUrl);
  const ratio = used / limit;

  // M1.8 §8.2a-2 D17 — module state 갱신 (모니터링 + sticky throttle 의존성).
  const isFutures =
    baseUrl.includes("fapi.binance.com") || baseUrl.includes("dapi.binance.com");
  const observation: RateLimitObservation = {
    observedAt: Date.now(),
    usedWeight: used,
    ratio,
    group: isFutures ? "futures" : "spot",
  };
  if (isFutures) {
    lastFuturesObservation = observation;
  } else {
    lastSpotObservation = observation;
  }

  if (ratio >= WEIGHT_CRITICAL_THRESHOLD) {
    // 90%+ 도달 — 60초 sticky throttle 활성화.
    criticalUntilAt = Date.now() + WEIGHT_CRITICAL_STICKY_MS;
    console.warn(
      `[binanceFetch] ⚠️ CRITICAL ${Math.round(ratio * 100)}% (${used}/${limit}) at ${path} — sticky throttle 60s 활성화`,
    );
  } else if (ratio >= WEIGHT_WARNING_THRESHOLD) {
    console.warn(
      `[binanceFetch] rate limit ${Math.round(ratio * 100)}% (${used}/${limit}) at ${path}`,
    );
  }
}

function weightLimitFor(baseUrl: string): number {
  if (baseUrl.includes("fapi.binance.com") || baseUrl.includes("dapi.binance.com")) {
    return FUTURES_WEIGHT_LIMIT_PER_MIN;
  }
  return SPOT_WEIGHT_LIMIT_PER_MIN;
}

/** exponential backoff: attempt 0→1s, 1→2s, 2→4s. */
function backoffMs(attempt: number): number {
  return 1000 * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Binance 에러 envelope `{code:number, msg:string}` 판별 (M1.8.5 Step 4 hotfix).
 * 2xx 응답이 배열/정상 객체가 아니라 에러 envelope 인 경우 감지 — 호출자 .map() crash 방어.
 * 우리가 쓰는 read-only 엔드포인트의 정상 응답은 array 또는 code/msg 없는 object 라 오탐 없음.
 */
function isBinanceErrorEnvelope(data: unknown): data is { code: number; msg: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as { code?: unknown }).code === "number" &&
    typeof (data as { msg?: unknown }).msg === "string"
  );
}
