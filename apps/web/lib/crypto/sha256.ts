// apps/web/lib/crypto/sha256.ts
//
// Web Crypto SHA-256 helper (M1.6 Step 3 Substep 3e, 2026-04-26).
//
// 용도: user_query_hash 계산 — PII 의존 없이 동일 query 군집 분석 가능.
//   admin (M1.7) 이 query_text 를 직접 못 봐도 같은 hash 끼리 그룹핑하면
//   "동일 질문이 N 번 반복됐다" 같은 패턴 분석.
//
// 공식 문서:
//   - SubtleCrypto.digest:
//     https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest (2026-04-26 조회)
//   - 요구 환경: HTTPS 또는 localhost (Secure Context)
//   - 모든 모던 브라우저 지원 (Chrome / Firefox / Safari / Edge)

"use client";

/**
 * 입력 문자열의 SHA-256 hex 64자 hash 반환.
 * Web Crypto API 가 비동기라 Promise 반환.
 *
 * 절대 throw 하지 않도록 호출자가 try/catch — Secure Context 가 아닌 환경
 * (예: 테스트 jsdom) 에선 crypto.subtle 미지원 가능.
 *
 * @param text 임의 길이 문자열 (보통 trim 된 user query)
 * @returns sha256 hex (64자, lowercase)
 */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
