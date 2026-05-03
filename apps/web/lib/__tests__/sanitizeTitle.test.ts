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

  // M1.6 Step 6c (2026-05-03, security-auditor W-2 회수):
  // 12 XSS 벡터 회귀 테스트. 정규식 변경 시 silent breakage 자동 검출.
  // 본 시점 정규식은 12 벡터 모두 안전 처리됨 (실제 vulnerability 0~2%).
  //
  // mustNotContain 설계 원칙:
  //   - "실행 가능한 raw HTML 태그 패턴" (예: `<img`, `<svg`) 만 검증.
  //   - escape 된 텍스트 안의 attribute 단어 (onerror / javascript: 등) 는
  //     visible text 일 뿐 = 브라우저가 실행 안 함 = XSS 위험 0.
  //   - sanitize 의 안전 본질은 "실행 가능한 HTML 형태 차단" 이지 "특정 단어 제거" 가 아님.
  describe("12 XSS vectors (regression net)", () => {
    const vectors: Array<{
      name: string;
      input: string;
      mustNotContain: string[];
      mustContain?: string;
    }> = [
      {
        name: "v1 inline event handler on img",
        input: '<img src=x onerror=alert(1)>',
        mustNotContain: ["<img"],
      },
      {
        name: "v2 svg onload",
        input: '<svg/onload=alert(1)>',
        mustNotContain: ["<svg"],
      },
      {
        name: "v3 javascript: pseudo URL in tag",
        input: '<a href="javascript:alert(1)">x</a>',
        mustNotContain: ["<a "],
      },
      {
        name: "v4 iframe srcdoc",
        input: '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
        mustNotContain: ["<iframe", "<script>"],
      },
      {
        name: "v5 details ontoggle (modern vector)",
        input: '<details open ontoggle=alert(1)>x</details>',
        mustNotContain: ["<details"],
      },
      {
        name: "v6 style tag CSS injection",
        input:
          '<style>body{background:url(javascript:alert(1))}</style>',
        mustNotContain: ["<style>", "</style>"],
      },
      {
        name: "v7 broken closing > inside attribute",
        input: '<em onclick="alert(\'>\')">x</em>',
        mustNotContain: ["onclick"],
        mustContain: "<em>",
      },
      {
        name: "v8 mixed case bypass attempt",
        input: '<ScRiPt>alert(1)</ScRiPt>',
        mustNotContain: ["<script>", "<ScRiPt>"],
      },
      {
        name: "v9 entity-encoded < (visual only — 이미 escape 됨)",
        input: '&lt;script&gt;alert(1)&lt;/script&gt;',
        mustNotContain: ["<script>"],
      },
      {
        name: "v10 nested allowed > disallowed",
        input:
          '<strong><iframe src=javascript:alert(1)></iframe></strong>',
        mustNotContain: ["<iframe"],
        mustContain: "<strong>",
      },
      {
        name: "v11 HTML comment with script inside",
        input: '<!-- <script>alert(1)</script> -->',
        mustNotContain: ["<script>"],
      },
      {
        name: "v12 double-bracket bypass attempt",
        input: '<<script>alert(1)<</script>',
        mustNotContain: ["<script>", "</script>"],
      },
    ];

    for (const v of vectors) {
      it(`${v.name}: ${v.input.slice(0, 40)}…`, () => {
        const out = sanitizeTitle(v.input);
        for (const forbidden of v.mustNotContain) {
          expect(out).not.toContain(forbidden);
        }
        if (v.mustContain) {
          expect(out).toContain(v.mustContain);
        }
      });
    }
  });
});
