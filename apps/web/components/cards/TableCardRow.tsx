"use client";
/**
 * TableCard 행 컴포넌트 2종 — [10-76] 분할 (2026-07-05, TableCard.tsx 에서 추출).
 *
 * 같은 행을 두 렌더 경로로 그리는 쌍둥이 — 색/불투명도 로직은 cellStyle 공유(drift 방지):
 *   - TableCardRow: <tr> 경로 (소규모 리스트, 순위 FLIP 슬라이드 대상).
 *   - TableRowDiv: div 경로 (가상 스크롤 — <tr> transform 은 border-collapse 를 깨므로 grid div).
 *
 * 행 클릭 표면 (M3-step1, 2026-07-16):
 *   onRowClick 이 주입된 카드(=AI 가 row-click spawn 을 사전 선언)만 클릭 가능.
 *   - `nodrag`: React Flow 가 이 요소에서 드래그를 시작하지 않게 함 — 카드 이동은
 *     헤더/여백으로 (본문 클릭 전용·이동은 헤더, 사용자 채택 2026-07-16).
 *   - useClickWithoutDrag: 4px 이동 임계 — 텍스트 선택/손떨림의 오발화 방지.
 *   - hover 어포던스는 커서 + 5% 잉크 오버레이만 (아이콘 없음 — 시각 노이즈 최소,
 *     바이낸스/CoinGlass 의 "리스트 행은 눌러진다" 관행 준용).
 *   - hover 배경은 React className(정적) / flash 는 useRowFlash 의 임의 classList —
 *     서로 다른 채널이라 충돌 없음 (클릭 여부로 className 이 런타임 변동하지 않음).
 */

import { memo } from "react";
import { cellStyle, labelText } from "@/lib/cards/tableCardFormat";
import type { TableDescriptor, TableRow } from "@/lib/cards/tableDescriptors";
import { useRowFlash } from "@/lib/hooks/useRowFlash";
import { useClickWithoutDrag } from "@/lib/interaction/useClickWithoutDrag";

/** 클릭 가능 행에만 붙는 어포던스 클래스 (두 경로 공유 — drift 방지). */
const CLICKABLE_ROW_CLASS =
  "nodrag cursor-pointer transition-colors hover:bg-foreground/5";

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
  onRowClick,
}: {
  row: TableRow;
  descriptor: TableDescriptor;
  flipKey: string;
  flashValue: number | null;
  onRowClick?: (row: TableRow) => void;
}) {
  const rowRef = useRowFlash<HTMLTableRowElement>(flashValue);
  const clickGuard = useClickWithoutDrag(
    onRowClick ? () => onRowClick(row) : undefined,
  );
  return (
    <tr
      ref={rowRef}
      data-flip-key={flipKey}
      className={`border-b border-[color:var(--ink-5)]${
        clickGuard ? ` ${CLICKABLE_ROW_CLASS}` : ""
      }`}
      {...(clickGuard ?? {})}
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
  onRowClick,
}: {
  row: TableRow;
  descriptor: TableDescriptor;
  flashValue: number | null;
  top: number;
  height: number;
  gridTemplate: string;
  onRowClick?: (row: TableRow) => void;
}) {
  const rowRef = useRowFlash<HTMLDivElement>(flashValue);
  const clickGuard = useClickWithoutDrag(
    onRowClick ? () => onRowClick(row) : undefined,
  );
  return (
    <div
      ref={rowRef}
      className={`absolute left-0 grid w-full items-center border-b border-[color:var(--ink-5)]${
        clickGuard ? ` ${CLICKABLE_ROW_CLASS}` : ""
      }`}
      style={{
        transform: `translateY(${top}px)`,
        height,
        gridTemplateColumns: gridTemplate,
      }}
      {...(clickGuard ?? {})}
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
