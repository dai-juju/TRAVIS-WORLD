// apps/web/lib/cards/chart/plugins.ts
//
// uPlot 플러그인 팩토리 (midline / 툴팁) — chartFormat 분할 (M3-step3b Step 0,
// 2026-07-20, [10-98] 회수). 순수 이동: 로직 원본 그대로. 인스턴스를 만들지 않는
// 순수 팩토리 — DOM 접근은 uPlot 훅 콜백 안에서만 발생.

import type { ChartDescriptor } from "../chartDescriptors";
import { formatChartTime } from "./time";

/**
 * midline(1.0 균형선 / 0 contango 경계) 그리기 훅 — uPlot plugin 형태의 순수 팩토리.
 * 시맨틱(값)은 descriptor 소유, 픽셀(색·점선)은 여기(form) 소유.
 */
export function midlinePlugin(value: number, stroke: string) {
  return {
    hooks: {
      draw: (u: {
        ctx: CanvasRenderingContext2D;
        valToPos: (v: number, scale: string, canvas?: boolean) => number;
        bbox: { left: number; top: number; width: number; height: number };
        scales: Record<string, { min?: number | null; max?: number | null }>;
      }) => {
        try {
          const y = u.scales.y;
          // midline 이 현재 y 범위 밖이면 그리지 않음 (화면 왜곡 방지).
          if (y?.min == null || y?.max == null) return;
          if (value < y.min || value > y.max) return;
          const px = u.valToPos(value, "y", true);
          const { ctx, bbox } = u;
          ctx.save();
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(bbox.left, px);
          ctx.lineTo(bbox.left + bbox.width, px);
          ctx.stroke();
          ctx.restore();
        } catch {
          // 기준선은 장식 — 실패해도 차트 본체는 살린다 (graceful).
        }
      },
    },
  };
}

/**
 * 플로팅 툴팁 플러그인 — 호버 시 커서 옆에 시간+심볼별 값 박스 (사용자 UIUX 결정
 * 2026-07-09, Binance 식). uPlot 소유 DOM(u.over 자식)이라 React 밖 명령형 격리 —
 * CSS 는 var() 참조(테마 토글 즉응). 값 포맷 = descriptor.formatValue(시맨틱 파생).
 * 저사양: setCursor 마다 textContent+transform 만 갱신(레이아웃 스래싱 없음).
 */
export function tooltipPlugin(
  descriptor: ChartDescriptor,
  labels: string[],
) {
  let tip: HTMLDivElement | null = null;
  return {
    hooks: {
      init: (u: { over: HTMLElement }) => {
        try {
          tip = document.createElement("div");
          tip.style.cssText =
            "position:absolute;top:0;left:0;pointer-events:none;display:none;" +
            "z-index:20;padding:4px 7px;white-space:nowrap;" +
            "font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.5;" +
            "background:var(--paper);color:var(--ink);" +
            "border:1px solid var(--ink-5);border-radius:4px;";
          u.over.appendChild(tip);
        } catch {
          tip = null; // 툴팁 생성 실패 = 차트만 유지 (crash 금지)
        }
      },
      setCursor: (u: {
        over: HTMLElement;
        cursor: { idx?: number | null; left?: number; top?: number };
        data: ArrayLike<ArrayLike<number | null>>;
      }) => {
        if (!tip) return;
        try {
          const idx = u.cursor.idx;
          const left = u.cursor.left ?? -1;
          const top = u.cursor.top ?? -1;
          if (idx == null || left < 0) {
            tip.style.display = "none";
            return;
          }
          const ts = u.data[0]?.[idx];
          // [10-99] 툴팁 헤더 = hover 당 1회 표시라 "UTC" 접미 부착 지점으로 적합.
          const timeLabel =
            typeof ts === "number" ? `${formatChartTime(ts * 1000)} UTC` : "—";
          const lines = [timeLabel];
          for (let s = 0; s < labels.length; s++) {
            const v = u.data[s + 1]?.[idx];
            const valueText = descriptor.formatValue(
              typeof v === "number" ? v : null,
            );
            // 단일 심볼은 값만, 오버레이는 심볼 라벨 병기 (범례와 1:1 순서).
            lines.push(
              labels.length > 1 ? `${labels[s]}  ${valueText}` : valueText,
            );
          }
          tip.textContent = "";
          for (const line of lines) {
            const row = document.createElement("div");
            row.textContent = line;
            tip.appendChild(row);
          }
          tip.style.display = "block";
          // 커서 우측 12px — 우측 경계에 닿으면 좌측으로 뒤집기 (라인 가림 최소화).
          const overW = u.over.clientWidth;
          const tipW = tip.offsetWidth;
          const flip = left + 12 + tipW > overW;
          const x = flip ? Math.max(0, left - 12 - tipW) : left + 12;
          const y = Math.max(0, Math.min(top - 8, u.over.clientHeight - tip.offsetHeight));
          tip.style.transform = `translate(${x}px, ${y}px)`;
        } catch {
          tip.style.display = "none"; // 어떤 실패도 차트를 못 건드림
        }
      },
      destroy: () => {
        try {
          tip?.remove();
        } catch {
          // ignore
        }
        tip = null;
      },
    },
  };
}
