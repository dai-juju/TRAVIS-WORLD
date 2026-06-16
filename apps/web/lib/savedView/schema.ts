/**
 * savedView/schema — 저장 뷰 스냅샷의 순수 Zod 스키마 + 상한 (M2 테마 C Step 2).
 *
 * ★ 서버/클라 공용 (순수): zod + @travis/shared(AiCardConfigSchema)만 의존하고
 *   canvasStore(@xyflow/react 런타임)는 import 하지 않는다. 그래야 API 라우트
 *   (서버)가 이 모듈을 가져와도 React Flow 가 서버 번들로 끌려오지 않는다.
 *   TravisNode 를 다루는 serialize/hydrate 는 `serialize.ts`(클라 전용)에 둔다.
 *
 * 직렬화 형태 (DB cards_config/canvas_state JSONB 내부 키 = 본 Sub-step 확정):
 *   cards_config = SavedViewCard[]  ({ config, position, width?, height? })
 *   canvas_state = SavedViewViewport ({ x, y, zoom })
 */
import { z } from "zod";
import { AiCardConfigSchema } from "@travis/shared";

// ─── 페이로드 상한 (DoS 방지, security-auditor Sub-step 2 후속) ──────────
export const SAVED_VIEW_MAX_CARDS = 200;
export const SAVED_VIEW_MAX_BYTES = 512 * 1024; // 512 KiB
export const SAVED_VIEW_NAME_MAX = 200; // DB CHECK(1~200)과 정합

// ─── 구성 스키마 ────────────────────────────────────────────────────────

export const SavedViewPositionSchema = z
  .object({ x: z.number(), y: z.number() })
  .strict();

export const SavedViewViewportSchema = z
  .object({ x: z.number(), y: z.number(), zoom: z.number().positive() })
  .strict();

export type SavedViewViewport = z.infer<typeof SavedViewViewportSchema>;

/** 한 카드의 저장 단위 (저장 시 strict 검증). */
export const SavedViewCardSchema = z
  .object({
    config: AiCardConfigSchema,
    position: SavedViewPositionSchema,
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .strict();

export type SavedViewCard = z.infer<typeof SavedViewCardSchema>;

/** 저장 스냅샷 전체 (저장 route 가 INSERT 전 검증). */
export const SavedViewSnapshotSchema = z
  .object({
    cards: z.array(SavedViewCardSchema).max(SAVED_VIEW_MAX_CARDS),
    viewport: SavedViewViewportSchema,
  })
  .strict();

export type SavedViewSnapshot = z.infer<typeof SavedViewSnapshotSchema>;

/** 뷰 이름 — 빈 문자열/과도 길이 차단 (DB CHECK 정합). */
export const SavedViewNameSchema = z.string().trim().min(1).max(SAVED_VIEW_NAME_MAX);

/**
 * 로드용 느슨한 바깥 스키마 — config 는 unknown 으로 두고 카드별로 따로 검증.
 * (한 카드 drift 로 전체 뷰를 버리지 않기 위함 — serialize.ts hydrate 에서 사용.)
 */
export const LooseSnapshotSchema = z
  .object({
    cards: z.array(
      z
        .object({
          config: z.unknown(),
          position: SavedViewPositionSchema,
          width: z.number().positive().optional(),
          height: z.number().positive().optional(),
        })
        .strict(),
    ),
    viewport: SavedViewViewportSchema,
  })
  .strict();
