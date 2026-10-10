import { useLocation, type TypedPath } from '@solidjs/router'
import type { JSX } from '@solidjs/web'
import { omit } from 'solid-js'

import { resolveLocalizedHref } from '@/i18n/urls/index.ts'
import { getLocale, type Locale } from '@/paraglide/runtime.js'

type LocalizedLinkProps = Omit<
  JSX.AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> & {
  href: string | TypedPath
  locale?: Locale
  /** Disable localization and SPA interception for endpoints and assets. */
  localize?: boolean
}

function optionalLocation() {
  try {
    return useLocation()
  } catch {
    // Like the Router's optional context lookup, absence is valid here.
    return null
  }
}

/** Root-relative links work without a Router, including the root error fallback. */
export function LocalizedLink(props: LocalizedLinkProps) {
  const location = optionalLocation()
  const nativeProps = omit(
    props,
    'href',
    'locale',
    'localize',
    'target',
    'children'
  )
  const href = () =>
    resolveLocalizedHref({
      href: String(props.href),
      locale: props.locale,
      localize: props.localize,
      base: location
        ? `${location.pathname}${location.search}${location.hash}`
        : undefined
    })
  const documentNavigation = () =>
    props.localize === false ||
    (props.locale !== undefined && props.locale !== getLocale())
  const target = () => {
    if (props.target !== undefined && props.target !== '') return props.target
    return documentNavigation() ? '_self' : undefined
  }

  return (
    <a {...nativeProps} href={href()} target={target()}>
      {props.children}
    </a>
  )
}
