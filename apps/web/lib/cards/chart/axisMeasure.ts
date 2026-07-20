// apps/web/lib/cards/chart/axisMeasure.ts
//
// y축 라벨 폭 (동적 산정) — chartFormat 분할 (M3-step3b Step 0, 2026-07-20, [10-98] 회수).
// 순수 이동: 로직 원본 그대로. AXIS_FONT 는 options.ts 렌더와의 커플링 유지를 위해
// export 로 승격 (측정↔렌더 단일 상수 — reviewer W1 계보, 모듈 경계에서도 유지).
//
// ★ 고정 size:64 회귀 금지 ([10-92]④ + 라이브 G2 신규 결함 2026-07-10): 라벨이
//   가용 폭을 넘으면 캔버스 왼쪽 밖으로 잘리는데, 잘리는 첫 글자가 하필 부호라
//   "-0.00500%" 가 "0.00500%" 로 보였다(음수 펀딩을 양수로 오독 = misread 부류).
//   OI 의 ",000,000" 잘림도 같은 뿌리 — 최장 라벨 실측으로 폭을 정한다.

/** 축 라벨 폰트 — buildChartOptions 의 axes[].font 와 동일해야 실측이 유효. */
export const AXIS_FONT = "10px JetBrains Mono, monospace";

/** 라벨 폭 실측용 공유 ctx — 최초 1회 생성, 실패/미지원 환경은 null 고정. */
let axisMeasureCtx: CanvasRenderingContext2D | null | undefined;

/** 한 라벨의 CSS px 폭 — canvas 실측, 불가 환경(jsdom 등)은 mono 10px 근사(6px/자). */
function measureAxisLabel(text: string): number {
  if (axisMeasureCtx === undefined) {
    try {
      axisMeasureCtx = document.createElement("canvas").getContext("2d");
    } catch {
      axisMeasureCtx = null;
    }
  }
  if (axisMeasureCtx) {
    try {
      axisMeasureCtx.font = AXIS_FONT;
      const w = axisMeasureCtx.measureText(text).width;
      if (Number.isFinite(w) && w > 0) return w;
    } catch {
      // 측정 실패 — 아래 근사 폭으로 폴백 (graceful)
    }
  }
  return text.length * 6; // JetBrains Mono 10px advance ≈ 6px
}

/**
 * y축 전체 폭(px) = 최장 라벨 실측 + tick(10)+gap(5)+여유(6). values 미확정(초기
 * 레이아웃 패스)은 64 폴백. 하한 40 — 빈/짧은 라벨에서 축이 소멸하지 않게.
 */
export function yAxisSize(values: readonly string[] | null | undefined): number {
  if (!values || values.length === 0) return 64;
  let maxW = 0;
  for (const v of values) maxW = Math.max(maxW, measureAxisLabel(String(v)));
  return Math.max(Math.ceil(maxW) + 21, 40);
}
