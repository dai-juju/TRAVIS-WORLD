/**
 * marketUnits.ts — 거래소 metric 표시 단위 정공 헬퍼 (M1.8 §8.5-a 신설, 2026-05-26).
 *
 * 역할:
 *   사용자(트레이더)가 보는 거래소 사이트의 표시 단위/정밀도와 TRAVIS 카드 표시가
 *   정확히 일치하도록 모든 카드가 본 헬퍼를 경유해 raw DB 값을 사용자 친화 문자열로 변환.
 *   CLAUDE.md §데이터 위생 #9 (사이트=DB 일치 원칙) 의 종단 layer.
 *
 * 단위 변환 규칙:
 *   - 가격 (price/mark/index/basis): 거래소 사이트와 동일 정밀도. tickSize 주입 시 정확,
 *     미주입 시 adaptive (< 1 = 6자리 / < 100 = 4자리 / else 2자리 + 천단위 콤마).
 *   - Funding rate: DB raw decimal (0.0001) → 사이트 percent (0.0100%). interval (4h/8h) 라벨 부착.
 *   - Open Interest: USDM = base asset 수량 (BTC), COINM = contract count.
 *   - LSR / Basis rate: decimal → percent 4자리.
 *
 * 적용 위치:
 *   apps/web/components/cards/ 의 모든 카드. raw `toFixed` / `toLocaleString` 직접 호출 금지
 *   (단일 진실 원천 원칙). Sub-substep 8.5-b 의 grep gate 가 검증.
 *
 * 자세한 정의: docs/canonical-metrics.md (M1.8 §8.5-c 신설 예정).
 */

// ─── Helpers ──────────────────────────────────────────

/** tickSize 문자열에서 소수점 자리 수 추출. tickSize="0.00001" → 5. */
function decimalsFromTickSize(tickSize: number): number {
  if (tickSize >= 1) return 0;
  const str = tickSize.toString();
  // exponent 표기 (예: "1e-5") 대응
  if (str.includes("e-")) {
    const exp = str.split("e-")[1];
    return exp ? parseInt(exp, 10) : 0;
  }
  const decimalPart = str.split(".")[1] || "";
  return decimalPart.length;
}

/** null/NaN/Infinity 모두 graceful — em dash 반환. */
function isInvalid(value: number | null | undefined): boolean {
  return value === null || value === undefined || !Number.isFinite(value);
}

// ─── 가격 / range ─────────────────────────────────────

/**
 * 가격 표시 — symbols.tick_size 주입 시 정확한 정밀도 적용 (거래소 사이트 일치),
 * 미주입 시 adaptive fallback (M1.4 TickerCard 패턴 미러링).
 *
 * @example
 *   formatPrice(45123.456, 0.10)   → "45,123.5"
 *   formatPrice(0.07831, 0.00001)  → "0.07831"
 *   formatPrice(0.00012)           → "0.000120"  (adaptive: < 1 = 6자리)
 *   formatPrice(null)              → "—"
 */
