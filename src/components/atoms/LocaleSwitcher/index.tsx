import { m } from '@paraglide/messages.js'
import {
  getLocale,
  type Locale,
  locales,
  setLocale
} from '@paraglide/runtime.js'
import { useLocation } from '@solidjs/router'
import { For, NoHydration } from 'solid-js'

import { localizeHref } from '@/i18n/urls/index.ts'

import { Button } from '../Button/index.tsx'
import { DropdownMenu } from '../DropdownMenu/index.tsx'
import { LOCALE_NAMES } from './constants.ts'

import S from './styles.module.css'

export function LocaleSwitcher() {
  const location = useLocation()
  return (
    <>
      <DropdownMenu<Locale>
        class="js_only"
        label={m.localeSwitcher_label()}
        value={getLocale()}
        onChange={locale => setLocale(locale)}
        items={locales.map(locale => ({
          value: locale,
          label: LOCALE_NAMES[locale],
          icon: (
            <span class={S.code} aria-hidden="true">
              {locale.toUpperCase()}
            </span>
          )
        }))}
        trigger={props => (
          <Button
            {...props}
            variant="ghost"
            size="icon"
            aria-label={m.localeSwitcher_select({
              code: getLocale().toUpperCase()
            })}
          >
            {getLocale().toUpperCase()}
          </Button>
        )}
      />
      <NoHydration>
        <noscript>
          <nav class={S.fallback} aria-label={m.localeSwitcher_label()}>
            <For each={locales}>
              {locale => (
                <a
                  href={localizeHref({
                    href: `${location.pathname}${location.search}`,
                    locale
                  })}
                  lang={locale}
                  hreflang={locale}
                  aria-current={locale === getLocale() ? 'page' : undefined}
                >
                  {LOCALE_NAMES[locale]}
                </a>
              )}
            </For>
          </nav>
        </noscript>
      </NoHydration>
    </>
  )
}
