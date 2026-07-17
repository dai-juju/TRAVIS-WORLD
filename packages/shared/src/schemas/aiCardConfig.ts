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

// ─── CardDataBinding ────────────────────────────────
// (CardActionSchema 는 CardDataBindingSchema 를 재사용하므로 이 파일의 정의 순서는
//  CardDataBinding → SpawnTarget → CardAction → AiCardConfig 선형 — 순환 참조 없음.
//  M3-step1, 2026-07-16 재배치.)

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

// ─── spawn parameterMapping 이 채울 수 있는 타겟 필드 (M3-step1, 2026-07-16) ───
//
// "행마다 달라지는 축"만 클릭 시점 주입 대상 — SELECTOR_KEY_TO_CONFIG_FIELD 의 값
//   집합에서 파생(단일 진실 공유). filters/sort/limit/interval 은 고정 선언이지
//   행 파생이 아니므로 매핑 대상이 아니다. 새 selectorKey 도입 시 자동 동기화.
export const SPAWN_MAPPABLE_TARGET_FIELDS: ReadonlySet<string> = new Set(
  Object.values(SELECTOR_KEY_TO_CONFIG_FIELD),
);

// ─── 공유 superRefine 헬퍼 (M3-step1, 2026-07-16) ────────────────────────────
//
// AiCardConfig(카드 자신)와 CardAction.target(클릭 시 spawn 될 카드의 사전 선언)이
//   동일한 조합 결함 검증을 공유 — 로직 단일화(드리프트 방지). path 접두만 다르다.
//   emit 시점의 target 은 의도적으로 미완성(symbol 등은 클릭 행에서 채움)이므로,
//   여기서는 "타겟만으로 항상 판정 가능한 결함"((1)/(1.5)/queryableFields)만 다루고
//   스코프 완결성((2.5)/(3))은 클릭 시점의 AiCardConfigSchema.safeParse 로 이연한다
//   — emit 시 symbol 을 강제하면 정상 유스케이스가 오탐돼 self-correction 데드락.

/** (1) componentId ↔ datasource dataShapes 결합 — 미선언 조합은 silent 깨진 카드. */
function assertComponentSupportsDatasource(
  componentId: string,
  datasource: string,
  ctx: z.RefinementCtx,
  datasourcePath: (string | number)[],
): void {
  const comp = getComponent(componentId);
  if (!comp) return; // RegisteredComponentIdSchema 가 unknown id 를 이미 잡음
  const supported = comp.dataShapes.some((s) => s.datasourceId === datasource);
  if (!supported) {
    const allowed = comp.dataShapes.map((s) => s.datasourceId).join(", ");
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: datasourcePath,
      message:
        `component "${componentId}" does not support datasource ` +
        `"${datasource}". Allowed datasources for this component: ` +
        `[${allowed}]. Alternatively, choose a component whose dataShapes ` +
        `include "${datasource}".`,
    });
  }
}

/** (1.5) updateMode ∈ supportedUpdateModes — registry 선언 파생. */
function assertUpdateModeSupported(
  componentId: string,
  updateMode: string,
  ctx: z.RefinementCtx,
  updateModePath: (string | number)[],
): void {
  const comp = getComponent(componentId);
  if (!comp) return;
  if (!comp.supportedUpdateModes.includes(updateMode as never)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: updateModePath,
      message:
        `component "${componentId}" supports update modes ` +
        `[${comp.supportedUpdateModes.join(", ")}] — got "${updateMode}".`,
    });
  }
}

/** filters[].field / sort.field ↔ datasource queryableFields — [3-32] 계보. */
function assertQueryFieldsRegistered(
  binding: CardDataBinding,
  ctx: z.RefinementCtx,
  bindingPath: (string | number)[],
): void {
  const ds = getDatasource(binding.datasource);
  if (!ds) return; // RegisteredDatasourceIdSchema 가 이미 issue 등록
  const allowedFieldNames = new Set(ds.queryableFields.map((f) => f.name));
  const allowedList = [...allowedFieldNames].join(", ");

  binding.filters?.forEach((f, i) => {
    if (!allowedFieldNames.has(f.field)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...bindingPath, "filters", i, "field"],
        message:
          `unknown field "${f.field}" for datasource "${ds.id}". ` +
          `Allowed: [${allowedList}]`,
      });
    }
  });

  if (binding.sort && !allowedFieldNames.has(binding.sort.field)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...bindingPath, "sort", "field"],
      message:
        `unknown sort field "${binding.sort.field}" for datasource "${ds.id}". ` +
        `Allowed: [${allowedList}]`,
    });
  }
}

