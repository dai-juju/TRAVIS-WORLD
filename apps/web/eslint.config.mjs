// apps/web 자체 ESLint flat config.
// Next.js 16은 `next lint`를 제거했고, eslint-config-next v16은 네이티브
// flat config 배열을 default-export한다 (FlatCompat 불필요). 공식 subpath:
//   - eslint-config-next/core-web-vitals → next + react + react-hooks + CWV
//   - eslint-config-next/typescript      → typescript-eslint recommended + 규칙
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [".next/**", "node_modules/**"],
  },
];

export default config;
