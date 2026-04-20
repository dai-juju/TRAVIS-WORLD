/**
 * AiCardConfig — AI ↔ 코드 contract의 절반.
 *
 * M1.5에서 Claude가 tool_use로 이 JSON을 출력하면,
 * CardContainer(M1.4 Step 2)가 safeParse로 검증 후 렌더.
 * 검증 실패 시 crash 금지 — 호출처가 safeParse().success로 gate.
 *
 * 설계 원칙:
 * 1. strict() — unknown key 차단 (오타/환각 조기 검출)
 * 2. .describe() — M1.5에서 JSON Schema 변환 시 AI용 필드 설명
 * 3. 기존 registries 재사용 (CardSize/UpdateMode/MarketType)
 */

import { z } from "zod";
import {
  CardSizeSchema,
  UpdateModeSchema,
} from "../registries/componentRegistry";
import { MarketTypeSchema } from "../registries/exchangeRegistry";
import { FilterClauseSchema } from "./filterClause";

// ─── CardAction ─────────────────────────────────────

/**
 * 카드 인터랙션 1건. Step 6의 actionDispatcher가 소비.
 * 현재 "spawn"만 지원. "drill-down" / "linked-selection"은 M2+.
 */
export const CardActionSchema = z
  .object({
    trigger: z
      .enum(["row-click", "header-click"])
      .describe("트리거 이벤트 — Step 6에서 확장 가능"),
    type: z.literal("spawn").describe("액션 타입 — 현재 spawn만 지원"),
    targetComponentId: z
      .string()
      .min(1)
      .describe("생성할 타겟 컴포넌트의 componentRegistry id"),
    parameterMapping: z
      .record(z.string(), z.string())
      .optional()
      .describe("소스 필드 → 타겟 prop 맵 (예: { symbol: 'symbol' })"),
  })
  .strict();

export type CardAction = z.infer<typeof CardActionSchema>;

// ─── CardDataBinding ────────────────────────────────

/** 카드가 바인딩할 데이터 원본 및 질의 파라미터. */
export const CardDataBindingSchema = z
  .object({
    datasource: z
      .string()
      .min(1)
      .describe(
        "데이터 원본 id — 예: now_spot_ticker / now_futures_ticker / now_futures_indicator",
      ),
    exchange: z.string().min(1).optional().describe("거래소 id (예: binance)"),
    marketType: MarketTypeSchema.optional().describe("마켓 타입"),
    symbol: z
      .string()
      .min(1)
      .optional()
      .describe("단일 row 바인딩용 심볼 (예: BTCUSDT)"),
    filters: z
      .array(FilterClauseSchema)
      .optional()
      .describe("CoinListCard용 필터 배열 — AND 결합"),
    sort: z
      .object({
        field: z.string().min(1),
        direction: z.enum(["asc", "desc"]),
      })
      .strict()
      .optional()
      .describe("정렬 기준 — 목록형 카드 전용"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe("결과 상한 (1~500)"),
    interval: z
      .string()
      .min(1)
      .optional()
      .describe("KlineChart 타임프레임 (예: 1m/5m/15m/1h/4h/1d)"),
  })
  .strict();

export type CardDataBinding = z.infer<typeof CardDataBindingSchema>;

// ─── AiCardConfig ───────────────────────────────────

/**
 * AI가 출력하는 단일 카드 설정.
 * CardContainer가 이 객체를 safeParse해서 updateMode별로 분기 렌더.
 */
export const AiCardConfigSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .describe("카드 고유 id — uuid 또는 슬러그 (예: ticker-btc-1)"),
    componentId: z
      .string()
      .min(1)
      .describe("componentRegistry에 등록된 컴포넌트 id"),
    size: CardSizeSchema.describe("카드 사이즈"),
    updateMode: UpdateModeSchema.describe("갱신 모드 — value 또는 content"),
    data: CardDataBindingSchema.describe("데이터 바인딩 설정"),
    actions: z
      .array(CardActionSchema)
      .optional()
      .describe("카드 인터랙션 목록 (선택)"),
    position: z
      .object({ x: z.number(), y: z.number() })
      .strict()
      .optional()
      .describe("초기 배치 좌표 — 미지정 시 CardContainer가 자동 배치"),
  })
  .strict();

export type AiCardConfig = z.infer<typeof AiCardConfigSchema>;
