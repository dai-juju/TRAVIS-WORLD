// CSS import 스텁 — vitest 전용 (사이클 2 Step 5 hotfix, 2026-07-09).
//
// useUplot 이 uPlot.min.css 를 import(레이아웃: canvas{width:100%} 등 — 라이브 필수)
// 하면서, vitest 의 vite:css 파이프라인이 Next 전용 postcss.config.mjs
// (@tailwindcss/postcss 문자열 플러그인 형식)를 못 읽어 suite 수집이 죽는다.
// 테스트는 CSS 레이아웃을 검증하지 않으므로(라이브 G2 소관) 전 CSS 를 빈 모듈로 대체.
const emptyStyleModule = {};
export default emptyStyleModule;
