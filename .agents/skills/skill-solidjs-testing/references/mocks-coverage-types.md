# Mocks, bibliotecas auxiliares e tipos

## Mock na fronteira de I/O

Mocke o adapter de HTTP, SDK ou banco. Nunca mocke `solid-js` nem `@solidjs/web`: o teste deixaria de exercitar o motor. Alias para módulo virtual ou de fronteira, como `server-only` ou rotas geradas, é legítimo quando substitui algo que o teste não quer provar.

```ts
// fixtures/weather-adapter.ts
export const fetchTemperature = async (city: string): Promise<number> => {
  const response = await fetch(`https://weather.invalid/${encodeURIComponent(city)}`)
  return Number(await response.json())
}

export const formatTemperature = (celsius: number): string => `${celsius.toFixed(0)}°C`
```

```tsx
// fixtures/WeatherPanel.tsx
import { Loading, createMemo } from 'solid-js'
import type { JSX } from '@solidjs/web'

import { fetchTemperature, formatTemperature } from './weather-adapter.ts'

type WeatherPanelProps = { city: string }

export const WeatherPanel = (props: WeatherPanelProps): JSX.Element => {
  const temperature = createMemo(() => fetchTemperature(props.city))
  return (
    <Loading fallback={<p>loading</p>}>
      <p>{props.city}: {formatTemperature(temperature())}</p>
    </Loading>
  )
}
```

```tsx
// tests/weather.dom.test.tsx
import { expect, test, vi } from 'vitest'

import { WeatherPanel } from '../fixtures/WeatherPanel.tsx'
import { mount } from '../support/mount.tsx'

type FetchTemperature = (city: string) => Promise<number>
type AdapterModule = typeof import('../fixtures/weather-adapter.ts')

const mocks = vi.hoisted(() => ({ fetchTemperature: vi.fn<FetchTemperature>() }))

vi.mock('../fixtures/weather-adapter.ts', async importOriginal => ({
  ...(await importOriginal<AdapterModule>()),
  fetchTemperature: mocks.fetchTemperature
}))

test('o painel mostra o fallback e depois o valor do adapter', async () => {
  const response = Promise.withResolvers<number>()
  mocks.fetchTemperature.mockReturnValueOnce(response.promise)
  const { host } = mount(() => <WeatherPanel city="Porto" />)
  expect(host.textContent).toBe('loading')
  expect(mocks.fetchTemperature).toHaveBeenCalledExactlyOnceWith('Porto')
  response.resolve(18.6)
  await expect.poll(() => host.textContent).toBe('Porto: 19°C')
})
```

`vi.stubGlobal('fetch', ...)` não se restaura sozinho, salvo `unstubGlobals: true` na config: sem `vi.unstubAllGlobals()` no `afterEach`, o stub segue ativo nos testes seguintes do arquivo.

## `vi.resetModules` e instâncias do motor

Na postura servidor o plugin faz inline de `solid-js` e `@solidjs/web`, então `vi.resetModules()` seguido de `import('solid-js')` avalia um segundo motor: o owner de uma instância fica invisível para a outra, sem aviso. Na postura cliente o `solid-js` é externo e continua o mesmo. Ao reimportar um módulo que captura env, reimporte no mesmo lote o motor e todo consumidor.

## Bibliotecas auxiliares

Confira o canal com `npm view <pacote> dist-tags` e peça autorização antes de instalar.

- `@solidjs/testing-library`: a tag `latest` é da linha do Solid 1; a tag `next` declara peers de Solid 2. Na `next`, o DOM continua antigo depois de `fireEvent.click` até `flush()`, o cleanup automático só roda com `globals: true` e `render(..., { hydrate: true })` lança na postura de teste. O helper `mount` de [montagem](mount-dispose-diagnostics.md#montar-com-descarte-garantido) cobre o caso comum sem dependência nova.
- `@solidjs/diagnostics`: matchers de diagnóstico para Vitest; exige o build dev de `@solidjs/signals` e a mesma versão do `solid-js`. Confira exports no pacote instalado antes de usar.

## Testes de tipo

`expectTypeOf` é apagado em runtime: `vitest run` passa mesmo com asserção de tipo errada. O teste só prova tipos quando o `tsc` do projeto inclui o arquivo. Uma asserção errada de propósito com `@ts-expect-error` é o controle.

```ts
// tests/types.dom.test.ts
import { expectTypeOf, test } from 'vitest'
import { createMemo, createSignal } from 'solid-js'
import type { Signal, SourceAccessor } from 'solid-js'

test('tipos são provados pelo tsc, não pelo vitest run', () => {
  expectTypeOf(createSignal(0)).toEqualTypeOf<Signal<number>>()
  expectTypeOf(createMemo(() => 'text')).toEqualTypeOf<SourceAccessor<string>>()
  // @ts-expect-error: wrong on purpose; tsc fails if this ever type-checks.
  expectTypeOf(createMemo(() => 'text')).toEqualTypeOf<SourceAccessor<number>>()
})
```
