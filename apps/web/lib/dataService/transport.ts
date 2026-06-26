// apps/web/lib/dataService/transport.ts
//
// datasource 운반/적용 메타 resolver (M2 경로 A Step 3b, 2026-06-22).
//
// datasource 레지스트리의 운반 관련 칸을 읽어 dataService(hooks)가 "어느 길로
// 닿는지 / 도착한 row 를 어떻게 합치는지"를 결정. 카드는 이 메타를 몰라도 됨.
// - transport: 경로 A(ws_direct) / B(realtime) 구독 경로 분기.
// - mergeMode: 도착 row 를 이전 상태와 통째 교체(replace) / 컬럼만 덮어쓰기(partial).

"use client";

import { getDatasource, type MergeMode, type Transport } from "@travis/shared";

/**
 * datasource 의 운반 경로 반환. 미등록/미명시는 "realtime"(경로 B) — 하위호환.
 * getDatasource 는 default 덕에 transport 가 항상 존재하지만, 미등록 id 는
 * undefined 라 ?? 로 한 번 더 방어.
 */
export function resolveTransport(datasource: string): Transport {
  return getDatasource(datasource)?.transport ?? "realtime";
}

/**
 * datasource 의 row 병합 모드 반환. 미등록/미명시는 "replace"(기존 동작) — 하위호환.
 * (M2 경로 A fast-follow #1 Step 2, 2026-06-26)
 * "partial" 인 datasource(premium_index)만 경로 A 부분 방송 시 prev 위에 덮어쓰기.
 */
export function resolveMergeMode(datasource: string): MergeMode {
  return getDatasource(datasource)?.mergeMode ?? "replace";
}
