// sanitizeTitle 단위 테스트 (M1.4 Step 4-2b).
// 목적: AI 자유 텍스트 title 에 대한 화이트리스트 XSS 방어 동작 검증.

import { describe, it, expect } from "vitest";
import { sanitizeTitle } from "../sanitizeTitle";

describe("sanitizeTitle", () => {
  it("a) 허용 태그 <em> 은 그대로 유지", () => {
    const input = "Bitcoin, in <em>dollars</em>";
    expect(sanitizeTitle(input)).toBe("Bitcoin, in <em>dollars</em>");
  });

  it("b) <script> 태그는 escape 되어 실행 불가", () => {
    const input = "<script>alert(1)</script>";
    const out = sanitizeTitle(input);
    // 태그 자체가 텍스트로 바뀌어 브라우저가 실행시키지 않는다.
    expect(out).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).not.toContain("<script>");
  });

  it("c) <img> onerror 주입도 escape", () => {
    const input = '<img src=x onerror="alert(1)">';
    const out = sanitizeTitle(input);
    expect(out.startsWith("&lt;img")).toBe(true);
    expect(out).not.toContain("<img");
  });

  it("d) 허용 태그 <em> 에 onclick 속성이 붙어도 속성은 제거", () => {
    const input = '<em onclick="alert(1)">x</em>';
    expect(sanitizeTitle(input)).toBe("<em>x</em>");
  });

  it("e) 일반 텍스트는 변경 없이 반환", () => {
    const input = "Top gainers · 24H";
    expect(sanitizeTitle(input)).toBe("Top gainers · 24H");
  });

  it("f) 허용 태그 내부의 비허용 태그는 escape — 중첩 해석", () => {
    const input = "<em><script>inner</script></em>";
    // 바깥 em 은 유지, 내부 script 는 escape.
    expect(sanitizeTitle(input)).toBe(
      "<em>&lt;script&gt;inner&lt;/script&gt;</em>",
    );
  });

  it("bonus) 빈 입력 graceful", () => {
    expect(sanitizeTitle("")).toBe("");
  });

  it("bonus) 대문자 태그명도 허용 — lowercase 로 정규화", () => {
    expect(sanitizeTitle("<EM>hi</EM>")).toBe("<em>hi</em>");
  });
});
