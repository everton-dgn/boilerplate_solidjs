import type { RouteDefinition } from '@solidjs/router'
import { httpStatus } from '@solidjs/web'

import { ErrorFallback } from '@/components/organisms/ErrorFallback/index.tsx'
import { m } from '@/paraglide/messages.js'

const HTTP_NOT_FOUND = 404

export const route = {
  preload: () => httpStatus(HTTP_NOT_FOUND),
  info: {
    seo: {
      get title() {
        return m.notFound_title()
      },
      get description() {
        return m.notFound_description()
      },
      noindex: true
    }
  }
} satisfies RouteDefinition

export default function NotFound() {
  return <ErrorFallback kind="not-found" />
}
