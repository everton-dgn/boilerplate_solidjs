import type { RouteDefinition } from '@solidjs/router'
import { httpStatus } from '@solidjs/web'

import { ErrorFallback } from '@/components/organisms/ErrorFallback/index.tsx'

const HTTP_NOT_FOUND = 404

export const route = {
  preload: () => httpStatus(HTTP_NOT_FOUND)
} satisfies RouteDefinition

export default function NotFound() {
  return <ErrorFallback kind="not-found" />
}
