// apps/web/lib/cards/useUplot.ts
//
// uPlot 인스턴스 생명주기 훅 (Composable 사이클 2 Step 4, 2026-07-08).
//
// ★ 명령형 라이브러리를 React 에 격리하는 유일한 지점 — descriptor(시맨틱)와
//   chartFormat(순수 변환)에는 절대 인스턴스를 두지 않는다 (Form↔Data 직교:
//   datasource 를 바꿔도 이 파일은 0줄 변경).
//
// ─── React Flow 캔버스 함정 준수 (nextjs-frontend 자문 2026-07-08) ───
//  1. **드래그 중 재생성 금지** — 인스턴스는 ref 에 1회 생성, 데이터는 setData 로만.
//     재생성은 시리즈 개수 변경(uPlot 시리즈는 생성 시 고정) 시에만.
//  2. 리사이즈 = ResizeObserver `contentRect` → setSize (getBoundingClientRect 금지 —
//     React Flow 캔버스 줌 배율이 섞여 오염).
//  3. 전부 try/catch graceful — 차트 실패가 카드/캔버스를 죽이지 않는다.

"use client";

import { useEffect, useRef, type RefObject } from "react";
import uPlot, { type AlignedData, type Options } from "uplot";

import type { ChartThemeTokens } from "./chartFormat";

/**
 * 컨테이너의 computed style 에서 캔버스용 테마 토큰을 해석.
 * canvas 는 `var(--ink)` 를 못 그리므로 마운트 시점에 실색으로 변환한다.
 * ★ 알려진 한계: 세션 중 라이트↔다크 토글 시 기존 차트는 옛 색 유지(재마운트 시 반영)
 *   — MVP 절제, 필요 시 클래스 MutationObserver 로 확장.
 */
export function readChartTheme(el: HTMLElement): ChartThemeTokens {
  const style = getComputedStyle(el);
  const read = (name: string, fallback: string): string => {
    const v = style.getPropertyValue(name).trim();
    return v.length > 0 ? v : fallback;
  };
  return {
    ink: read("--ink", "#0a0a0a"),
    inkFaint: read("--ink-5", "rgba(10,10,10,0.12)"),
    inkMuted: read("--ink-3", "rgba(10,10,10,0.45)"),
    up: read("--up", "teal"),
    down: read("--down", "firebrick"),
  };
}

export interface UseUplotParams {
  /** uPlot 을 마운트할 컨테이너 (차트 전용 div — 카드 본문과 분리). */
  containerRef: RefObject<HTMLDivElement | null>;
  /** 정렬 데이터 — null 이면 인스턴스를 만들지/갱신하지 않음 (로딩/빈 상태). */
  data: AlignedData | null;
  /**
   * 옵션 팩토리 — (해석된 테마, 실측 폭/높이) → uPlot Options.
   * ref-라이브로 읽음(생성 시점에만) — 불안정 참조여도 재생성 안 일으킴.
   */
  makeOptions: (theme: ChartThemeTokens, width: number, height: number) => Options;
  /**
   * 시리즈 구성 키 (예: labels.join(",")) — 변경 시에만 파괴+재생성.
   * ★ 개수가 아닌 **구성** 키인 이유 (reviewer S1): BTC→ETH 처럼 개수가 같은 심볼
   *   스왑에서 uPlot 내부 series label 이 옛 값으로 남는 잠복을 차단 (legend off 라
   *   현재 무해하나 미래 툴팁/legend 활성 시 즉시 버그).
   */
  seriesKey: string;
  /**
   * 픽셀폭 기반 데이터 전처리(다운샘플 등) — **여기(명령형 레이어)서 실측 폭으로 적용**.
   * 렌더 중 ref.current 읽기가 금지(react-hooks/refs)라 form 의 useMemo 에서는 폭을
   * 알 수 없다 — 폭은 DOM 관심사이므로 이 훅이 소유한다. ref-라이브(불안정 참조 무해).
   */
  prepareData?: (data: AlignedData, widthPx: number) => AlignedData;
}

