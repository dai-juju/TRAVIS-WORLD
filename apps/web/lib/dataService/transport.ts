// apps/web/lib/dataService/transport.ts
//
// 경로 A/B 분기 (M2 경로 A Step 3b, 2026-06-22).
//
// datasource 의 transport 칸을 읽어 "이 데이터가 어느 길로 닿는지" 결정.
// - "realtime" : 경로 B (Supabase Realtime, channelManager). 기본·기존 전부.
// - "ws_direct": 경로 A (워커 WS 직결, liveTopicManager).
// hooks.ts 가 이 결과로 구독 경로를 분기 — 카드는 transport 를 몰라도 됨.

"use client";

import { getDatasource, type Transport } from "@travis/shared";

/**
 * datasource 의 운반 경로 반환. 미등록/미명시는 "realtime"(경로 B) — 하위호환.
 * getDatasource 는 default 덕에 transport 가 항상 존재하지만, 미등록 id 는
 * undefined 라 ?? 로 한 번 더 방어.
 */
export function resolveTransport(datasource: string): Transport {
  return getDatasource(datasource)?.transport ?? "realtime";
}
