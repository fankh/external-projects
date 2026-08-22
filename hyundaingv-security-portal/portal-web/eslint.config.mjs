import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'tsconfig.tsbuildinfo',
      'deploy/**',
    ],
  },
  // next/core-web-vitals: React·Hooks·Next 규칙, next/typescript: @typescript-eslint 권장 규칙
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // 이 포털은 App Router 전용이라 pages/ 디렉터리가 없다. 이 규칙은 pages 라우터용이고
      // App Router 에서는 Route Handler(app/api/**/route.ts)까지 '페이지'로 오인해 오탐을 낸다.
      // 실제 대상이던 /api/export 는 Content-Disposition: attachment 파일 다운로드,
      // /api/sso/login 은 IdP 로 나가는 리다이렉트라 둘 다 <Link>(클라이언트 내비게이션)로
      // 바꾸면 동작이 깨진다. 화면 간 이동은 <Link> 를 쓰도록 코드 리뷰로 유지한다.
      '@next/next/no-html-link-for-pages': 'off',
      // 의도적으로 버리는 바인딩은 _ 접두사로 표기한다(구조분해 시 특정 키 제외 등).
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
    },
  },
]

export default eslintConfig
