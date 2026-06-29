// apps/web/lib/cards/tableCardFormat.ts
//
// 모양-제네릭 TableCard 의 **form-side 픽셀 매핑** — Composable Stage 1 Step 2 (2026-06-29).
//
// 역할 ("의미는 레시피, 픽셀은 form"):
//   tableDescriptors 의 의미 신호(tone=방향, intensity=크기 0..1)를 실제 픽셀(색·불투명도)
//   로 번역한다. 이 변환·바닥값(0.55)·grid 조립·식별키는 **form 소유** — descriptor 는
//   절대 색/CSS 를 모른다. 미래 Heatmap form 은 같은 (tone,intensity)를 fill 채도로 재해석.
//
// 순수 모듈 (DOM·hook 없음) — 단위 테스트 용이.

import type { CSSProperties } from "react";
import type { MetricTone } from "@/lib/cards/indicatorDescriptors";
import type {
  TableColumn,
  TableDescriptor,
  TableRow,
} from "@/lib/cards/tableDescriptors";

/** 방향 tone → 테마 색 토큰 (UI-3 흑백 + up/down 2색 예외). */
const TONE_COLOR: Record<MetricTone, string> = {
  up: "var(--up)",
  down: "var(--down)",
  neutral: "var(--ink-2)",
};

/**
 * 불투명도 가독성 바닥 — "아주 작은 변화도 읽힌다"는 form 의 픽셀 정책(데이터 무관).
 * 0..1 intensity 를 [FLOOR, 1] 로 매핑 → 변화율이 클수록 진하게.
 */
export const OPACITY_FLOOR = 0.55;

/** tone(미지정 포함) → 색 문자열. */
export function toneColor(tone: MetricTone | undefined): string {
  return TONE_COLOR[tone ?? "neutral"];
}

/**
 * intensity 0..1 → opacity. descriptor 버그(NaN/범위초과)도 graceful 클램프(기본 1.0).
 */
export function intensityOpacity(intensity: number | undefined): number {
  if (intensity === undefined || !Number.isFinite(intensity)) return 1;
  const clamped = Math.min(1, Math.max(0, intensity));
  return OPACITY_FLOOR + clamped * (1 - OPACITY_FLOOR);
}

/**
 * 데이터 셀의 인라인 스타일 — 색(필수) + opacity(intensity 컬럼만).
 * intensity 미지정 컬럼엔 opacity 키 자체를 넣지 않음(불필요 no-op 스타일 제거).
 */
export function cellStyle(col: TableColumn, row: TableRow): CSSProperties {
  const style: CSSProperties = { color: toneColor(col.tone?.(row)) };
  if (col.intensity) {
    style.opacity = intensityOpacity(col.intensity(row));
  }
  return style;
}

/**
 * 복합 재조정 키 — descriptor.rowKeyFields 직렬화 (Map key + FLIP/가상화 안정키).
 * symbol 단독이 아닌 복합키라 혼합 market_type(spot/futures 같은 symbol) 충돌 방지.
 */
export function buildRowKey(row: TableRow, fields: readonly string[]): string {
  return fields.map((f) => String(row[f] ?? "")).join(":");
}

/** 선두 식별/라벨 셀 텍스트 — descriptor.labelColumn 의 값(기본 symbol). */
export function labelText(row: TableRow, descriptor: TableDescriptor): string {
  return String(row[descriptor.labelColumn.key] ?? "");
}

/**
 * 가상 스크롤(grid) 경로의 grid-template-columns 조립.
 * 좌측 라벨 = minmax(0,1fr)(truncate 안전) + 데이터 컬럼 = width(미지정 시 auto).
 * <table> 경로는 이 값을 안 쓰고 브라우저 auto-size 에 맡긴다.
 */
export function gridTemplateColumns(descriptor: TableDescriptor): string {
  const cols = descriptor.columns.map((c) => c.width ?? "auto").join(" ");
  return `minmax(0, 1fr) ${cols}`;
}

/** 정렬/flash 비교용 숫자값 — null/비숫자는 null(방향 무관 바닥 + flash 안 함). */
export function numericField(row: TableRow, field: string): number | null {
  const v = row[field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * 두 행을 한 필드로 정렬 비교 — 숫자/문자열 datatype 합집합 (두 옛 카드 능력 보존).
 *   - 둘 다 숫자: 수치 비교(방향 적용).
 *   - 한쪽만 숫자: 숫자를 위로(방향 무관 — "값 있는 행이 위", 서버 nullsFirst:false 일치).
 *   - 둘 다 비숫자: 문자열 알파벳 비교(예: symbol — CoinListCard 의 localeCompare 보존).
 */
export function compareByField(
  a: TableRow,
  b: TableRow,
  field: string,
  direction: "asc" | "desc",
): number {
  const mul = direction === "asc" ? 1 : -1;
  const av = numericField(a, field);
  const bv = numericField(b, field);
  if (av !== null && bv !== null) return (av - bv) * mul;
  if (av !== null) return -1; // 숫자 위 (방향 무관)
  if (bv !== null) return 1;
  return String(a[field] ?? "").localeCompare(String(b[field] ?? "")) * mul;
}