// ─── SpawnTarget ────────────────────────────────────
//
// M3-step1 (2026-07-16, 사용자 확정 "AI 사전 선언" 방식): AI 가 카드 생성 시점에
//   "클릭하면 어떤 카드(form × data)를 띄울지"까지 선언하고, 클릭 시 프론트는
//   AI 재호출 없이 target + 클릭 행의 값(parameterMapping) + fresh id 로 조립만
//   한다(반응 0초·비용 0). 무엇을 띄울지는 전적으로 AI 결정 — 코드 큐레이션 금지.
//
// data 는 CardDataBindingSchema 그대로 재사용(중복 0) — symbol 이 원래 optional
//   이라 "클릭 시 행에서 채움"과 자연히 맞물린다. id/position 은 클릭 시점에
//   프론트가 생성(고정 id 는 반복 클릭 덮어쓰기를 유발하므로 선언에서 제외).
//
// M3-step2 [10-115] (2026-07-17) 깊이 1 명시 중첩:
//   스폰된 카드도 재클릭 체인을 갖도록 SpawnTarget 에 actions 를 가산하되,
//   **재귀(z.lazy)가 아니라 깊이 1 명시 중첩** — route.ts 의 tool input_schema
//   변환이 `$refStrategy:"none"` 이라 재귀 스키마는 그 지점이 `{}`(무제약)로
//   뭉개져(zod-to-json-schema 공식 동작) AI 길잡이·도구 단계 검증이 소실된다.
//   체인 상한 = 소스 → mid(클릭 가능) → leaf(말단, 클릭 불가) 2 hop.
//   (zod-schema-architect 자문 2026-07-17. 더 깊은 체인 수요는 [10-115] 후속.)

/** 스폰될 카드의 form × data 공통 몸통 (재클릭 액션 제외) — 두 층이 재사용. */
const SpawnTargetBaseShape = {
  componentId: RegisteredComponentIdSchema.describe(
    "Component to spawn (registered componentRegistry id only).",
  ),
  // updateMode 필수 — AI 결정 항목(CLAUDE.md 최상위 축 3). 프론트 추론 금지.
  updateMode: UpdateModeSchema.describe(
    "Update mode of the spawned card — the AI decides this, never the frontend.",
  ),
  // size 는 표시 의도가 아닌 레이아웃 → optional, 생략 시 component.defaultSize.
  size: CardSizeSchema.optional().describe(
    "Spawned card size (omit to use the component's default size).",
  ),
  data: CardDataBindingSchema.describe(
    "Data binding of the spawned card. Declare the datasource and any fixed " +
      "scope (e.g. marketType). Usually omit symbol here and fill it from the " +
      "clicked row via parameterMapping.",
  ),
} as const;

/** 말단(leaf) 타겟 — 체인 깊이 상한. 여기서 스폰된 카드는 클릭 표면이 없다. */
export const SpawnTargetLeafSchema = z.object(SpawnTargetBaseShape).strict();
export type SpawnTargetLeaf = z.infer<typeof SpawnTargetLeafSchema>;

// ─── CardAction ─────────────────────────────────────

/**
 * spawn 액션 스키마 팩토리 — target 형태(leaf/full)만 다르고 필드·emit 시점
 * superRefine 로직은 완전 동일해야 하므로 한 곳에서 생성한다(드리프트 0).
 *
 * M3-step1 (2026-07-16) 개편: 구형 { targetComponentId } 평면 → { target } 중첩.
 *   구형 소비자 0(디스패처 휴면·saved_views 실측 0건)이라 클린 교체.
 * 현재 "spawn"만 지원. "drill_down" / "linked_selection"은 후속([4-13]).
 */
function makeSpawnActionSchema<T extends z.ZodTypeAny>(targetSchema: T) {
  return z
    .object({
      trigger: z
        .enum(["row-click", "header-click"])
        .describe("Interaction trigger on the source card."),
      type: z.literal("spawn").describe("Action type — only 'spawn' is supported."),
      target: targetSchema.describe(
        "The card to assemble when the trigger fires, declared upfront " +
          "(form × data). Assembled at click time without another AI call.",
      ),
      // 클릭 행 → 스폰 카드 매핑. key = 타겟 data 필드 / value = 소스 행 컬럼.
      //   key ⊆ SPAWN_MAPPABLE_TARGET_FIELDS(아래 superRefine, context-free) /
      //   value ⊆ 소스 datasource queryableFields(부모 AiCardConfig superRefine —
      //   소스 datasource 는 부모 카드만 알기 때문. 중첩 leaf 액션의 value 는
      //   mid 카드가 클릭 시점에 완전한 AiCardConfig 로 재검증될 때 자동 승계).
      parameterMapping: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Fill the spawned card from the clicked row. Key = target data field " +
            '(e.g. "symbol"), value = source row column (e.g. "symbol"). ' +
            'Example: { "symbol": "symbol", "marketType": "market_type" }.',
        ),
    })
    .strict()
    .superRefine((action, ctx) => {
      // emit 시점 부분검증 — target 만으로 완결되는 조합 결함만 조기 게이트
      //   (AI self-correction 이 응답 시점에 즉시 교정 가능). 스코프 완결성은
      //   클릭 시점 AiCardConfigSchema.safeParse 가 최종 게이트(역할 분담).
      //   leaf/full 공통 몸통 필드만 참조하므로 두 층 모두 안전한 캐스트.
      const target = action.target as SpawnTargetLeaf;
      assertComponentSupportsDatasource(
        target.componentId,
        target.data.datasource,
        ctx,
        ["target", "data", "datasource"],
      );
      assertUpdateModeSupported(target.componentId, target.updateMode, ctx, [
        "target",
        "updateMode",
      ]);
      assertQueryFieldsRegistered(target.data, ctx, ["target", "data"]);

      // parameterMapping key ∈ 행 파생 가능 스코프 필드 (소스 컨텍스트 불필요 —
      //   여기서 검증. value 쪽은 부모 superRefine 담당).
      for (const key of Object.keys(action.parameterMapping ?? {})) {
        if (!SPAWN_MAPPABLE_TARGET_FIELDS.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["parameterMapping", key],
            message:
              `target field "${key}" is not row-mappable. Mappable target fields: ` +
              `[${[...SPAWN_MAPPABLE_TARGET_FIELDS].join(", ")}]. Fixed settings ` +
              `(filters, sort, limit, interval) belong in target.data instead.`,
          });
        }
      }
    });
}

