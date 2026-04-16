"use client";
// TRAVIS 프론트엔드 전역 Zustand 스토어 — Step 3c 최소 뼈대.
//
// ⚠️ M1.4 리팩터 트리거 (공식 권장 Provider 패턴):
//   Zustand v5 공식 Next.js 가이드는 `createStore()` + React Context Provider
//   + `useStore(ctx, selector)` 훅 패턴을 권장한다. 이유:
//     (1) Next.js 서버가 처리하는 요청 간에 module-level 전역 state가
//         공유되면 사용자 A의 상태가 사용자 B에게 새어나갈 수 있다.
//     (2) SSR/CSR 경계에서 hydration mismatch가 쉽게 발생한다.
//   현재 Step 3c에서는 실제 store consumer가 0개(page.tsx 서버 컴포넌트는
//   이 파일을 import하지 않는다)라 단순 `create()`로 충분하다. 그러나
//   M1.4에서 React Flow 캔버스 client 컴포넌트가 처음 store를 읽는 순간
//   Provider 패턴으로 리팩터해야 한다.
//
// 상태 설계:
//   지금 넣는 `isCanvasReady`는 throwaway 예제가 아니라 M1.4에서 "React Flow
//   캔버스 마운트 완료 여부" 플래그로 자연 승격된다. Step 3d에서도 타입/링트
//   검증 목적 외에는 사용되지 않는다.
import { create } from "zustand";

interface AppState {
  isCanvasReady: boolean;
  setCanvasReady: (ready: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isCanvasReady: false,
  setCanvasReady: (ready) => set({ isCanvasReady: ready }),
}));
