import { m } from '@paraglide/messages.js'
import {
  getLocale,
  type Locale,
  locales,
  setLocale
} from '@paraglide/runtime.js'

import { Button } from '../Button/index.tsx'
import { DropdownMenu } from '../DropdownMenu/index.tsx'
import { LOCALE_NAMES } from './constants.ts'

import S from './styles.module.css'

function makeLanguages() {
  return locales.map(locale => ({
    value: locale,
    label: LOCALE_NAMES[locale],
    icon: (
      <span class={S.code} aria-hidden="true">
        {locale.toUpperCase()}
      </span>
    )
  }))
}

export function LocaleSwitcher() {
  return (
    <DropdownMenu<Locale>
      label={m.localeSwitcher_label()}
      value={getLocale()}
      onChange={locale => setLocale(locale)}
      items={makeLanguages()}
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
  )
}
