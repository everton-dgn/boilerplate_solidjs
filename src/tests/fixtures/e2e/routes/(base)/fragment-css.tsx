import type { RouteDefinition } from '@solidjs/router'
import { createMemo, lazy, Loading, Show } from 'solid-js'

const DATA_DELAY_MS = 150

const FragmentCssPanel = lazy(
  () => import('../../fragment-css/FragmentCssPanel/index.tsx')
)

function loadLabel(): Promise<string> {
  // oxlint-disable-next-line promise/avoid-new -- Adapta o timer da fixture para suspender o SSR.
  return new Promise(resolve => {
    setTimeout(() => resolve('Fragmento resolvido'), DATA_DELAY_MS)
  })
}

// A memo assíncrona mantém o Loading pendente até depois do shell, e o
// componente lazy só é criado quando ela resolve. Assim a CSS dele entra no
// fragmento em streaming, num <link> com handlers inline, e não no <head>.
// A fixture usa de propósito o padrão que o AGENTS.md proíbe no app: ela
// reproduz o limite da CSP para o teste com test.fail() acusar a correção
// quando o runtime deixar de emitir esses handlers.
function DelayedPanel() {
  const label = createMemo(loadLabel)
  return (
    <section>
      <h2>{label()}</h2>
      <Show when={label()}>
        <FragmentCssPanel />
      </Show>
    </section>
  )
}

export const route = {
  info: {
    seo: {
      title: 'CSS de fragmento em streaming',
      description: 'Fixture de componente lazy com CSS dentro de um Loading.'
    }
  }
} satisfies RouteDefinition

export default function FragmentCssPage() {
  return (
    <main>
      <h1>CSS de fragmento em streaming</h1>
      <Loading fallback={<p>Carregando fragmento...</p>}>
        <DelayedPanel />
      </Loading>
    </main>
  )
}
