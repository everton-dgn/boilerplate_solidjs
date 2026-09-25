---
name: skill-solidjs-testing
description: "Testes de SolidJS 2 no Vitest (happy-dom, jsdom, browser mode, SSR): criar, revisar e depurar testes de TSX, signals, stores, actions, async e hidratação. Contratos da API: skill-solidjs. Fora: Solid 1, SolidStart."
metadata:
  compatibility: "Vitest e @solidjs/vite-plugin do projeto; browser mode exige provider e navegador já instalados. Use com a skill-solidjs. Não instala ferramentas."
  versao-da-skill: "2.3.0"
  solid-verificado: "2.0.0-rc.9"
  vitest-verificado: "4.1.11"
  data-da-verificacao: "2026-09-25"
---

# Testes de SolidJS 2 com Vitest

Esta skill diz como observar contratos do Solid 2 em testes; Solid 1 e SolidStart ficam fora. Os contratos da API ficam na [skill-solidjs](../skill-solidjs/SKILL.md). Se ela não estiver instalada ao lado desta, consulte a [documentação do Solid 2](https://v2.solidjs.com/) e os tipos instalados, e declare no relatório que os contratos não foram conferidos contra a skill.

## Regras que reprovam um teste

1. Postura por projeto. O plugin decide pelo `test.environment` de cada projeto. `environment: 'node'` carrega o build de servidor: memo não recalcula, effect nunca aplica e o setter avisa `SERVER_WRITE`. Primitives rodam num projeto sem `environment` com `extends: true`, ou num projeto DOM. Cada projeto chama `solid()`; não mova o plugin para a raiz. O primeiro teste de cada projeto é um [canário](references/vitest-config.md#canário-de-postura).
2. Uma execução, um build. Com `NODE_ENV=test`, todos os projetos rodam o build dev, mesmo com `solid({ dev: false })`. Produção pede outra execução ([build de produção](references/vitest-config.md#build-de-produção)).
3. Hidratação não se prova no Vitest padrão: em modo test o plugin compila `hydratable: false`, mesmo com `ssr: true`. Veja [servidor](references/server-hydration.md).
4. Não falsifique `queueMicrotask`: o agendador publica por microtask. `vi.useFakeTimers()` padrão preserva isso; `toFake: ['queueMicrotask']` congela o DOM. Restaure timers reais em `afterEach`. Veja [espera](references/settle-and-wait.md).
5. O halt passa para o teste seguinte. Um erro não contido para o agendador do módulo e os effects dos testes seguintes nunca aplicam. `render()` reseta o halt só no build dev; `createRoot` nunca reseta. Quem provoca halt registra `onTestFinished(() => resetErrorHalt())`, ou contém o erro com `Errored`. Sem `test.concurrent` em arquivos que tocam o grafo. Veja [halt](references/mount-dispose-diagnostics.md#halt-reativo).
6. happy-dom não é oráculo de número como filho único: `<p>{count()}</p>` que começa em 0 quebra lá e funciona no Chromium. Teste números no browser mode; não troque `0` por `String(0)` para passar. Veja [ambientes](references/environments.md#happy-dom).
7. "Zero diagnósticos" exige prova de que a captura vive: canário `DEV`, um negativo intencional no mesmo projeto, restauração depois de `await Promise.resolve()` e descarte da árvore dentro da captura. Veja [captura](references/mount-dispose-diagnostics.md#capturar-diagnósticos).
8. Mocke a fronteira de I/O, nunca `solid-js` ou `@solidjs/web`. `vi.resetModules()` num projeto de servidor carrega um segundo motor. Veja [mocks](references/mocks-coverage-types.md).
9. Asserção negativa ("nada mudou", "nenhum aviso") pede antes um sinal positivo de que o caminho rodou, e o teste precisa reprovar num controle (mutante temporário ou config errada). Zero testes coletados num projeto não conta como aprovação: confira a [contagem](references/vitest-config.md#contagem-por-projeto).

## Menor camada que observa o contrato

| Contrato | Onde testar |
| --- | --- |
| Signals, memos, effects, stores, actions sem DOM | projeto sem `environment`, com `extends: true`, ou projeto DOM |
| Componentes, props, children, eventos, contexto | happy-dom (ou jsdom) |
| Páginas e rotas com router em memória | happy-dom |
| Foco, layout, eventos reais, números no DOM, `reportError` | browser mode com Chromium |
| `renderToString`, `renderToStream`, módulos de servidor | `environment: 'node'` com o plugin |
| Página inteira servida, navegação real, hidratação, server functions por HTTP | e2e com Playwright contra o build |

## Fluxo

1. Leia a config do Vitest (projetos, `environment`, plugins, `include`, `setupFiles`), os scripts e o tsconfig dos testes. Mescle mudanças; não substitua a config.
2. Monte sob owner e descarte: `mount()` com `onTestFinished`, ou `createRoot` com `dispose()` ([montagem](references/mount-dispose-diagnostics.md)).
3. Assente pela [tabela de assentamento](references/settle-and-wait.md#tabela-de-assentamento): `flush()` ou uma microtask depois de evento e setter, `vi.waitFor` ou `expect.element` para `Loading`, portões para ordem entre Promises.
4. Execute `vitest run` do projeto e do arquivo, e `tsc` quando houver tipos em jogo. Relate projeto, coletados, aprovados, skips, o canário e o controle usado.

## Roteamento

| Tarefa | Referência |
| --- | --- |
| Projetos, postura, canário, produção, Vite+ | [Vitest](references/vitest-config.md) |
| `flush`, microtask, `userEvent`, `waitFor`, fake timers, `until` | [Assentamento e espera](references/settle-and-wait.md) |
| `mount`, descarte, contexto, captura de console, `Errored`, halt | [Montagem e diagnósticos](references/mount-dispose-diagnostics.md) |
| Primitives, stores, actions, otimismo, corridas | [Reatividade](references/reactivity.md) |
| Páginas, rotas, navegação, dados de rota, e2e | [Páginas e rotas](references/pages-and-routes.md) |
| happy-dom, jsdom, browser mode, formulários, Portal | [Ambientes](references/environments.md) |
| SSR, stream, request scope, server functions | [Servidor e hidratação](references/server-hydration.md) |
| Mocks, `vi.resetModules`, bibliotecas auxiliares, tipos | [Mocks e tipos](references/mocks-coverage-types.md) |
| Códigos de diagnóstico e reparo | [Diagnósticos](../skill-solidjs/references/15-diagnostics-checklists-and-recipes.md) |
