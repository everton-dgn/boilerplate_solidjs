# Ambientes: happy-dom, jsdom e browser mode

A tabela de camadas está no [SKILL.md](../SKILL.md#menor-camada-que-observa-o-contrato) e a configuração dos projetos em [Vitest](vitest-config.md).

## happy-dom

- Canário: `navigator.userAgent` contém `HappyDOM`.
- Número como filho único não serve de oráculo: `<p>{count()}</p>` que começa em 0 renderiza vazio, e a atualização seguinte lança `TypeError: Cannot set properties of null (setting 'data')` e para a reatividade com `REACTIVITY_HALTED`. O Chromium mantém `'0'`. Teste números como filho único no browser mode.
- Não existe `reportError` ([halt](mount-dispose-diagnostics.md#halt-reativo)).
- O plugin injeta `@testing-library/jest-dom/vitest` em `setupFiles` quando o pacote está instalado. Só deixa de injetar quando algum caminho de `setupFiles` contém `jest-dom`; não registre os matchers de novo.
- `toHaveTextContent` com string faz casamento parcial no Vitest 4, inclusive em `expect.element`: `'n=1'` combina com `'n=10'`. Quando o valor exato é o contrato, use `textContent` com `toBe` ou regex ancorada (`/^n=1$/`).
- Foco numa `<For>` com chave dá o mesmo resultado em happy-dom e Chromium, então happy-dom serve de oráculo nesse caso.
- `PointerEvent`, `ResizeObserver` e `IntersectionObserver` existem nativamente. Um `PointerEvent` sintético só atravessa shadow root com `composed: true`.

## jsdom

Número como filho único, foco, `FormData`, `PointerEvent`, `ResizeObserver` e `IntersectionObserver` não foram testados em jsdom, e os três últimos podem exigir polyfill; não use jsdom como oráculo desses casos sem prova própria. Não instale jsdom se o projeto usa happy-dom e a prova cabe nele.

## Browser mode

Chromium via provider Playwright. Depois de `await userEvent.click()` o DOM já está assentado. O plugin não injeta jest-dom em projeto com `browser.enabled`; as asserções vêm de `expect.element`.

## Tipos do jest-dom

A injeção do plugin acontece só em runtime. Para o `tsc` aceitar `toHaveTextContent` e os demais matchers, inclua `"types": ["@testing-library/jest-dom/vitest"]` no tsconfig dos testes. Armadilha: um import de `@vitest/browser-playwright` em qualquer arquivo do programa, inclusive o `vitest.config.ts`, também declara esses matchers e mascara a falta.

## Receita: componente em happy-dom

```tsx
// fixtures/Counter.tsx
import { createSignal } from 'solid-js'
import type { JSX } from '@solidjs/web'

export const Counter = (): JSX.Element => {
  const [count, setCount] = createSignal(0)
  return (
    <button type="button" onClick={() => setCount(value => value + 1)}>
      n={count()}
    </button>
  )
}
```

```tsx
// tests/counter.dom.test.tsx
import { expect, test } from 'vitest'
import { createSignal, flush } from 'solid-js'
import type { JSX } from '@solidjs/web'

import { Counter } from '../fixtures/Counter.tsx'
import { mount } from '../support/mount.tsx'
import { readRuntimeIdentity } from '../support/runtime-identity.ts'

type GreetingProps = { name: string }

const Greeting = (props: GreetingProps): JSX.Element => <p>Hello {props.name}</p>

test('canário: cliente, build dev, motor único', () => {
  expect(readRuntimeIdentity()).toEqual({ isServer: false, dev: true, sameOwnerApi: true, hasDocument: true })
})

test('o clique atualiza o contador depois de flush()', () => {
  const { host } = mount(() => <Counter />)
  const button = host.querySelector('button')
  expect(button?.textContent).toBe('n=0')
  button?.click()
  flush()
  expect(button?.textContent).toBe('n=1')
})

test('a prop muda o mesmo nó, sem remontar', () => {
  const [name, setName] = createSignal('Ada')
  const { host } = mount(() => <Greeting name={name()} />)
  const paragraph = host.querySelector('p')
  setName('Grace')
  flush()
  expect(host.querySelector('p')).toBe(paragraph)
  expect(paragraph?.textContent).toBe('Hello Grace')
})
```

## Receita: browser mode com userEvent

```tsx
// tests/counter.browser.test.tsx
import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { createSignal, flush } from 'solid-js'

import { Counter } from '../fixtures/Counter.tsx'
import { mount } from '../support/mount.tsx'

test('await userEvent.click() retorna com o DOM assentado', async () => {
  const { host } = mount(() => <Counter />)
  await userEvent.click(page.getByRole('button'))
  expect(host.textContent).toBe('n=1')
  await expect.element(page.getByRole('button')).toHaveTextContent(/^n=1$/)
})

test('um número como filho único mantém 0 no Chromium', () => {
  const [count, setCount] = createSignal(0)
  const { host } = mount(() => <p>{count()}</p>)
  expect(host.textContent).toBe('0')
  setCount(5)
  flush()
  expect(host.textContent).toBe('5')
})
```

## Formulários

Confira o payload com `FormData`, além de ARIA e aparência. Testar só `checked` pode passar pela alteração nativa do navegador com o handler reativo quebrado: marque, desmarque e desabilite, e confira a inclusão e a remoção do campo. Contrato em [formulários](../../skill-solidjs/references/11-forms-and-accessibility.md).

## Portal

Um teste de Portal observa o evento no conteúdo montado fora do host, o contexto herdado do ramo lógico, a atualização e nenhum nó do Portal no alvo depois do descarte. Esses pontos foram observados no Chromium; happy-dom não foi usado como oráculo de Portal.
