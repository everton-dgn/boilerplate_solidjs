import { useLocation } from '@solidjs/router'
import { For, NoHydration } from 'solid-js'
import IconLanguage from '~icons/hugeicons/language-circle'

import { localizeHref } from '@/i18n/urls/index.ts'
import { m } from '@/paraglide/messages.js'
import {
  getLocale,
  type Locale,
  locales,
  setLocale
} from '@/paraglide/runtime.js'

import { Button } from '../Button/index.tsx'
import { DropdownMenu } from '../DropdownMenu/index.tsx'

import S from './styles.module.css'

export function LocaleSwitcher() {
  const location = useLocation()
  const labels = {
    pt: m.localeSwitcher_pt(),
    en: m.localeSwitcher_en(),
    es: m.localeSwitcher_es()
  } satisfies Record<Locale, string>
  const languages = locales.map(locale => ({
    value: locale,
    label: labels[locale]
  }))
  return (
    <>
      <DropdownMenu<Locale>
        label={m.localeSwitcher_label()}
        value={getLocale()}
        onChange={locale => {
          void setLocale(locale)
        }}
        items={languages}
        trigger={props => (
          <Button
            {...props}
            variant="ghost"
            size="icon"
            aria-label={m.localeSwitcher_select()}
          >
            <IconLanguage />
          </Button>
        )}
      />
      <NoHydration>
        <noscript>
          <nav class={S.fallback} aria-label={m.localeSwitcher_label()}>
            <For each={languages}>
              {language => (
                <a
                  href={localizeHref({
                    href: `${location.pathname}${location.search}`,
                    locale: language.value
                  })}
                  lang={language.value}
                  hreflang={language.value}
                  aria-current={
                    language.value === getLocale() ? 'page' : undefined
                  }
                >
                  {language.label}
                </a>
              )}
            </For>
          </nav>
        </noscript>
      </NoHydration>
    </>
  )
}
