import type { ComponentProps, JSX } from '@solidjs/web'
import IconArrowLeft from '~icons/hugeicons/arrow-left-01'
import IconRefresh from '~icons/hugeicons/refresh'

import { m } from '@/paraglide/messages.js'

import type { ErrorFallbackKind } from './types.ts'

type ErrorFallbackContent = {
  badge: string
  title: string
  description: string
  actionLabel: string
  icon: (props: ComponentProps<'svg'>) => JSX.Element
}

export const ERROR_FALLBACK_CONTENT: Record<
  ErrorFallbackKind,
  ErrorFallbackContent
> = {
  'not-found': {
    badge: '404',
    get title() {
      return m.errorFallback_notFoundTitle()
    },
    get description() {
      return m.errorFallback_notFoundDescription()
    },
    get actionLabel() {
      return m.errorFallback_home()
    },
    icon: IconArrowLeft
  },
  runtime: {
    get badge() {
      return m.errorFallback_badge()
    },
    get title() {
      return m.errorFallback_runtimeTitle()
    },
    get description() {
      return m.errorFallback_runtimeDescription()
    },
    get actionLabel() {
      return m.errorFallback_reload()
    },
    icon: IconRefresh
  }
}
