import {
  action,
  query,
  useLocation,
  useNavigate,
  useSearchParams,
  type RouteDefinition
} from '@solidjs/router'
import { createMemo, createSignal, Loading } from 'solid-js'

import { m } from '@/paraglide/messages.js'
import { getLocale } from '@/paraglide/runtime.js'
import { createLocalizedNavigate } from '@/primitives/createLocalizedNavigate/index.ts'

import { redirectLocale } from '../../i18n/redirectLocale/index.ts'
import { redirectRelative } from '../../i18n/redirectRelative/index.ts'

const submitRedirect = action(redirectLocale, 'i18n-locale-redirect-action')
const readRedirect = query(redirectLocale, 'i18n-locale-redirect-query')
const submitRelative = action(redirectRelative, 'i18n-relative-redirect-action')

export const route = {
  info: { seo: { noindex: true } }
} satisfies RouteDefinition

export default function I18nRedirect() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const localizedNavigate = createLocalizedNavigate()
  const [requested, setRequested] = createSignal(params.initial === '1')
  const result = createMemo(() =>
    requested() ? readRedirect({ locale: 'es', source: 'query' }) : ''
  )
  return (
    <main>
      <h1>Locale redirect fixture</h1>
      <p data-testid="locale">{getLocale()}</p>
      <p data-testid="message">{m.home_title()}</p>
      <output data-testid="state">{JSON.stringify(location.state)}</output>
      <form
        action={submitRedirect.with({ locale: 'es', source: 'action' })}
        method="post"
      >
        <button type="submit">Spanish action redirect</button>
      </form>
      <form
        action={submitRedirect.with({ locale: 'pt', source: 'action' })}
        method="post"
      >
        <button type="submit">Portuguese action redirect</button>
      </form>
      <form action={submitRelative.with('query')} method="post">
        <button type="submit">Relative query redirect</button>
      </form>
      <form action={submitRelative.with('parent')} method="post">
        <button type="submit">Relative parent redirect</button>
      </form>
      <form action={submitRelative.with('fragment')} method="post">
        <button type="submit">Relative fragment redirect</button>
      </form>
      <form action={submitRelative.with('empty')} method="post">
        <button type="submit">Relative empty redirect</button>
      </form>
      <button type="button" onClick={() => setRequested(true)}>
        Spanish query redirect
      </button>
      <button
        type="button"
        onClick={() => localizedNavigate({ href: '#target' })}
      >
        Navigate fragment
      </button>
      <button type="button" onClick={() => localizedNavigate({ href: '' })}>
        Navigate empty
      </button>
      <button
        type="button"
        onClick={() =>
          navigate('/pt/i18n-redirect?from=state#target', {
            state: { marker: 'kept' }
          })
        }
      >
        Same locale state
      </button>
      <Loading fallback={<p>Redirecting</p>}>
        <span>{result()}</span>
      </Loading>
      <div id="target">Target</div>
    </main>
  )
}
