// TRAVIS 프론트엔드 Next.js 설정.
import type { NextConfig } from "next";

const config: NextConfig = {
  // workspace 패키지가 컴파일된 .js가 아닌 .ts 소스를 직접 export하므로,
  // Next.js 빌드러가 이 패키지들을 트랜스파일하도록 명시 등록.
  transpilePackages: ["@travis/shared", "@travis/data-service"],
};

export default config;
