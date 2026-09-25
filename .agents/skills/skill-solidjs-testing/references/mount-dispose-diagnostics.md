# Montagem, contexto, diagnósticos e halt

Códigos de diagnóstico e reparo: [diagnósticos](../../skill-solidjs/references/15-diagnostics-checklists-and-recipes.md#diagnósticos-de-corretude-e-reparo) da skill principal.

## Montar com descarte garantido

Reutilize o helper de render do projeto. Na falta dele, esta receita registra o descarte antes de montar. `render()` chama `flush()` antes de retornar, então o DOM inicial já existe no retorno:

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

O contexto é o próprio provider, sem `.Provider`. Uma primitive que lê contexto precisa ser chamada por componente sonda dentro do provider real. Sem default nem provider, `useContext` lança `ContextNotFoundError`; a classe não é exportada, então compare `constructor.name`. Contrato em [contexto](../../skill-solidjs/references/04-components-props-and-context.md#contexto).

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

A captura precisa cobrir `dispose()` e a microtask antes de `restore()`. Ao configurar ou investigar uma captura que retorna zero, confira o build dev e um negativo conhecido: `NO_OWNER_EFFECT` no grafo cliente, `STRICT_READ_UNTRACKED` no DOM ou `SERVER_WRITE` no servidor. Reutilize o controle do harness existente.

`Errored` no build dev registra o erro original com `console.error` quando o fallback é elemento ou função sem parâmetro, e não registra quando o fallback recebe o erro. Num teste com fallback estático, exija essa entrada exata em vez de aceitar console sujo.

## Halt reativo

Um erro não contido em effect ou cálculo interrompe o agendador do módulo inteiro. O halt passa para o teste seguinte do mesmo arquivo: aparece `[REACTIVITY_HALTED] Update ignored` e o effect novo nunca aplica, sem reprovar se o teste não tiver asserção positiva.

- `render()` reseta o halt ao montar, só no build dev. `createRoot` nunca reseta: teste de primitive não se recupera sozinho.
- Teste que provoca halt de propósito registra `onTestFinished(() => resetErrorHalt())`. Quando o halt não é o assunto, contenha o erro com `Errored` e fallback que recebe o erro.
- Nós criados durante o halt ficam instáveis depois do reset; recrie a árvore.
- No Chromium o halt chega a `reportError`: o run sai com código 1 e o teste verde. Num teste de browser que provoca halt de propósito, escute `error` em `globalThis`, chame `preventDefault()` e remova o listener num `onTestFinished`.
- Sem `test.concurrent` nem `describe.concurrent` em arquivos que tocam o grafo: um teste em voo herda o halt de outro.
