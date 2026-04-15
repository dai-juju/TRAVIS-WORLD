// 루트 ESLint flat config — 각 앱(`apps/web`, `apps/worker`)과 각 패키지(`packages/*`)는
// 자체 `eslint.config.mjs`를 가진다. 전체 lint는 `pnpm -r lint`로 각자 실행된다.
// 이 루트 파일은 워크스페이스 외부에 우연히 남은 MJS/MD 등 파일에 대한 기본 ignore만 담당한다.

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/dist/**",
      "**/out/**",
      "**/build/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      "**/next-env.d.ts",
      "pnpm-lock.yaml",
    ],
  },
];
