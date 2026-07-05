"use client";
/**
 * TableCard 행 컴포넌트 2종 — [10-76] 분할 (2026-07-05, TableCard.tsx 에서 추출).
 *
 * 같은 행을 두 렌더 경로로 그리는 쌍둥이 — 색/불투명도 로직은 cellStyle 공유(drift 방지):
 *   - TableCardRow: <tr> 경로 (소규모 리스트, 순위 FLIP 슬라이드 대상).
 *   - TableRowDiv: div 경로 (가상 스크롤 — <tr> transform 은 border-collapse 를 깨므로 grid div).
 */

import { memo } from "react";
import { cellStyle, labelText } from "@/lib/cards/tableCardFormat";
import type { TableDescriptor, TableRow } from "@/lib/cards/tableDescriptors";
import { useRowFlash } from "@/lib/hooks/useRowFlash";

/**
 * 행 1개 (table 경로, 소규모 리스트). 심볼(라벨) + descriptor 컬럼들.
 * memo: flush 시 변경된 row 만 새 참조 → 안 바뀐 행 재렌더 skip(저사양 절감).
 * flashValue(flashColumn 또는 sort 값) 변동 시 행 배경 flash.
 * (테스트 위해 export — 데이터 훅 없이 descriptor 렌더만 검증.)
 */
export const TableCardRow = memo(function TableCardRow({
  row,
  descriptor,
  flipKey,
  flashValue,
}: {
  row: TableRow;
  descriptor: TableDescriptor;
  flipKey: string;
  flashValue: number | null;
}) {
  const rowRef = useRowFlash<HTMLTableRowElement>(flashValue);
  return (
    <tr
      ref={rowRef}
      data-flip-key={flipKey}
      className="border-b border-[color:var(--ink-5)]"
    >
      <td className="py-1 text-foreground font-semibold">
        {labelText(row, descriptor)}
      </td>
      {descriptor.columns.map((col) => (
        <td
          key={col.key}
          className="py-1 text-right tabular-nums"
          style={cellStyle(col, row)}
        >
          {col.value(row)}
        </td>
      ))}
    </tr>
  );
});

/**
 * 행 1개 (가상 스크롤 경로, 대규모 리스트). div + absolute translateY(가상화가 위치 잡음).
 * <tr>(border-collapse) 대신 grid div — 컬럼 폭은 gridTemplate(descriptor.width).
 * cellStyle 로 table 경로와 색/불투명도 로직 공유(두 경로 drift 방지).
 */
export const TableRowDiv = memo(function TableRowDiv({
  row,
  descriptor,
  flashValue,
  top,
  height,
  gridTemplate,
}: {
  row: TableRow;
  descriptor: TableDescriptor;
  flashValue: number | null;
  top: number;
  height: number;
  gridTemplate: string;
}) {
  const rowRef = useRowFlash<HTMLDivElement>(flashValue);
  return (
    <div
      ref={rowRef}
      className="absolute left-0 grid w-full items-center border-b border-[color:var(--ink-5)]"
      style={{
        transform: `translateY(${top}px)`,
        height,
        gridTemplateColumns: gridTemplate,
      }}
    >
      <span className="truncate text-foreground font-semibold">
        {labelText(row, descriptor)}
      </span>
      {descriptor.columns.map((col) => (
        <span
          key={col.key}
          className="text-right tabular-nums"
          style={cellStyle(col, row)}
        >
          {col.value(row)}
        </span>
      ))}
    </div>
  );
});
