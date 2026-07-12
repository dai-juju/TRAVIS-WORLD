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
  getComponent,
} from "../registries/componentRegistry";
import { getDatasource } from "../registries/datasourceRegistry";
import { MarketTypeSchema } from "../registries/exchangeRegistry";
import { CardStyleSchema } from "./cardStyle";
import { FilterClauseSchema } from "./filterClause";
import {
  RegisteredComponentIdSchema,
  RegisteredDatasourceIdSchema,
} from "./registryRefinements";

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
    // M1.6 Step 4 (2026-04-28, [3-7] 회수): registry-derived refinement —
    //   targetComponentId 는 componentRegistry 에 실제 등록된 id 만 통과.
    targetComponentId: RegisteredComponentIdSchema.describe(
      "생성할 타겟 컴포넌트의 componentRegistry id (등록된 id 만 허용)",
    ),
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
    // M1.6 Step 4 (2026-04-28, [3-7] 회수): registry-derived refinement —
    //   datasourceRegistry 에 실제 등록된 id 만 통과. unknown id 시 에러
    //   메시지에 등록 목록 dump → AI self-correction retry 가 정답 후보 즉시 인지.
    datasource: RegisteredDatasourceIdSchema.describe(
      "데이터 원본 id — 등록된 datasource 만 허용 (예: now_spot_ticker / now_futures_ticker / now_futures_indicator)",
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
      .describe("Filter clauses for list cards — combined with AND."),
    sort: z
      .object({
        field: z.string().min(1),
        direction: z.enum(["asc", "desc"]),
      })
      .strict()
      .optional()
      .describe(
        // M2 [10-33] (2026-06-14): 순위(sort)와 개수(limit)를 직교 분리.
        //   describe 는 다이얼의 기능 사실만 — "어떤 쿼리면 어떻게" 정책 금지.
        "Row ordering for list cards (field + direction). Controls rank only — it does not cap how many rows are shown.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      // M2 [10-33] (2026-06-14): max(500) 제거 — "생략 = 전부" 모델에서 계약
      //   천장은 자의적. 실제 인프라 hard cap 은 fetch 레이어가 책임 (Step 2).
      .optional()
      .describe(
        'Maximum number of rows the card displays. Omit to show every row that matches the filters; set it only when the user explicitly names a count (e.g. "top 10").',
      ),
    interval: z
      .string()
      .min(1)
      .optional()
      .describe("KlineChart 타임프레임 (예: 1m/5m/15m/1h/4h/1d)"),
  })
  .strict();

export type CardDataBinding = z.infer<typeof CardDataBindingSchema>;