/** 중첩(2층) 액션 — 스폰된 mid 카드 위의 재클릭. 타겟은 말단(leaf)만. */
export const SpawnLeafActionSchema = makeSpawnActionSchema(SpawnTargetLeafSchema);
export type SpawnLeafAction = z.infer<typeof SpawnLeafActionSchema>;

/**
 * 최상위 spawn 타겟 — leaf 몸통 + (선택) 스폰된 카드 자신의 재클릭 액션.
 *   actions 를 선언하면 스폰된 카드에서 한 단계 더 들어갈 수 있다(2 hop 상한).
 */
export const SpawnTargetSchema = z
  .object({
    ...SpawnTargetBaseShape,
    actions: z
      .array(SpawnLeafActionSchema)
      .optional()
      .describe(
        "Optional interactions on the SPAWNED card — one further drill-down " +
          "hop (e.g. list row → detail → chart). Cards spawned from these are " +
          "terminal (no further actions).",
      ),
  })
  .strict();

export type SpawnTarget = z.infer<typeof SpawnTargetSchema>;

/** 최상위(1층) 액션 — 소스 카드 위의 클릭. 타겟은 재클릭 가능(full). */
export const CardActionSchema = makeSpawnActionSchema(SpawnTargetSchema);
export type CardAction = z.infer<typeof CardActionSchema>;

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
    // ─── (1) componentId ↔ datasource 결합 + (1.5) updateMode 지원 검증 ───
    //
    // M3-step1 (2026-07-16): 로직을 공유 헬퍼로 추출 — CardActionSchema.target
    //   (클릭 시 spawn 될 카드의 사전 선언)이 emit 시점에 동일 검증을 재사용한다.
    //   원 배경: (1) = M2 테마 A Step 3 ([3-32] 부류 silent 깨진 카드 차단,
    //   dataShapes 선언 파생·하드매핑 아님) / (1.5) = ff#2 재개 Step 1
    //   (supportedUpdateModes 선언 파생). 에러 메시지에 허용 목록 dump →
    //   AI self-correction 1회 통과 ([3-7]/[3-32] 확립 패턴).
    assertComponentSupportsDatasource(cfg.componentId, cfg.data.datasource, ctx, [
      "data",
      "datasource",
    ]);
    assertUpdateModeSupported(cfg.componentId, cfg.updateMode, ctx, ["updateMode"]);

    const comp = getComponent(cfg.componentId);

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

    // ─── (4) filters[].field / sort.field ↔ queryableFields (M1.6 Step 4) ───
    //   M3-step1: 공유 헬퍼로 추출 — CardAction.target.data 와 동일 로직.
    assertQueryFieldsRegistered(cfg.data, ctx, ["data"]);

    // ─── (5) spawn parameterMapping 소스 컬럼 검증 (M3-step1, 2026-07-16) ───
    //
    // parameterMapping 의 value = "클릭된 행의 컬럼명"인데, 소스 datasource 는
    //   부모 카드(cfg.data.datasource)만 안다 — CardActionSchema 단독으로는 검증
    //   불가라 여기서 수행. key 쪽(타겟 필드 ∈ SPAWN_MAPPABLE_TARGET_FIELDS)은
    //   CardActionSchema.superRefine 이 context-free 로 이미 게이트.
    cfg.actions?.forEach((action, ai) => {
      for (const [targetField, sourceColumn] of Object.entries(
        action.parameterMapping ?? {},
      )) {
        if (!allowedFieldNames.has(sourceColumn)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["actions", ai, "parameterMapping", targetField],
            message:
              `source column "${sourceColumn}" is not a queryable field of this ` +
              `card's datasource "${ds.id}" — the clicked row cannot supply it. ` +
              `Allowed: [${allowedList}]`,
          });
        }
      }
    });
  });

export type AiCardConfig = z.infer<typeof AiCardConfigSchema>;
