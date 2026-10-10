import { query, type RouteDefinition } from '@solidjs/router'
import { createMemo, createSignal, Loading } from 'solid-js'

import { readLocaleTitle } from '../../i18n/readLocaleTitle/index.ts'

const getTitle = query(readLocaleTitle, 'i18n-action-title')

export const route = {
  info: { seo: { noindex: true } }
} satisfies RouteDefinition

export default function I18nAction() {
  const [requested, setRequested] = createSignal(false)
  const title = createMemo(() => (requested() ? getTitle() : ''))
  return (
    <main>
      <h1>Server locale</h1>
      <button type="button" onClick={() => setRequested(true)}>
        Read server locale
      </button>
      <Loading fallback={<p>Loading</p>}>
        <p>{title()}</p>
      </Loading>
    </main>
  )
}