// ─── liveTopicSpec selectorKey → 카드 config 필드 매핑 (ff#2 재개 Step 1, 2026-07-05) ───
//
// 경로 A 토픽 조립 재료: datasource 의 selectorKey 가 카드 config 의 어느 필드에서
//   값을 얻는지의 단일 진실. superRefine(아래 2.5)과 프론트 훅(selector 구성)이 공유하는
//   의미 축이다. 새 selectorKey 를 registry 에 도입하면 여기에도 추가해야 하며,
//   누락은 registries.test 불변식("전 datasource selectorKey ⊆ 이 매핑 키")이
//   빌드타임에 시끄럽게 잡는다 — superRefine 이 조용히 검증을 건너뛰는 구멍 방지.
export const SELECTOR_KEY_TO_CONFIG_FIELD = {
  market_type: "marketType",
  symbol: "symbol",
  // exchange 는 현 시점 어떤 liveTopicSpec 도 selectorKey 로 안 씀(거래소 다변화 대비 선행 등록).
  exchange: "exchange",
} as const satisfies Record<string, keyof CardDataBinding>;

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
    // M1.6 Step 4 (2026-04-28, [3-7] 회수): registry-derived refinement —
    //   componentRegistry 에 실제 등록된 id 만 통과. M1.5 Step 3 에서
    //   dummyChatParser 제거 직후 발현된 id drift 4종 (`ticker` / `ticker-card`
    //   / `ticker_card` / `tickerCard`) 의 schema-level 차단선.
    componentId: RegisteredComponentIdSchema.describe(
      "componentRegistry 에 등록된 컴포넌트 id (등록된 id 만 허용)",
    ),
    size: CardSizeSchema.describe("카드 사이즈"),
    updateMode: UpdateModeSchema.describe("갱신 모드 — value 또는 content"),
    data: CardDataBindingSchema.describe("데이터 바인딩 설정"),
    // ─── 신규 (M1.4 Step 3-2) — AI 자유 텍스트 헤더 3필드 ───
    //
    // 사용자 결정 (2026-04-21): 카드 헤더를 "{symbol}·{도메인}" 자동 조합이 아닌
    // AI 자유 텍스트 패턴(kicker + title + subtitle) 으로 채택. UI-3 신문 저널
    // 미학 강화. 모두 optional — 미지정 시 카드별 fallback (예: TickerCard 는
    // data.symbol 을 title 로 사용).
    //
    // M1.5 AI 프롬프트에서 각 필드별 작성 가이드를 강제 — kicker 는 "SPOT · LIVE"
    // 같은 짧은 메타 태그, title 은 신문 기사 제목 톤, subtitle 은 "Binance ·
    // 5-min poll" 같은 데이터 출처 명시.
    kicker: z
      .string()
      .max(30)
      .optional()
      .describe(
        "카드 상단 메타 태그. 짧게 대문자 권장 (예: 'SPOT · LIVE' / 'DERIVATIVES'). 30자 이내.",
      ),
    title: z
      .string()
      .max(80)
      .optional()
      .describe(
        "카드 주 타이틀. 신문 기사 제목 톤 허용 (예: 'Bitcoin, in <em>dollars</em>'). 80자 이내. HTML <em> 허용.",
      ),
    subtitle: z
      .string()
      .max(120)
      .optional()
      .describe(
        "카드 부제 — 데이터 출처/갱신주기 명시 권장 (예: 'Binance · BTC/USDT · realtime'). 120자 이내.",
      ),
    // ─── 표현 스타일 축 (사이클 4a [10-101], 2026-07-12) ───
    //
    // descriptor(시맨틱 레이어)의 스타일은 default 로 강등 — 유저가 명시적으로
    // 스타일을 요구할 때만 AI 가 이 필드로 override. data 가 아닌 top-level =
    // "무엇을 fetch" 와 "어떻게 그리나" 의 직교 유지 (cardStyle.ts 헤더 참조).
    style: CardStyleSchema.optional().describe(
      "표현 스타일 override (선택) — 생략 시 metric 의 도메인 기본 스타일",
    ),
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
  .strict()
  // ─── M1.6 Step 4 cross-field 검증 (2026-04-28, [3-32] 회수) ────────────
  //
  // filters[].field 와 sort.field 가 해당 datasource 의 queryableFields
  // (commonFields 머지된 view) 안에 등록된 이름인지 검증.
  //
  // 사고 사례 (2026-04-25 [3-32]): AI 가 `now_spot_ticker` 의 filter 에
  //   `base_asset` (실제로는 `symbols_meta` 컬럼) 을 emit → schema 통과 →
  //   CoinListCard 가 silent NO MATCH (빈 화면). 사용자 디버깅 불가.
  //
  // 패턴 (zod-schema-architect 자문 2026-04-28, 옵션 a 채택):
  //   datasource id 자체는 RegisteredDatasourceIdSchema 가 검증하므로 여기서는
  //   `if (!ds) return` 가드만 — 중복 메시지 방지 + crash 회피.
  //
  // [3-46] deferred — operator/value type 깊은 검증은 향후 확장.
  .superRefine((cfg, ctx) => {
    // ─── (1) componentId ↔ datasource 결합 검증 (M2 테마 A Step 3, 2026-06-11) ───
    //
    // 배경: 기존 검증은 componentId / datasource 각각의 "존재" 만 봤다 —
    //   `ticker-card + open_interest` 같은 조합은 둘 다 등록 id 라 통과했고,
    //   ticker 카드가 indicator row 에서 last_price 를 읽어 전부 "—" 인
    //   silent 깨진 리스트가 됐다 ([3-32] 와 같은 부류, F3 의 잔재).
    //   Step 0 의 표시 계층 allowlist(coming soon)가 임시로 막던 것을
    //   schema 레벨 구조 검증으로 승격 — Step 5 에서 allowlist 제거의 전제.
    //
    // 하드매핑 아님: 허용 조합은 registry 의 dataShapes **선언에서 파생** —
    //   새 카드는 registerComponent 의 dataShapes 만 갱신하면 자동 반영.
    //   에러 메시지에 허용 datasource 목록 dump → AI self-correction 1회 통과
    //   ([3-7]/[3-32] 확립 패턴).
    const comp = getComponent(cfg.componentId);
    if (comp) {
      // RegisteredComponentIdSchema 가 unknown id 를 이미 잡으므로 !comp 는 통과
      // (중복 메시지 방지 — 기존 `if (!ds) return` 과 동일 패턴).
      const supported = comp.dataShapes.some(
        (s) => s.datasourceId === cfg.data.datasource,
      );
      if (!supported) {
        const allowed = comp.dataShapes.map((s) => s.datasourceId).join(", ");
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data", "datasource"],
          // self-correction 힌트: datasource 교체뿐 아니라 componentId 교체도
          // 정답일 수 있음을 명시 (zod-schema-architect 자문 2026-06-11).
          message:
            `component "${cfg.componentId}" does not support datasource ` +
            `"${cfg.data.datasource}". Allowed datasources for this component: ` +
            `[${allowed}]. Alternatively, choose a component whose dataShapes ` +
            `include "${cfg.data.datasource}".`,
        });
      }

      // ─── (1.5) updateMode ∈ supportedUpdateModes (ff#2 재개 Step 1, 2026-07-05) ───
      //
      // 기존엔 updateMode 가 enum 존재만 검증돼 컴포넌트가 지원 안 하는 모드가
      //   조용히 통과했다(예: ticker-card + content). registry 선언 파생 —
      //   새 컴포넌트는 supportedUpdateModes 만 선언하면 자동 반영.
      if (!comp.supportedUpdateModes.includes(cfg.updateMode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["updateMode"],
          message:
            `component "${cfg.componentId}" supports update modes ` +
            `[${comp.supportedUpdateModes.join(", ")}] — got "${cfg.updateMode}".`,
        });
      }
    }

    // ─── (2) filters/sort field ↔ queryableFields 검증 (M1.6 Step 4) ───
    const ds = getDatasource(cfg.data.datasource);
    if (!ds) return; // RegisteredDatasourceIdSchema 가 이미 issue 등록

    // ─── (2.5) ws_direct 토픽 구독 카드는 **모든 필수 selectorKey** 충족 (일반화, 2026-07-05) ───
    //
    // 옛 판([10-62], 2026-06-26)은 `cfg.data.symbol &&` 게이트로 "단일 row 카드"만
    //   marketType 을 강제 → **symbol 없는 전체 tape 카드**(청산 feed)의 marketType
    //   누락이 통과 → 토픽 null → 영구 빈 피드(feed 훅은 경로 B 폴백 없음 =
    //   ff#1 frozen 사고(54d7b98)의 악화판)가 스키마를 그냥 지나갔다.
    // 일반화: 컴포넌트가 subscribesByTopic(단일 토픽 직접 구독)을 선언하면,
    //   datasource 의 모든 *필수* selectorKey 에 대응하는 카드 필드를 요구.
    //   optionalSelectorKeys 는 자유 — 그게 tape(생략)/심볼별(지정) 분기의 본질.
    //   리스트 카드(table-card 등, 테이블 훅=경로 B)는 미선언(false)으로 자연 면제.
    //   registry 파생(하드코딩 아님) — 미래 ws_direct datasource·컴포넌트에 자동 적용.
    //   selectorKey→필드 매핑 누락은 registries.test 불변식이 빌드타임에 적발.
    // (3)과의 중복 issue 방지 — (2.5)가 이미 요구한 config 필드는 (3)에서 skip
    //   (같은 필드에 issue 2개가 쌓이면 self-correction 피드백이 시끄러워짐).
    const issuedScopeFields = new Set<string>();
    if (comp?.subscribesByTopic && ds.transport === "ws_direct" && ds.liveTopicSpec) {
      for (const key of ds.liveTopicSpec.selectorKeys) {
        const field =
          SELECTOR_KEY_TO_CONFIG_FIELD[
            key as keyof typeof SELECTOR_KEY_TO_CONFIG_FIELD
          ];
        if (!field || cfg.data[field]) continue;
        issuedScopeFields.add(field);
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data", field],
          message:
            key === "market_type"
              ? // self-correction 힌트에 USDM/COINM/spot 예시 명시 (기존 [10-62] 메시지 유지).
                `datasource "${ds.id}" streams live over Path A keyed by market_type — ` +
                `data.marketType is required (e.g. "futures_usdm" for USDT-margined symbols ` +
                `like BTCUSDT, "futures_coinm" for coin-margined like BTCUSD_PERP, "spot" for spot). ` +
                `Without it the live topic cannot be built.`
              : `datasource "${ds.id}" streams live over Path A keyed by ${key} — ` +
                `data.${field} is required. Without it the live topic cannot be built.`,
        });
      }
    }

    const allowedFieldNames = new Set(ds.queryableFields.map((f) => f.name));
    const allowedList = [...allowedFieldNames].join(", ");

    // ─── (3) 단일 대상 소비 카드의 스코프 파생 강제 (사이클 4b Step 5, 2026-07-12 — [10-91]/[10-78] 회수) ───
    //
    // 배경: chart-card(주기 pull)·경로 B indicator 조합은 (2.5)(subscribesByTopic ×
    //   ws_direct 전용) 대상 밖이라 AI 가 marketType/symbol 없이 emit 해도 스키마 통과 →
    //   렌더 가드("missing market scope"/"missing symbol scope")가 유일 방어선이었고,
    //   스키마가 성공 판정이라 self-correction 루프가 못 고쳤다 ([10-91] marketType 누락
    //   풀스캔 9.8s/500 라이브 실증 계보). registry 파생 일반화 (하드코딩 0):
    //   - 발화 조건: comp.acceptsShapes 가 전부 ⊆ {record, series} (단일 대상 소비 형태)
    //     && ds.table 존재 (우리 데이터 레이어 서빙 — kline 은 TradingView 자체 fetch 로
    //     table 부재가 registry 에 선언된 축이라 자연 면제, defaults.ts kline 주석).
    //   - marketType: 스코프 축(공통 queryableField) — 누락 시 PK prefix 단절.
    //   - symbol: record = data.symbol 직접 필수 / series = symbol 또는 filters 의
    //     symbol 절(`=` 문자열 | `in` 비어있지 않은 배열) — ChartCard.resolveChartSymbols
    //     의미 미러 (오버레이 경로 보존; [10-104] 처럼 둘 다 지정은 form 이 union 해석).
    //   set(table)/events(feed) 카드는 조건에서 자연 면제 — 전체 tape/스크리너의
    //   심볼-less 정상 유스케이스 보존.
    const acceptShapes = comp?.acceptsShapes ?? [];
    const isSingleTarget =
      acceptShapes.length > 0 &&
      acceptShapes.every((s) => s === "record" || s === "series");
    if (isSingleTarget && ds.table) {
      if (
        allowedFieldNames.has("market_type") &&
        !cfg.data.marketType &&
        !issuedScopeFields.has("marketType")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data", "marketType"],
          message:
            `datasource "${ds.id}" is scoped by market_type — data.marketType is required ` +
            `(e.g. "futures_usdm" for USDT-margined symbols like BTCUSDT, ` +
            `"futures_coinm" for coin-margined like BTCUSD_PERP, "spot" for spot). ` +
            `Without it the query cannot be scoped to one market.`,
        });
      }
      if (allowedFieldNames.has("symbol") && !issuedScopeFields.has("symbol")) {
        const acceptsSeries = acceptShapes.includes("series");
        const hasSymbolFilter = (cfg.data.filters ?? []).some(
          (f) =>
            f.field === "symbol" &&
            ((f.operator === "=" && typeof f.value === "string") ||
              (f.operator === "in" &&
                Array.isArray(f.value) &&
                f.value.length > 0)),
        );
        if (!cfg.data.symbol && !(acceptsSeries && hasSymbolFilter)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["data", "symbol"],
            message: acceptsSeries
              ? `component "${cfg.componentId}" plots one target per series — set ` +
                `data.symbol (e.g. "BTCUSDT") for a single symbol, or add a filters ` +
                `clause {"field":"symbol","operator":"in","value":["BTCUSDT","ETHUSDT"]} ` +
                `to overlay several symbols on one chart.`
              : `component "${cfg.componentId}" binds one symbol per card — ` +
                `data.symbol is required (e.g. "BTCUSDT").`,
          });
        }
      }
    }

    // filters[].field 검증
    cfg.data.filters?.forEach((f, i) => {
      if (!allowedFieldNames.has(f.field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data", "filters", i, "field"],
          message:
            `unknown field "${f.field}" for datasource "${ds.id}". ` +
            `Allowed: [${allowedList}]`,
        });
      }
    });

    // sort.field 검증
    if (cfg.data.sort && !allowedFieldNames.has(cfg.data.sort.field)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data", "sort", "field"],
        message:
          `unknown sort field "${cfg.data.sort.field}" for datasource "${ds.id}". ` +
          `Allowed: [${allowedList}]`,
      });
    }
  });

export type AiCardConfig = z.infer<typeof AiCardConfigSchema>;
