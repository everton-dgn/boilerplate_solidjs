import { createSignal } from 'solid-js'

import { getServerInfo } from '../api.ts'

export default function Home() {
  const [count, setCount] = createSignal(0)
  const [info, setInfo] = createSignal('')

  const handleServerInfoClick = async (): Promise<void> => {
    try {
      setInfo(await getServerInfo())
    } catch (error: unknown) {
      setInfo(
        error instanceof Error ? error.message : 'Erro ao chamar o servidor'
      )
    }
  }

  return (
    <section>
      <h1>SolidJS 2 + Vite+</h1>
      <p>
        Edite <code>src/routes/index.tsx</code> e salve para testar o{' '}
        <code>HMR</code>.
      </p>

      <div class="actions">
        <button
          type="button"
          class="counter"
          onClick={() => setCount(count() + 1)}
        >
          Count is {count()}
        </button>

        <button type="button" class="counter" onClick={handleServerInfoClick}>
          Chamar o servidor
        </button>
      </div>

      <p>{info()}</p>
    </section>
  )
}
