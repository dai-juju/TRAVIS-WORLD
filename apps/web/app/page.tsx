import CanvasWorkspace from "@/components/canvas/CanvasWorkspace";

/**
 * TRAVIS 루트 페이지 (M1.4 Step 1).
 *
 * 역할:
 *   - React Flow 캔버스를 전체 화면으로 렌더링.
 *
 * SSR 경계 처리:
 *   Next.js 16 App Router 에서 Server Component 는 `dynamic(..., {ssr:false})`
 *   를 허용하지 않는다. 대신 `CanvasWorkspace` 자체가 "use client" 를 가지고
 *   있으므로 정적 import 만으로 Next.js 가 자동으로 client boundary 를 만든다.
 *   React Flow 의 useLayoutEffect · DOM 측정은 모두 hydration 이후에 실행되므로
 *   hydration mismatch 위험은 없다.
 *
 * 이 파일 자체는 Server Component 유지 — metadata / 향후 서버 데이터 fetch 여지.
 */
export default function Page() {
  return <CanvasWorkspace />;
}
