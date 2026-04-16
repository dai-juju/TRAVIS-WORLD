// TRAVIS 프론트엔드 PostCSS 설정 — Tailwind v4 전용 플러그인 하나로 충분.
// v3에서 필요했던 postcss-import/autoprefixer는 @tailwindcss/postcss가 내부
// 흡수하므로 별도 선언 금지 (중복 파이프라인 방지).
const config = {
  plugins: ["@tailwindcss/postcss"],
};

export default config;
