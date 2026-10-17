import { getLocale } from '@paraglide/runtime.js'
import {
  useParams,
  useSearchParams,
  type RouteDefinition
} from '@solidjs/router'
import { getRequestEvent, httpHeader, httpStatus } from '@solidjs/web'
import { createMemo, createSignal, Loading } from 'solid-js'

import { readBackend } from '../../../backend-error/readBackend/index.ts'
import { waitFixtureGate } from '../../../outside-error/waitFixtureGate/index.ts'

const HTTP_REDIRECT = 307
// A identidade persiste entre requisições para exercitar a deduplicação do hook.
const SHARED_ERROR = new Error('Reused fixture failure')

type FragmentProps = { id: string; label: string; scenario: string }

function Fragment(props: FragmentProps) {
  const marker = getRequestEvent()?.request.headers.get('x-markdown-private')
  const text = createMemo(async () => {
    const { id, scenario, label } = props
    if (id) await waitFixtureGate({ id, real: typeof marker === 'string' })
    if (scenario === 'error') {
      throw new Error(marker ?? 'Missing fixture marker')
    }
    if (scenario === 'shared-error') {
      SHARED_ERROR.message = marker ?? 'Missing fixture marker'
      throw SHARED_ERROR
    }
    if (scenario === 'server-error') await readBackend(`throw:${id}`)
    if (scenario === 'server-caught') {
      try {
        await readBackend(`throw:${id}`)
      } catch {
        return 'Recovered server function content'
      }
    }
    if (scenario === 'redirect') {
      httpStatus(HTTP_REDIRECT)
      httpHeader('location', `/${getLocale()}/about`)
    }
    return `${label}:${getLocale()}:resolved`
  })
  return <p data-fragment={props.label}>{text()}</p>
}

export const route = {
  info: {
    markdown: true,
    llms: false,
    seo: { title: 'HTML Markdown contract' }
  }
} satisfies RouteDefinition

export default function MarkdownContract() {
  const params = useParams()
  const [query] = useSearchParams()
  const [count, setCount] = createSignal(0)
  const id = String(query.id ?? '')
  return (
    <main>
      <p>Before the title</p>
      <h1>HTML Markdown contract: {params.slug}</h1>
      <nav>
        <a href="/noise">MENU_NOISE</a>
      </nav>
      <button type="button" onClick={() => setCount(value => value + 1)}>
        BUTTON_NOISE {count()}
      </button>
      <p hidden>HIDDEN_NOISE</p>
      <span aria-hidden="true">DECORATIVE_NOISE</span>
      <p data-md-exclude>EXCLUDED_NOISE</p>
      <template>TEMPLATE_NOISE</template>
      <p>
        Useful <a href="./relative?x=1&amp;y=2">contextual link</a>.
      </p>
      <Loading fallback={<p>FIRST_FALLBACK</p>}>
        <Fragment
          id={id ? `${id}:first` : ''}
          label="first"
          scenario={String(query.scenario ?? 'ok')}
        />
      </Loading>
      <Loading fallback={<p>SECOND_FALLBACK</p>}>
        <Fragment id={id ? `${id}:second` : ''} label="second" scenario="ok" />
      </Loading>
      <ul>
        <li>List item A</li>
        <li>List item B</li>
      </ul>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>pipe | literal</td>
            <td>42</td>
          </tr>
        </tbody>
      </table>
      <pre>
        <code class="language-ts">{'const x = `value`;\nconsole.log(x)'}</code>
      </pre>
      <footer>
        <p>
          Contextual citation{' '}
          <a href="https://example.org/reference">reference</a>.
        </p>
      </footer>
    </main>
  )
}
