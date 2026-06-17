/**
 * activeViewStorage — 활성 뷰 id 의 localStorage 미러 (M2 테마 C Saved Views v2 Sub-step 2).
 *
 * 목적:
 *   새로고침 후에도 "마지막으로 보던 저장 뷰"를 복원하기 위한 breadcrumb. 쓰기는
 *   ActiveViewStoreProvider 가 activeViewId 변경 시 호출하고, 읽기(+서버 재검증 후
 *   캔버스 복원)는 Sub-step 4(MyViews)가 마운트 시 소비한다.
 *
 * 설계:
 *   - SSR 가드(typeof window) — useState lazy initializer 가 서버에서 돌아도 안전.
 *   - localStorage 비활성(프라이빗 모드/쿼터 초과)은 graceful 무시 — 영속화는
 *     best-effort 이고 실패해도 앱 동작에 영향 없음(CLAUDE.md: 절대 crash 금지).
 */

/** localStorage 키 — TRAVIS 네임스페이스 접두. */
export const ACTIVE_VIEW_STORAGE_KEY = "travis.activeViewId";

/** 활성 뷰 id 기록(null 이면 제거). 실패 시 graceful 무시. */
export function persistActiveViewId(id: string | null): void {
  if (typeof window === "undefined") return; // SSR 가드
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_VIEW_STORAGE_KEY);
    }
  } catch {
    // localStorage 비활성 — best-effort 이므로 무시.
  }
}

/** 미러된 활성 뷰 id 읽기(없거나 실패 시 null). Sub-step 4 복원 진입점. */
export function readPersistedActiveViewId(): string | null {
  if (typeof window === "undefined") return null; // SSR 가드
  try {
    return window.localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
  } catch {
    return null;
  }
}
