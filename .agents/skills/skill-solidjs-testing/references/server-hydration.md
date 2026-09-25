# Servidor, stream e hidratação

Contratos na skill principal: [SSR e hidratação](../../skill-solidjs/references/12-ssr-and-hydration.md) e [server functions](../../skill-solidjs/references/13-server-functions-and-security.md).

## No Vitest

- `renderToString` e `renderToStream` rodam só no projeto `environment: 'node'` com o plugin.
- O HTML dos projetos de teste sai sem chaves `_hk`, mesmo com `solid({ ssr: true })`. Só `solid({ solid: { hydratable: true } })`, num projeto de servidor separado, devolve as chaves; asserções sobre HTML hidratável só valem nesse projeto.
- Hidratação de ponta a ponta fica fora do Vitest: teste no e2e contra o build ([páginas](pages-and-routes.md#e2e-com-playwright)). A verificação de hidratação roda num `setTimeout`; espere uma macrotask antes de afirmar ausência de mismatch.
- Para stream, leia o `readable` com um reader e um portão controlado pelo teste: o primeiro chunk traz o fallback, e o conteúdo chega depois da liberação.

```tsx
// tests/render.server.test.tsx
import { expect, test } from 'vitest'
import { Loading, createMemo, createSignal } from 'solid-js'
import { renderToStream, renderToString } from '@solidjs/web'

import { readRuntimeIdentity } from '../support/runtime-identity.ts'

test('canário: este projeto roda a postura servidor', () => {
  expect(readRuntimeIdentity()).toEqual({ isServer: true, dev: true, sameOwnerApi: true, hasDocument: false })
})

test('renderToString devolve HTML não hidratável em modo test', () => {
  const [count] = createSignal(0)
  const html = renderToString(() => (
    <main>
      <p>{count()}</p>
    </main>
  ))
  expect(html).toBe('<main><p>0</p></main>')
})

test('renderToStream envia o fallback de Loading antes do conteúdo', async () => {
  const gate = Promise.withResolvers<string>()
  const Async = () => {
    const value = createMemo(() => gate.promise)
    return <span>{value()}</span>
  }
  const stream = renderToStream(() => (
    <div>
      <Loading fallback={<i>wait</i>}>
        <Async />
      </Loading>
    </div>
  ))
  const reader = stream.readable.getReader()
  const decoder = new TextDecoder()
  const shell = decoder.decode((await reader.read()).value)
  expect(shell).toContain('<i>wait</i>')
  // '<span>ok</span>' only exists after the gate opens, so it could never fail.
  expect(shell).not.toContain('<span')
  gate.resolve('ok')
  let rest = ''
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    rest += decoder.decode(chunk.value)
  }
  expect(rest).toContain('<span>ok</span>')
})
```

## Server functions e request scope

Uma server function tem três provas separadas: a função de domínio, a chamada SSR direta e a chamada HTTP transformada. Fixture que chama a função original sem compilação só prova a primeira; a chamada HTTP pede o build e um servidor.

Para exercitar o handler dentro do Vitest, componha `createRequestEvent(request)` e `commitEventResponse(response, event)` de `@solidjs/web` com `provideRequestEvent` de `@solidjs/web/storage`:

- Configure um provedor de evento explícito: `configureServerFunctionsServer({ provideEvent: (event, fn) => provideRequestEvent(event, fn) })`. Sem ele, o resultado depende de `provideRequestEvent` já ter rodado antes no mesmo processo.
- Passe `createEvent` a `handleServerFunctionRequest`, não a `configureServerFunctionsServer`, e afirme um valor conhecido em `locals` antes de comparar identidades: com `locals` vazio, um teste de autorização passa com `undefined` dos dois lados.
- Teste uma guarda compartilhada pelo evento explícito e pelo escopo ambiente (`getRequestEvent()`); provada só num caminho, ela pode estar quebrada no outro.

| Fronteira | Observar |
| --- | --- |
| Sanitização | Corpo inteiro, HTML, chunks e payload serializado sem o marcador confidencial. Compare dev e produção: o dev preserva a mensagem original sob `Errored` e sob `Loading` sem `Errored` |
| Falha síncrona no render | Lança na própria chamada de `renderToString` ou `renderToStream`, antes de existir stream; a camada HTTP precisa proteger essa saída |
| Request scope | Duas requests concorrentes com estados distintos |
| `httpStatus` e `httpHeader` | Status e header de cada escopo antes e depois do descarte ([contrato](../../skill-solidjs/references/12-ssr-and-hydration.md#status-headers-cookies-e-cache)) |
| `clientOnly` | HTML do servidor só com o fallback e loader não chamado no servidor |

Nunca envie erro upstream ou credencial ao navegador para facilitar a asserção.
