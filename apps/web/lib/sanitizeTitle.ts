/**
 * sanitizeTitle — AI 자유 텍스트(카드 title)에서 안전한 HTML 만 남기는 화이트리스트 sanitizer.
 *
 * 배경 (M1.4 Step 4-2b, 2026-04-22):
 *   TickerCard / CoinListCard / KlineChartCard 가 AI 생성 title 을 `dangerouslySetInnerHTML`
 *   로 렌더한다. AI 환각 또는 프롬프트 인젝션으로 `<script>alert(1)</script>` 같은
 *   악성 HTML 이 섞이면 XSS 가 된다. AiCardConfigSchema 의 `.max(80)` 길이 제약은
 *   HTML 구조를 검증하지 못한다.
 *
 * 정책:
 *   - `<em>` / `<strong>` 태그만 허용 (UI-3 에디토리얼 저널 톤에서 실제로 쓰는 태그)
 *   - 허용 태그라도 **속성은 전부 제거** — onclick/onerror/style 등 속성 기반 XSS 벡터
 *     차단. UI-3 는 속성을 쓰지 않는다 (인라인 스타일은 CSS 변수 class 로 대체).
 *   - 나머지 태그는 `<` `>` 를 `&lt;` `&gt;` 로 escape 해 보여주기만 하고 실행시키지 않음.
 *
 * 왜 정규식 기반인가 (DOMPurify 대신):
 *   - 번들 사이즈: DOMPurify ~50KB vs 정규식 ~0.5KB
 *   - 환경 호환: 이 모듈은 SSR(node) 와 CSR(브라우저) 양쪽에서 호출되므로 `document`
 *     의존이 없어야 함. 정규식은 환경 독립적.
 *   - 보호 범위: 우리가 노출하는 허용 태그가 2개뿐이라 surface 가 작음. M1.6 에서
 *     security-auditor 가 재검증 예정이며, 이 때 DOMPurify 도입 여부 재평가.
 *
 * 한계 (M1.6 security-auditor 재검증 시 다룰 항목):
 *   - CSS 에 이미지 url() 유입 — 현재 방어 안 함. title 은 텍스트만이라 무관.
 *   - mathML / svg 이벤트 벡터 — 허용 태그 밖이므로 escape 됨.
 *   - HTML entity 이중 encode (`&amp;lt;`) — 현재 별도 처리 안 함. 입력이 이미
 *     encoded 된 경우 그대로 표시되어 시각적 혼란은 있을 수 있으나 XSS 위험 없음.
 */

const ALLOWED_TAGS = new Set(["em", "strong"]);

/** 단일 태그(`<...>`) 매치. 여는/닫는 태그 + 태그명 + 속성부 캡처. */
const TAG_REGEX = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;

/** HTML escape — 태그가 아닌 `<`, `>` 를 안전하게 변환. */
function escapeAngleBrackets(fragment: string): string {
  return fragment.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 입력 문자열에서 `<em>` / `<strong>` 만 허용하고 그 외 태그는 escape.
 *
 * @param html AI 가 생성한 자유 텍스트 (title/kicker/subtitle 공용)
 * @returns dangerouslySetInnerHTML 에 바로 주입 가능한 안전 문자열
 */
export function sanitizeTitle(html: string): string {
  if (!html) return "";
  return html.replace(TAG_REGEX, (match, slash, tagName) => {
    const lower = (tagName as string).toLowerCase();
    if (ALLOWED_TAGS.has(lower)) {
      // 허용 태그 — 속성 전부 제거하고 lowercase 로 재조립.
      return `<${slash}${lower}>`;
    }
    // 비허용 태그 — 전체 매치를 escape 해 실행 막음.
    return escapeAngleBrackets(match);
  });
}
