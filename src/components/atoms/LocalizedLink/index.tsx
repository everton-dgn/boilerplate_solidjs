import { getLocale, type Locale } from '@paraglide/runtime.js'
import { useInRouter, useLocation, type TypedPath } from '@solidjs/router'
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

export function LocalizedLink(props: LocalizedLinkProps) {
  const location = useInRouter() ? useLocation() : undefined
  const nativeProps = omit(
    props,
    'href',
    'locale',
    'shouldLocalize',
    'target',
    'children'
  )
  const href = (): string => {
    const requestedHref = String(props.href)
    // Fragmentos no mesmo idioma ficam relativos, inclusive fora do Router,
    // onde não há página para resolvê-los.
    const isSameLocale =
      props.locale === undefined || props.locale === getLocale()
    if (
      isSameLocale &&
      (requestedHref === '' || requestedHref.startsWith('#'))
    ) {
      return requestedHref
    }
    return resolveLocalizedHref({
      href: requestedHref,
      locale: props.locale,
      shouldLocalize: props.shouldLocalize,
      base: location
        ? `${location.pathname}${location.search}${location.hash}`
        : undefined
    })
  }
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
