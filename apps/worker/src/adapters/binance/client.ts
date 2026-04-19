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
// ============================================================

import type { FetchResult } from "../IExchangeAdapter.js";

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

const SPOT_WEIGHT_LIMIT_PER_MIN = 1200;
const FUTURES_WEIGHT_LIMIT_PER_MIN = 2400;

/** per-symbol 배치 진행률 로그 간격 (W-4 code-reviewer 반영). */
const BATCH_PROGRESS_INTERVAL = 50;

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
      try {
        const data = (await res.json()) as T;
        return { success: true, data };
      } catch (e) {
        return {
          success: false,
          error: `JSON parse failed: ${errorMessage(e)}`,
        };
      }
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
    if (throttleMs > 0) {
      await sleep(throttleMs);
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
  if (ratio >= WEIGHT_WARNING_THRESHOLD) {
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
