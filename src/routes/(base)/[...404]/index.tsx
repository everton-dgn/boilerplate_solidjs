import type { RouteDefinition } from '@solidjs/router'
import { httpStatus } from '@solidjs/web'

import { ErrorFallback } from '@/components/organisms/ErrorFallback/index.tsx'
import { HTTP_NOT_FOUND } from '@/constants/http.ts'

import { seo } from './seo.ts'

export const route = {
  preload: () => httpStatus(HTTP_NOT_FOUND),
  info: { seo }
} satisfies RouteDefinition

export default function NotFound() {
  return <ErrorFallback kind="not-found" />
}
