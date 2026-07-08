/**
 * Composable Expressiveness 5-shape 축 (Architecture.md §8, PRD §2 "모든 데이터 × 모든 형태").
 *
 * 데이터의 "정체성(무슨 지표냐)"이 아니라 "모양(어떤 구조냐)"이 form↔data 호환성을
 * 정한다는 중심축의 스키마 구현 (Stage 2 Step 1, 2026-07-08).
 *
 *   scalar : 단일 값 하나 (BigValue 등 — Stage 1b 예정, 현재 미사용 placeholder)
 *   record : 한 대상의 여러 필드 스냅샷 (ticker-card / indicator-card 소비)
 *   set    : 여러 대상 × 필드 스냅샷 (table-card 소비)
 *   series : 시간축 위의 값 시계열 (kline-chart-card, 사이클 2 GenericChart 소비 예정)
 *   events : 시간순 도착 사건 스트림 (feed-card 소비)
 *
 * ★ 기존 componentRegistry 의 DataShapeSchema(= {datasourceId, requiredFields},
 *   필드-바인딩 선언)와는 **별개 축** — 이건 "모양 종류(kind)"다. 두 레이어를
 *   하나로 겹쳐 쓰지 않는다 (zod 자문 2026-07-08).
 */

import { z } from "zod";

export const DataShapeKindSchema = z.enum([
  "scalar",
  "record",
  "set",
  "series",
  "events",
]);

export type DataShapeKind = z.infer<typeof DataShapeKindSchema>;
