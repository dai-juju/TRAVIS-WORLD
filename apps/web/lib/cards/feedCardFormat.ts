// apps/web/lib/cards/feedCardFormat.ts
//
// FeedCard form-side 픽셀 매핑 (순수 함수 모음) — ff#2 재개 Step 3 (2026-07-05).
//
// 역할 분리 (tableCardFormat 동형):
//   descriptor(feedDescriptors) = 의미 신호(tone 방향 / intensity 0..1 / 표시 문자열)
//   이 파일 = 그 신호를 픽셀(색 변수 / opacity / grid 폭 / 시각 표기)로 번역.
//   색·불투명도 원시 매핑(toneColor/intensityOpacity/OPACITY_FLOOR)은 tableCardFormat 이
//   소유 — 여기서 import 재사용 (공용 모듈 승격은 3번째 소비자 등장 때, YAGNI).

import type { CSSProperties } from "react";
import { intensityOpacity, toneColor } from "@/lib/cards/tableCardFormat";
import type { FeedColumn, FeedDescriptor, FeedRow } from "@/lib/cards/feedDescriptors";

/** 피드 라인 고정 선두 3칸 폭 — 시각 / 배지 / 라벨(심볼). */
const TIME_COL_WIDTH = "4.2rem";
const BADGE_COL_WIDTH = "4.6rem";
// 라벨은 남는 폭 흡수 (긴 심볼 truncate — 행 컴포넌트가 처리).
const LABEL_COL_WIDTH = "minmax(0, 1fr)";

/**
 * 이벤트 시각 → "HH:MM:SS" (24h 로컬). 값은 ISO 문자열(방송 row) 또는 epoch ms 수용.
 * 비정상 값은 "—" (graceful — 피드 한 줄이 카드 전체를 깨지 않게).
 */
export function formatFeedTime(row: FeedRow, timeField: string): string {
  const v = row[timeField];
  const d =
    typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  // en-US + hour12:false — English-only 규율 (테마 C tooltip 로케일 사고 재발 방지).
  return d.toLocaleTimeString("en-US", { hour12: false });
}

/** 피드 라인 grid-template-columns — [시각][배지][라벨][데이터 컬럼들]. */
export function feedGridTemplateColumns(descriptor: FeedDescriptor): string {
  const dataCols = descriptor.columns.map((c) => c.width).join(" ");
  return `${TIME_COL_WIDTH} ${BADGE_COL_WIDTH} ${LABEL_COL_WIDTH} ${dataCols}`;
}

/** 데이터 셀 색/농도 — tone→색, intensity→불투명도 (tableCardFormat 원시 매핑 재사용). */
export function feedCellStyle(col: FeedColumn, row: FeedRow): CSSProperties {
  const style: CSSProperties = {};
  if (col.tone) style.color = toneColor(col.tone(row));
  if (col.intensity) style.opacity = intensityOpacity(col.intensity(row));
  return style;
}

/** 방향 배지 색 — 텍스트 라벨 병기가 원칙이라 색은 보조 신호. */
export function feedBadgeStyle(
  descriptor: FeedDescriptor,
  row: FeedRow,
): CSSProperties {
  return { color: toneColor(descriptor.badge.tone(row)) };
}

/**
 * form 소유 표시 상한 (픽셀 정책 — TableCard VIRTUALIZE_THRESHOLD 동격, nextjs 자문 W1).
 *
 * 버퍼 cap(AI limit = 데이터 의도)과 분리 — AI 가 limit:5000 을 내도 버퍼는 존중하되
 * DOM 은 이 값에서 자른다(tape 는 최상단만 주시 → 오래된 줄 렌더 제외 = UX 손실 0).
 * flush 마다의 재조정(diff) 비용도 이 값으로 상한(저사양 UHD620 예산).
 * ★ 가상화는 의도적 기각: 최상단 prepend tape 와 스크롤 앵커 충돌 + React Compiler
 *   비호환(useVirtualizer) — 단순 slice 가 올바른 해법 (nextjs 자문 S1, 2026-07-05).
 */
export const FEED_DISPLAY_CAP = 150;

/** 표시용 이벤트 절단 — newest-first 이므로 앞쪽 = 최신. 참조 보존(slice)이라 memo 무해. */
export function visibleFeedEvents<T>(events: readonly T[]): readonly T[] {
  return events.length > FEED_DISPLAY_CAP
    ? events.slice(0, FEED_DISPLAY_CAP)
    : events;
}