export function formatPrice(
  value: number | null | undefined,
  tickSize?: number | null,
): string {
  if (isInvalid(value)) return "—";
  const v = value as number;

  if (tickSize != null && Number.isFinite(tickSize) && tickSize > 0) {
    const decimals = decimalsFromTickSize(tickSize);
    return v.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  // Adaptive fallback (tickSize 미주입 시 — M1.4 TickerCard 패턴)
  if (Math.abs(v) < 1) return v.toFixed(6);
  if (Math.abs(v) < 100) return v.toFixed(4);
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── 변동률 / 비율 ────────────────────────────────────

/**
 * 변동률 표시 — **이미 percent 단위 값** (예: -5.3 → "-5.30%").
 * raw decimal (0.0001) 값은 본 함수 X — `formatFundingRate` 또는 `formatBasisRate` 사용.
 *
 * @example
 *   formatPct(-5.3)   → "-5.30%"
 *   formatPct(0.8, 4) → "+0.8000%"
 *   formatPct(null)   → "—"
 */
export function formatPct(
  value: number | null | undefined,
  decimals: number = 2,
): string {
  if (isInvalid(value)) return "—";
  const v = value as number;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(decimals)}%`;
}

// ─── Funding rate ────────────────────────────────────

/**
 * Funding rate 표시 — DB raw decimal (예: 0.0001) → 사이트 percent (0.01000%).
 * intervalHours 주입 시 "(1h)" / "(4h)" / "(8h)" 라벨 부착 (M1.8 §8.0 자문 D15 정합).
 *
 * 사이트=DB 일치 정합:
 *   Binance USDM 사이트 우상단 funding/Countdown 박스의 표시값과 1:1 일치.
 *   정밀도 = percent 소수 **5자리** (사용자 실측 2026-06-10: 사이트 -0.00403% vs
 *   기존 4자리 표시 -0.0040% 불일치 → 5자리 상향. 코인장 미세 funding 구분 요구).
 *
 * @example
 *   formatFundingRate(0.0001, 8)    → "+0.01000% (8h)"
 *   formatFundingRate(-0.0000403, 4) → "-0.00403% (4h)"
 *   formatFundingRate(0.0001)       → "+0.01000%"  (interval 미주입 — 라벨 생략)
 *   formatFundingRate(null)         → "—"
 */
export function formatFundingRate(
  raw: number | null | undefined,
  intervalHours?: number | null,
): string {
  if (isInvalid(raw)) return "—";
  const percent = (raw as number) * 100;
  const sign = percent >= 0 ? "+" : "";
  const label =
    intervalHours != null && Number.isFinite(intervalHours)
      ? ` (${intervalHours}h)`
      : "";
  return `${sign}${percent.toFixed(5)}%${label}`;
}

// ─── Long/Short ratio ────────────────────────────────

/**
 * Long/Short ratio 표시 — 소수 4자리 (예: 1.1322).
 * Top LSR by Accounts / Positions / Global LSR 모두 동일 패턴.
 *
 * @example
 *   formatLSR(1.1322)  → "1.1322"
 *   formatLSR(0.5266)  → "0.5266"
 *   formatLSR(null)    → "—"
 */
export function formatLSR(ratio: number | null | undefined): string {
  if (isInvalid(ratio)) return "—";
  return (ratio as number).toFixed(4);
}

// ─── Open Interest ───────────────────────────────────

/**
 * Open Interest 표시 — USDM = base asset 수량 / COINM = contract count.
 *
 * @example
 *   formatOI(123.45, "futures_usdm", "BTC")  → "123.45 BTC"
 *   formatOI(1234, "futures_coinm")          → "1,234 contracts"
 *   formatOI(null, "futures_usdm")           → "—"
 */
export function formatOI(
  value: number | null | undefined,
  marketType: "futures_usdm" | "futures_coinm",
  baseAsset?: string | null,
): string {
  if (isInvalid(value)) return "—";
  const v = value as number;
  const formatted = v.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  if (marketType === "futures_usdm") {
    return baseAsset ? `${formatted} ${baseAsset}` : formatted;
  }
  // COINM
  return `${formatted} contracts`;
}

// ─── 일반 거래량 / 수량 ───────────────────────────────

/**
 * 라벨 없는 일반 수량/거래량 표시 — 천단위 콤마 + 적응적 소수.
 * Taker buy/sell volume 처럼 단위 라벨(BTC/contracts)이 붙지 않는 raw 수량용.
 * (formatOI 는 단위 라벨을 붙이므로 taker vol 에는 부적합 — 별도 헬퍼.)
 *
 * @example
 *   formatAmount(119.087)    → "119.09"
 *   formatAmount(68.5)       → "68.50"
 *   formatAmount(1234567)    → "1,234,567"
 *   formatAmount(null)       → "—"
 */
export function formatAmount(value: number | null | undefined): string {
  if (isInvalid(value)) return "—";
  const v = value as number;
  // 큰 정수성 값은 소수 생략, 작은 값은 2자리 — 사이트 표시 관행 미러링.
  const decimals = Math.abs(v) >= 1000 ? 0 : 2;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * USD 금액 compact 표기 — 청산 tape 등 좁은 피드 라인용 (K/M/B 축약).
 * Binance/Coinglass 청산 표시 관행 미러링. [10-72] notional 의 표시 헬퍼.
 *
 * @example
 *   formatUsdCompact(1_234_567)  → "$1.23M"
 *   formatUsdCompact(45_600)     → "$45.6K"
 *   formatUsdCompact(987.65)     → "$987.65"
 *   formatUsdCompact(2_100_000_000) → "$2.10B"
 *   formatUsdCompact(null)       → "—"
 */
export function formatUsdCompact(value: number | null | undefined): string {
  if (isInvalid(value)) return "—";
  const v = value as number;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  // K 구간은 유효숫자 유지 위해 1자리 (예: $45.6K) — 100K 이상은 정수부가 충분해 1자리 유지.
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

/**
 * 이벤트 발생 시각 → "HH:MM:SS" (24h 로컬). ISO 문자열/epoch ms 수용.
 * 청산 등 events 계열의 시각 표시 단일 진실 — Feed(피드 라인)·Table(TIME 컬럼) 공용.
 * en-US + hour12:false — English-only 규율 (테마 C tooltip 로케일 사고 재발 방지).
 *
 * @example
 *   formatEventTime("2026-07-05T12:34:56Z") → "21:34:56" (KST 로컬)
 *   formatEventTime("not-a-date")           → "—"
 */
export function formatEventTime(value: unknown): string {
  const d =
    typeof value === "string" || typeof value === "number"
      ? new Date(value)
      : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour12: false });
}

// ─── Basis / Basis rate ─────────────────────────────

/**
 * Basis 표시 — USD 절대값 (futuresPrice - indexPrice).
 *
 * @example
 *   formatBasis(-35.682)             → "-35.68 USDT"
 *   formatBasis(15.61325, "USDC")    → "+15.61 USDC"
 *   formatBasis(null)                → "—"
 */
export function formatBasis(
  value: number | null | undefined,
  quote: string = "USDT",
): string {
  if (isInvalid(value)) return "—";
  const v = value as number;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)} ${quote}`;
}

/**
 * Basis rate 표시 — raw decimal (예: -0.0006) → percent 4자리.
 *
 * @example
 *   formatBasisRate(-0.0006)  → "-0.0600%"
 *   formatBasisRate(0.0002)   → "+0.0200%"
 *   formatBasisRate(null)     → "—"
 */
export function formatBasisRate(raw: number | null | undefined): string {
  if (isInvalid(raw)) return "—";
  const percent = (raw as number) * 100;
  const sign = percent >= 0 ? "+" : "";
  return `${sign}${percent.toFixed(4)}%`;
}

// ─── Countdown ───────────────────────────────────────

/**
 * 다음 정산까지 남은 시간 — nextFundingTime (epoch ms) 기준.
 * "Xh Ym" 또는 "Ym Zs" 또는 "Zs" 적응적 표시.
 *
 * Binance USDM 사이트 우상단 funding(4h)/Countdown 박스의 카운트다운 패턴 정합.
 *
 * @example
 *   formatCountdown(now + 8045_000)  → "2h 14m"
 *   formatCountdown(now + 120_000)   → "2m 0s"
 *   formatCountdown(now - 5000)      → "now"  (정산 시점 또는 그 이후)
 *   formatCountdown(null)            → "—"
 */
export function formatCountdown(
  nextFundingTime: number | null | undefined,
): string {
  if (isInvalid(nextFundingTime)) return "—";
  const remainingMs = (nextFundingTime as number) - Date.now();
  if (remainingMs <= 0) return "now";
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