/** uPlot 생명주기: 생성 1회 / setData 갱신 / ResizeObserver setSize / 파괴. */
export function useUplot(params: UseUplotParams): void {
  const { containerRef, data, makeOptions, seriesKey, prepareData } = params;

  const chartRef = useRef<uPlot | null>(null);
  // 옵션 팩토리는 생성 시점에만 읽는다 (ref-라이브 — Feed 훅 (F) 동형).
  const makeOptionsRef = useRef(makeOptions);
  makeOptionsRef.current = makeOptions;
  // 최신 데이터도 ref 로 — 생성 effect(시리즈 수 변경)가 데이터 effect 와 경합 없이 사용.
  const dataRef = useRef<AlignedData | null>(data);
  dataRef.current = data;
  // 생성 함수 공유 — 데이터가 마운트 **이후** 비동기 도착(첫 fetch)해도 생성되도록
  //   데이터 effect 가 이 ref 를 통해 생성을 트리거한다 (마운트 effect 가 채움).
  const createRef = useRef<(() => void) | null>(null);
  const prepareDataRef = useRef(prepareData);
  prepareDataRef.current = prepareData;

  // 생성/파괴 — 마운트 + seriesCount 변경 시에만 (드래그/리렌더 무관, 함정 #1).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // ro 는 create 가 참조하므로 선선언 (할당은 아래 — jsdom/SSR 은 null 유지).
    let ro: ResizeObserver | null = null;

    const create = () => {
      if (chartRef.current || !dataRef.current) return; // 데이터 오기 전엔 생성 보류
      try {
        // 저사양 클램프 — pxRatio 는 옵션이 아닌 정적 프로퍼티 (reviewer W1).
        //   전역 영향(전 차트 픽셀 반감) = UHD620 우선의 명시적 트레이드오프.
        uPlot.pxRatio = 1;
        const theme = readChartTheme(el);
        const width = Math.max(el.clientWidth, 80);
        const height = Math.max(el.clientHeight, 60);
        const opts = makeOptionsRef.current(theme, width, height);
        const prepared =
          prepareDataRef.current?.(dataRef.current, width) ?? dataRef.current;
        chartRef.current = new uPlot(opts, prepared, el);
        // ★ 생성 직후 재-observe (라이브 G2 hotfix 2026-07-09): 생성이 레이아웃
        //   안정 전 크기(568×259 실측 — RF 노드 480 적용 전 순간)에서 일어나면,
        //   observe 시작 시 1회 발화가 이미 소진돼 canvas 가 영영 미교정 상태로
        //   남는다(컨테이너보다 큰 canvas 가 overflow 로 잘려 라인 실종). 관찰을
        //   재시작하면 명세상 보장된 초기 발화가 최신 contentRect 로 setSize 교정.
        //   RO 부재(jsdom/SSR)는 기존 동작 그대로 (생성 크기 유지).
        if (ro) {
          ro.unobserve(el);
          ro.observe(el);
        }
      } catch (err) {
        // 차트 생성 실패 = 카드가 빈 영역으로 남을 뿐 — crash 금지.
        console.warn("[useUplot] 차트 생성 실패 (graceful)", err);
      }
    };
    createRef.current = create;
    create();

    // 리사이즈 — contentRect 만 사용 (함정 #2). SSR/jsdom 은 ResizeObserver 부재 가드.
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        try {
          if (!chartRef.current) {
            create(); // 초기 폭 0(숨김 마운트)이었다가 보이게 된 경우
          } else {
            chartRef.current.setSize({
              width: Math.max(rect.width, 80),
              height: Math.max(rect.height, 60),
            });
          }
        } catch (err) {
          console.warn("[useUplot] setSize 실패 (graceful)", err);
        }
      });
      ro.observe(el);
    }

    return () => {
      ro?.disconnect();
      createRef.current = null;
      try {
        chartRef.current?.destroy();
      } catch {
        // 파괴 실패도 삼킨다 — 언마운트 경로 crash 금지.
      }
      chartRef.current = null;
    };
    // containerRef 는 안정 ref 객체 — seriesKey(시리즈 구성) 만 재생성 트리거.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey]);

  // 데이터 갱신 — setData 만 (재생성 없음). 참조 동일 데이터는 훅 위층(per-series
  //   참조 재사용)이 이미 걸러 새 참조일 때만 도달한다.
  //   첫 데이터가 마운트 이후 도착한 경우(비동기 fetch)는 여기서 생성을 트리거.
  useEffect(() => {
    if (!data) {
      // 데이터가 사라짐(빈 창 전환) — stale 곡선이 "no data" 안내 아래 잔존하지 않게
      //   파괴 (reviewer S2). 다음 데이터 도착 시 재생성.
      if (chartRef.current) {
        try {
          chartRef.current.destroy();
        } catch {
          // 파괴 실패도 삼킨다 (graceful)
        }
        chartRef.current = null;
      }
      return;
    }
    if (!chartRef.current) {
      createRef.current?.(); // 생성 시 dataRef.current(=이번 data)로 초기화됨
      return;
    }
    try {
      const width = Math.max(containerRef.current?.clientWidth ?? 0, 80);
      const prepared = prepareDataRef.current?.(data, width) ?? data;
      chartRef.current.setData(prepared);
    } catch (err) {
      console.warn("[useUplot] setData 실패 (graceful)", err);
    }
    // containerRef 는 안정 ref 객체 — data 만 트리거 (effect 내 ref 읽기는 허용).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}
