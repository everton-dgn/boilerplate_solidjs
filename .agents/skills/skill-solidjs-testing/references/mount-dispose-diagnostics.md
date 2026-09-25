# Montagem, contexto, diagnósticos e halt

Códigos de diagnóstico e reparo: [diagnósticos](../../skill-solidjs/references/15-diagnostics-checklists-and-recipes.md#diagnósticos-de-corretude-e-reparo) da skill principal.

## Montar com descarte garantido

`render()` chama `flush()` antes de retornar, então o DOM inicial já existe no retorno. O helper registra o descarte antes de montar, para que uma árvore que lança não deixe host para trás:

```tsx
// support/mount.tsx
import { onTestFinished } from 'vitest'
import { render } from '@solidjs/web'
import type { JSX } from '@solidjs/web'

export type Mounted = { host: HTMLDivElement; dispose: () => void }

export const mount = (ui: () => JSX.Element): Mounted => {
  const host = document.createElement('div')
  document.body.append(host)
  let disposeRoot: (() => void) | undefined
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    disposeRoot?.()
    host.remove()
  }
  onTestFinished(dispose)
  disposeRoot = render(ui, host)
  return { host, dispose }
}
```

Primitives fora de componente usam `createRoot(dispose => ...)`, com `dispose()` no fim ou `onTestFinished(dispose)` logo depois ([receita](reactivity.md#receita-primitive-sob-createroot)).

Ordem dos hooks do Vitest: `afterEach` roda antes de `onTestFinished`, e os `onTestFinished` rodam em ordem reversa ao registro. Spy ou global restaurado em `afterEach` perde o que o descarte da árvore registra; quando o descarte depende dele, restaure num `onTestFinished` registrado antes de `mount()`.

## Contexto

O contexto é o próprio provider (`<Ctx value={...}>`, sem `.Provider`). Monte o componente dentro do provider real, não de um default falso: um default esconde a falta do provider obrigatório. Para testar uma primitive que lê contexto, use um componente sonda que a chama e expõe o resultado.

```tsx
// tests/preferences.dom.test.tsx
import { expect, test } from 'vitest'
import { createContext, createSignal, flush, useContext } from 'solid-js'
import type { Accessor, ParentComponent } from 'solid-js'
import type { JSX } from '@solidjs/web'

import { mount } from '../support/mount.tsx'

type Preferences = { theme: Accessor<'light' | 'dark'>; toggle: () => void }

const PreferencesContext = createContext<Preferences>()

const PreferencesProvider: ParentComponent = props => {
  const [theme, setTheme] = createSignal<'light' | 'dark'>('light')
  const value: Preferences = {
    theme,
    toggle: () => setTheme(current => (current === 'light' ? 'dark' : 'light'))
  }
  return <PreferencesContext value={value}>{props.children}</PreferencesContext>
}

const usePreferences = (): Preferences => useContext(PreferencesContext)

const ThemeButton = (): JSX.Element => {
  const preferences = usePreferences()
  return (
    <button type="button" onClick={preferences.toggle}>
      {preferences.theme()}
    </button>
  )
}

test('o componente lê e altera o contexto do provider real', () => {
  const { host } = mount(() => (
    <PreferencesProvider>
      <ThemeButton />
    </PreferencesProvider>
  ))
  const button = host.querySelector('button')
  expect(button?.textContent).toBe('light')
  button?.click()
  flush()
  expect(button?.textContent).toBe('dark')
})

test('a primitive é lida por um componente sonda dentro do provider', () => {
  let preferences: Preferences | undefined
  const Probe = (): JSX.Element => {
    preferences = usePreferences()
    return null
  }
  mount(() => (
    <PreferencesProvider>
      <Probe />
    </PreferencesProvider>
  ))
  expect(preferences?.theme()).toBe('light')
  preferences?.toggle()
  flush()
  expect(preferences?.theme()).toBe('dark')
})

test('sem provider, o hook lança ContextNotFoundError', () => {
  let failure: unknown
  const Probe = (): JSX.Element => {
    try {
      usePreferences()
    } catch (error) {
      failure = error
    }
    return null
  }
  mount(() => <Probe />)
  expect(failure instanceof Error ? failure.constructor.name : undefined).toBe('ContextNotFoundError')
})
```

A classe `ContextNotFoundError` não é exportada: compare `constructor.name`.

## Capturar diagnósticos

Os diagnósticos do build dev saem no console com prefixo `[CODE]`: `console.error` para severidade erro e `console.warn` para as demais. Para diagnósticos de erro que não passam por esse relatório, como o halt, o rodapé `repair guide` chega sozinho em `console.warn` numa microtask, uma vez por código e por instância do motor. Por isso a captura só restaura o console depois de uma microtask:

```ts
// support/capture-console.ts
type ConsoleLevel = 'warn' | 'error'

export type ConsoleEntry = { level: ConsoleLevel; text: string }

export type ConsoleCapture = {
  entries: ConsoleEntry[]
  codes: () => string[]
  uncoded: () => string[]
  restore: () => Promise<void>
}

type ConsoleMethod = (...args: unknown[]) => void

const FOOTER = /^\[[A-Z][A-Z0-9_]*\] repair guide:/
const CODE = /^\[([A-Z][A-Z0-9_]*)\]/

const readCode = (entry: ConsoleEntry): string | undefined => CODE.exec(entry.text)?.[1]

export const captureConsole = (): ConsoleCapture => {
  const entries: ConsoleEntry[] = []
  const originalWarn: ConsoleMethod = console.warn
  const originalError: ConsoleMethod = console.error
  console.warn = (...args: unknown[]) => {
    entries.push({ level: 'warn', text: args.map(String).join(' ') })
  }
  console.error = (...args: unknown[]) => {
    entries.push({ level: 'error', text: args.map(String).join(' ') })
  }
  return {
    entries,
    codes: () =>
      entries
        .filter(entry => !FOOTER.test(entry.text))
        .map(readCode)
        .filter((code): code is string => code !== undefined),
    // codes() ignores entries without a leading [CODE]; pair it with uncoded().
    uncoded: () =>
      entries.filter(entry => !FOOTER.test(entry.text) && readCode(entry) === undefined).map(entry => entry.text),
    restore: async () => {
      await Promise.resolve()
      console.warn = originalWarn
      console.error = originalError
    }
  }
}
```

"Zero diagnósticos" só prova algo quando o mesmo projeto mostra o build dev (canário `DEV`), a captura viva (um negativo intencional com o código esperado) e o descarte da árvore dentro da captura (`dispose()` explícito antes de `restore()`). Negativos que funcionam por projeto: `NO_OWNER_EFFECT` no grafo cliente, `STRICT_READ_UNTRACKED` em happy-dom e Chromium, `SERVER_WRITE` no servidor.

```tsx
// tests/diagnostics.dom.test.tsx
import { expect, test } from 'vitest'
import * as solid from 'solid-js'
import { createSignal, flush } from 'solid-js'

import { Counter } from '../fixtures/Counter.tsx'
import { captureConsole } from '../support/capture-console.ts'
import { mount } from '../support/mount.tsx'

test('canário: o build dev está carregado', () => {
  expect(solid.DEV).toBeDefined()
})

test('negativo intencional: a captura vê STRICT_READ_UNTRACKED', async () => {
  const capture = captureConsole()
  const [value] = createSignal(1)
  const TopLevelRead = () => {
    const snapshot = value()
    return <p>{snapshot}</p>
  }
  mount(() => <TopLevelRead />)
  await capture.restore()
  expect(capture.codes()).toEqual(['STRICT_READ_UNTRACKED'])
  expect(capture.uncoded()).toEqual([])
})

test('cenário limpo: zero diagnósticos depois de uma atualização real', async () => {
  const capture = captureConsole()
  const { host, dispose } = mount(() => <Counter />)
  host.querySelector('button')?.click()
  flush()
  expect(host.textContent).toBe('n=1')
  // Dispose inside the capture: mount()'s onTestFinished runs after restore.
  dispose()
  await capture.restore()
  expect(capture.entries).toEqual([])
})
```

`Errored` no build dev registra o erro original com `console.error` quando o fallback é elemento ou função sem parâmetro, e não registra quando o fallback recebe o erro. Num teste com fallback estático, exija essa entrada exata em vez de aceitar console sujo.

## Halt reativo

Um erro não contido em effect ou cálculo interrompe o agendador do módulo inteiro. O halt passa para o teste seguinte do mesmo arquivo: aparece `[REACTIVITY_HALTED] Update ignored` e o effect novo nunca aplica, sem reprovar se o teste não tiver asserção positiva.

- `render()` reseta o halt ao montar, só no build dev. `createRoot` nunca reseta: teste de primitive não se recupera sozinho.
- Teste que provoca halt de propósito registra `onTestFinished(() => resetErrorHalt())`. Quando o halt não é o assunto, contenha o erro com `Errored` e fallback que recebe o erro.
- Nós criados durante o halt ficam instáveis depois do reset; recrie a árvore.
- No Chromium o halt chega a `reportError`: o run sai com código 1 e o teste verde. Num teste de browser que provoca halt de propósito, escute `error` em `globalThis`, chame `preventDefault()` e remova o listener num `onTestFinished`.
- Sem `test.concurrent` nem `describe.concurrent` em arquivos que tocam o grafo: um teste em voo herda o halt de outro.

```ts
// tests/halt.dom.test.ts
import { expect, onTestFinished, test } from 'vitest'
import { createEffect, createRoot, createSignal, flush, resetErrorHalt } from 'solid-js'

import { captureConsole } from '../support/capture-console.ts'

const readApplied = (): number[] => {
  const [value, setValue] = createSignal(1)
  const applied: number[] = []
  const dispose = createRoot(disposeRoot => {
    createEffect(
      () => value(),
      next => {
        applied.push(next)
      }
    )
    return disposeRoot
  })
  flush()
  setValue(2)
  flush()
  dispose()
  return applied
}

test('o teste que provoca halt reseta em onTestFinished', async () => {
  onTestFinished(() => resetErrorHalt())
  const capture = captureConsole()
  const [value, setValue] = createSignal(0)
  createRoot(() => {
    createEffect(
      () => value(),
      next => {
        if (next === 1) throw new Error('boom')
      }
    )
  })
  flush()
  setValue(1)
  expect(() => flush()).toThrow('boom')
  await capture.restore()
  expect(capture.codes()).toEqual(['REACTIVITY_HALTED'])
})

test('o teste seguinte roda num grafo vivo', () => {
  expect(readApplied()).toEqual([1, 2])
})
```

O segundo teste é o controle: sem o `resetErrorHalt()` ele reprova com `[]`.
