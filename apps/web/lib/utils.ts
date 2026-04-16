// shadcn 컴포넌트들이 공통으로 쓰는 className 결합 헬퍼.
//   - clsx   : 조건부 클래스(`{ hidden: !isOpen }`, 배열 등)를 안전하게 합침
//   - twMerge: 충돌하는 Tailwind 유틸리티가 있으면 뒷쪽 승 (`"p-2 p-4" → "p-4"`)
// 이 파일이 `components.json`의 `aliases.utils`로 지정된 shadcn 진입점이다.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
