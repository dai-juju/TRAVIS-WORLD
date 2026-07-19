// apps/web/lib/dataService/rpcFetch.ts
//
// dataService 의 DB 함수(RPC) 호출 유일 진입점 ([10-84] M3-step3a, 2026-07-19).
//
// 왜 필요한가:
//   집계(SUM/GROUP BY)가 필요한 datasource 는 테이블 직접 SELECT 로 서빙할 수 없다.
//   원본 행을 프론트로 끌어와 집계하면 initialFetch 의 FETCH_HARD_CAP(3000행)에 걸려
//   전 시장 24h 청산(24,692행)이 **무증상 절단**된다 — 차트는 정상처럼 보이면서 값이
//   틀리는 최악의 형태(사이트=DB 진실 일치 위반). DB 집계는 85:1 압축(실측 37ms).
//
// 경계 규율 (initialFetch 가 확립한 choke point 원칙 그대로):
//   카드·AI 코드에서 `.rpc()` 를 **직접 호출하지 않는다**. 전부 이 파일을 경유해야
//   나중에 데이터 레이어를 갈아끼울 때 이주 지점이 한 곳으로 남는다.
//
// 인자 이름 매핑:
//   "fetch 축(코드가 아는 이름) → SQL 인자명" 은 registry 의 rpcSpec.argNames 가
//   **데이터로** 선언한다. 전역 고정 인자 규격을 코드에 박지 않는다 (liveTopicSpec
//   원칙 계승) — 미래의 다른 집계 함수가 자기 인자명을 스스로 선언하면 된다.
//
// graceful:
//   SSR/env 누락·미배포 함수·권한 실패 전부 빈 배열 + warn (CLAUDE.md crash 금지).
//   호출자(seriesFetch)는 Promise.allSettled 로 감싸 부분 실패를 흡수한다.

import { getDatasource } from "@travis/shared";
import { getDataSourceClient } from "./supabaseAdapter";

/** fetch 축 — registry rpcSpec.argNames 의 키와 1:1. 값이 undefined 인 축은 미전달. */
export interface RpcFetchAxes {
  exchange?: string;
  marketType?: string;
  /** 생략 = 전체 집계 (optionalScopeFields 로 선언된 datasource 한정). */
  symbol?: string;
  interval?: string;
  side?: string;
  /** ISO-8601 */
  from?: string;
  /** ISO-8601 */
  to?: string;
  limit?: number;
}

/**
 * registry rpcSpec 을 따라 DB 함수를 호출한다.
 *
 * ★ 축 → 인자명 매핑에 없는 축은 **조용히 버리지 않고 warn** — 오타나 spec 누락이
 *   "그 축만 미전달"(예: symbol 이 안 넘어가 전 시장 스캔)로 새면 값이 조용히
 *   틀린다. 등록 시점 스키마가 1차로 잡지만, 호출 시점에도 흔적을 남긴다.
 */
export async function rpcFetch<T extends Record<string, unknown>>(
  datasource: string,
  axes: RpcFetchAxes,
): Promise<T[]> {
  const entry = getDatasource(datasource);
  const spec = entry?.rpcSpec;
  if (!spec) {
    console.warn(
      `[rpcFetch] datasource "${datasource}" 에 rpcSpec 이 없음 — 빈 결과 (graceful)`,
    );
    return [];
  }

  const client = getDataSourceClient();
  if (!client) return []; // SSR / env 누락 — initialFetch 와 동일 graceful

  const args: Record<string, unknown> = {};
  for (const [axis, value] of Object.entries(axes)) {
    if (value === undefined || value === null) continue;
    const argName = spec.argNames[axis as keyof typeof spec.argNames];
    if (!argName) {
      console.warn(
        `[rpcFetch] "${datasource}" rpcSpec 에 축 "${axis}" 인자명이 없음 — 미전달 ` +
          `(값이 조용히 무시되는 경로이므로 spec 확인 필요)`,
      );
      continue;
    }
    args[argName] = value;
  }

  // 제네릭 RPC 는 generated Database["public"]["Functions"] 타입 재생성 전까지
  //   키가 없어 캐스트가 필요하다. 재생성 후에도 반환 row 타입은 호출자가 좁힌다.
  const rpc = (
    client as unknown as {
      rpc: (
        fn: string,
        params: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc;

  const { data, error } = await rpc.call(client, spec.functionName, args);
  if (error) {
    console.warn(
      `[rpcFetch] "${datasource}" → ${spec.functionName}() 실패 — 빈 결과 (graceful)`,
      error.message,
    );
    return [];
  }
  return Array.isArray(data) ? (data as T[]) : [];
}
