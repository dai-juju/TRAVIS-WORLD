// apps/web/lib/cards/chart/theme.ts
//
// 테마/색 슬롯 — chartFormat 분할 (M3-step3b Step 0, 2026-07-20, [10-98] 회수).
// 순수 이동: 로직·값 원본 그대로.

/** 캔버스용으로 해석된 테마 토큰 (CSS var 는 canvas 불가 — useUplot 이 해석해 주입). */
export interface ChartThemeTokens {
  ink: string;
  inkFaint: string; // 축/그리드 (--ink-5 급)
  inkMuted: string; // 축 라벨 (--ink-3 급)
  up: string;
  down: string;
}

/**
 * 다중 심볼 오버레이의 시리즈 색 슬롯 — 순서 = symbols[] 입력 순서(범례와 1:1).
 * ★ 오버레이에서 색은 방향이 아니라 **심볼 식별자** (tone 의 teal/vermilion 방향
 *   의미와 별개 축 — 단일 심볼 방향색 표현은 midline 기준 fill 등 미래 확장,
 *   MVP 는 스트로크 = 슬롯 색). UI-3 2색 예외 원칙 안에서 4슬롯이 실용 상한.
 */
export function seriesStrokes(theme: ChartThemeTokens): string[] {
  return [theme.ink, theme.up, theme.down, theme.inkMuted];
}

/**
 * 위 seriesStrokes 의 CSS 변수 쌍둥이 — DOM 범례용 (캔버스는 해석된 실색, 범례는
 * var() 로 테마 토글 즉응). ★ 순서가 seriesStrokes 와 1:1 이어야 범례↔곡선 색이
 * 일치한다 — 등치는 chartFormat.test 가 박제.
 */
export const SERIES_STROKE_VARS = [
  "var(--ink)",
  "var(--up)",
  "var(--down)",
  "var(--ink-3)",
] as const;

// ── 방향색 (components/다이버징 모드, [10-121] M3-step3b 2026-07-20) ──
//   components 모드의 시리즈 색은 심볼 슬롯이 아니라 **시장 영향 방향**
//   (up=teal 상승압력 / down=vermilion 하락압력 — UI-3 2색 예외의 본래 용도).
//   캔버스(실색)↔범례(CSS var) 쌍둥이는 seriesStrokes↔SERIES_STROKE_VARS 와 동형 —
//   같은 direction 키에서 파생해 어긋날 수 없고, 등치는 chartFormat.test 가 박제.

/** direction → 캔버스 실색 (theme 해석값). */
export function directionStroke(
  theme: ChartThemeTokens,
  direction: "up" | "down",
): string {
  return direction === "up" ? theme.up : theme.down;
}

/** direction → DOM 범례용 CSS var (테마 토글 즉응) — 위 directionStroke 의 쌍둥이. */
export function directionStrokeVar(direction: "up" | "down"): string {
  return direction === "up" ? "var(--up)" : "var(--down)";
}

/**
 * 색 문자열에 알파 적용 — area fill 용. oklch/hex 모두 색공간 함수로 감싼다
 * (canvas 는 `color-mix` 미지원 브라우저가 있어 단순 접근: oklch 는 `/ alpha`
 * 삽입이 안전하지 않아 rgba fallback 대신 **투명도는 8자리 hex 일 때만** 적용,
 * 그 외(oklch 등)는 원색 유지 + 브라우저의 globalAlpha 미사용 — MVP 절제).
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
      .toString(16)
      .padStart(2, "0");
    return `${hex}${a}`;
  }
  if (/^oklch\(/.test(hex) && !hex.includes("/")) {
    // oklch(L C H) → oklch(L C H / a) — CSS Color 4 문법, canvas 지원 브라우저 대상.
    return hex.replace(/\)\s*$/, ` / ${alpha})`);
  }
  return color; // 미지 형식 — 원색 유지 (graceful)
}
