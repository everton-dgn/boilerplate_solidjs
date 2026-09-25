# Configuração do Vitest para Solid 2

As versões verificadas constam no [frontmatter da skill](../SKILL.md). Depois de atualizar dependências, rode os canários antes de confiar nesta página.

## Postura decidida por projeto

O `@solidjs/vite-plugin` decide a postura no hook `config`, a partir do `test.environment` declarado no próprio projeto. Projetos que transformam TSX ou exercitam o runtime Solid precisam da sua instância de `solid()`. Um projeto Node de módulos sem TSX nem grafo pode dispensá-la.

| Projeto | Postura | Use para |
| --- | --- | --- |
| Sem `environment`, com `extends: true` | cliente em Node, sem DOM | signals, memos, effects, stores, actions |
| `environment: 'happy-dom'` (ou `'jsdom'`) | cliente; jest-dom injetado se instalado | componentes, páginas com router em memória |
| `browser.enabled` com Chromium | cliente | eventos reais, foco, layout, números no DOM |
| `environment: 'node'` | servidor (`server.dev.js`) | `renderToString`, `renderToStream`, módulos de servidor |
| Sem `environment` e sem `extends` | o plugin preenche `jsdom` | evite: o ambiente fica implícito |

Armadilhas de postura errada:

- Primitive num projeto `node`: o memo não recalcula (2 em vez de 4), o effect nunca aplica e o setter avisa `SERVER_WRITE`.
- Projeto `node` sem o plugin não transforma TSX. Ele continua certo para módulos de servidor sem TSX nem grafo reativo.
- `renderToString` num projeto DOM devolve `undefined` e registra `renderToString is not supported in the browser`.
- Projeto inline sem `extends` não herda `resolve`, `alias`, `define` nem `plugins` da raiz: aliases como `@/` falham até repetir a config.

## Configuração de referência

Mescle com a configuração do projeto; não substitua o `vite.config.ts`.

```ts
// vitest.config.ts
import solid from '@solidjs/vite-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// In mode 'test' the plugin compiles with hydratable: false, even with ssr: true.
export default defineConfig({
  test: {
    projects: [
      {
        // No `environment`: 'node' would switch the plugin to the server posture.
        extends: true,
        plugins: [solid()],
        test: { name: 'client-graph', include: ['tests/**/*.graph.test.ts'] }
      },
      {
        plugins: [solid()],
        test: { name: 'dom', environment: 'happy-dom', include: ['tests/**/*.dom.test.{ts,tsx}'] }
      },
      {
        plugins: [solid()],
        test: {
          name: 'browser',
          include: ['tests/**/*.browser.test.{ts,tsx}'],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] }
        }
      },
      {
        plugins: [solid()],
        test: { name: 'server', environment: 'node', include: ['tests/**/*.server.test.{ts,tsx}'] }
      }
    ]
  }
})
```

Em pacote symlinkado ou monorepo, confira que `solid-js`, `@solidjs/web` e `@solidjs/signals` resolvem para uma cópia só; use `resolve.dedupe` quando o canário indicar `sameOwnerApi: false`.

## Contagem por projeto

`passWithNoTests: false` só reprova quando nenhum projeto coleta arquivo; um projeto com `include` errado coleta zero e o run passa calado. Confira a contagem com `vitest list --json` agrupando por `projectName`, ou rode `vitest run --project <nome>` no CI, que sai com 1 quando o projeto está vazio.

## Canário de postura

Ao criar ou alterar a configuração, ou investigar um teste que usa o build errado, confira postura, build e instância única. Reutilize o canário do projeto, se houver; na falta dele, esta receita fornece a identificação:

```ts
// support/runtime-identity.ts
import * as solid from 'solid-js'
import { getOwner } from 'solid-js'
import { getOwner as webGetOwner, isServer } from '@solidjs/web'

export type RuntimeIdentity = { isServer: boolean; dev: boolean; sameOwnerApi: boolean; hasDocument: boolean }

export const readRuntimeIdentity = (): RuntimeIdentity => ({
  isServer,
  dev: solid.DEV !== undefined,
  sameOwnerApi: webGetOwner === getOwner,
  hasDocument: typeof document !== 'undefined'
})
```

| Projeto | `isServer` | `dev` | `sameOwnerApi` | `hasDocument` |
| --- | --- | --- | --- | --- |
| client-graph | `false` | `true` | `true` | `false` |
| dom e browser | `false` | `true` | `true` | `true` |
| server | `true` | `true` | `true` | `false` |

`sameOwnerApi: false` indica duas instâncias do motor: os signals de uma não são vistos pela outra.

## Build de produção

Uma execução com `NODE_ENV=test` só exercita o build dev, inclusive com `solid({ dev: false })`. Para o build de produção, faça uma segunda execução com `NODE_ENV=production` e `solid({ dev: false })`. Não use `NODE_ENV=production` com o plugin padrão: os builds se misturam e `DEV` fica `undefined` mesmo rodando código dev.

```ts
// vitest.production.config.ts
// Run as: NODE_ENV=production vitest run --config vitest.production.config.ts
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [{ extends: true, plugins: [solid({ dev: false })], test: { name: 'production', include: ['tests/**/*.production.test.ts'] } }]
  }
})
```

Em produção somem os avisos de desenvolvimento, então a ausência deles nessa execução não prova nada. Um halt continua chamando `console.error('[REACTIVITY_HALTED]', causa)`.

## Imports em projeto Vite+

O Vite+ reexporta o Vitest; a configuração fica no bloco `test` do `vite.config.ts`.

| Vitest | Vite+ |
| --- | --- |
| `vitest` | `vite-plus/test` |
| `defineConfig` de `vitest/config` | `defineConfig` de `vite-plus` |
| `@vitest/browser-playwright` | `vite-plus/test/browser-playwright` |
| `vitest/browser` | `vite-plus/test/browser/context` |

Extensões de tipo com `declare module 'vitest'` continuam apontando para `vitest`.
