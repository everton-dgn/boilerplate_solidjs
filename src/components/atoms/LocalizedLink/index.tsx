import { getLocale, type Locale } from '@paraglide/runtime.js'
import { useLocation, type TypedPath } from '@solidjs/router'
import type { JSX } from '@solidjs/web'
import { omit } from 'solid-js'

import { resolveLocalizedHref } from '@/i18n/urls/index.ts'

type LocalizedLinkProps = Omit<
  JSX.AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> & {
  href: string | TypedPath
  locale?: Locale
  /** Use false para preservar URLs de endpoints e arquivos estáticos e navegar fora da SPA. */
  shouldLocalize?: boolean
}

function optionalLocation() {
  try {
    return useLocation()
  } catch {
    // Como na consulta opcional de contexto do Router, a ausência é válida aqui.
    return null
  }
}

/** Links relativos à raiz funcionam sem Router, inclusive na tela de erro da raiz. */
export function LocalizedLink(props: LocalizedLinkProps) {
  const location = optionalLocation()
  const nativeProps = omit(
    props,
    'href',
    'locale',
    'shouldLocalize',
    'target',
    'children'
  )
  const href = () =>
    resolveLocalizedHref({
      href: String(props.href),
      locale: props.locale,
      shouldLocalize: props.shouldLocalize,
      base: location
        ? `${location.pathname}${location.search}${location.hash}`
        : undefined
    })
  const shouldUseDocumentNavigation = () =>
    props.shouldLocalize === false ||
    (props.locale !== undefined && props.locale !== getLocale())
  const target = () => {
    if (props.target !== undefined && props.target !== '') return props.target
    return shouldUseDocumentNavigation() ? '_self' : undefined
  }

  return (
    <a {...nativeProps} href={href()} target={target()}>
      {props.children}
    </a>
  )
}
