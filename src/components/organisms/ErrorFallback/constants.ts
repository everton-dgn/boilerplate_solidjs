import type { ComponentProps, JSX } from '@solidjs/web'
import IconArrowLeft from '~icons/hugeicons/arrow-left-01'
import IconRefresh from '~icons/hugeicons/refresh'

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
    title: 'Página não encontrada!',
    description:
      'A página que você procura não existe ou pode ter sido movida.',
    actionLabel: 'Voltar ao início',
    icon: IconArrowLeft
  },
  runtime: {
    badge: 'Erro!',
    title: 'Algo deu errado!',
    description: 'Não foi possível concluir sua solicitação. Tente novamente.',
    actionLabel: 'Recarregar página',
    icon: IconRefresh
  }
}
