---
name: skill-solidjs-testing
description: "Testes de SolidJS 2 no Vitest (happy-dom, jsdom, browser mode, SSR): criar, revisar e depurar testes de TSX, signals, stores, actions, async e hidratação. Contratos da API: skill-solidjs. Fora: Solid 1, SolidStart."
metadata:
  compatibility: "Vitest e @solidjs/vite-plugin do projeto; browser mode exige provider e navegador já instalados. Use com a skill-solidjs. Não instala ferramentas."
  versao-da-skill: "2.3.0"
  data-da-verificacao: "2026-09-25"
---

# Testes de SolidJS 2 com Vitest

Os contratos da API ficam na [skill-solidjs](../skill-solidjs/SKILL.md); esta skill cobre as armadilhas ao observá-los em testes. A base histórica está no [manifesto](https://github.com/everton-dgn/boilerplate_solidjs/blob/eeaed3ff596fa201a7a3fb7aa10afcee63a77489/package.json) e no [lockfile da verificação](https://github.com/everton-dgn/boilerplate_solidjs/blob/eeaed3ff596fa201a7a3fb7aa10afcee63a77489/pnpm-lock.yaml); versões atuais vêm dos manifestos do projeto. Ao mudar plugin ou runner, confira a [postura de cada projeto](references/vitest-config.md#canário-de-postura).

## Armadilhas que falsificam o resultado

- `environment: 'node'` faz o plugin carregar o build servidor: memo não recalcula e effect não aplica. Para grafo cliente sem DOM, omita `environment` e use `extends: true`; projetos que testam Solid/TSX precisam de `solid()`. Módulos Node sem TSX nem grafo podem dispensar o plugin.
- `NODE_ENV=test` mantém o build dev mesmo com `solid({ dev: false })`. Produção exige [execução separada](references/vitest-config.md#build-de-produção).
- Em modo test, o plugin compila `hydratable: false` mesmo com `ssr: true`. SSR no Vitest e hidratação de um build servido são provas diferentes.
- O agendador usa `queueMicrotask`. Não a inclua em `toFake`; `flush()` drena trabalho síncrono, sem resolver Promises. Use a [tabela de espera](references/settle-and-wait.md#tabela-de-assentamento).
- Um erro não contido pode parar o motor para os testes seguintes. `createRoot` não recupera o halt; `render` só o faz em dev. Testes que provocam halt precisam de [isolamento e reset](references/mount-dispose-diagnostics.md#halt-reativo).
- Não mocke `solid-js` ou `@solidjs/web`. `vi.resetModules()` pode duplicar o motor no projeto servidor; confira [mocks e tipos](references/mocks-coverage-types.md).

## Escolha pela prova necessária

| Contrato | Ambiente e referência |
| --- | --- |
| Signals, memos, stores e actions sem DOM | Cliente sem `environment`, com `extends: true`, ou projeto DOM; [reatividade](references/reactivity.md) |
| Componentes e props | happy-dom ou jsdom; [montagem e descarte](references/mount-dispose-diagnostics.md) |
| Página isolada e router em memória | Projeto DOM; [rotas e cache entre testes](references/pages-and-routes.md) |
| Foco, layout, eventos reais e números como filho único | Browser mode; [limites dos ambientes](references/environments.md) |
| `renderToString`, `renderToStream`, request scope | Projeto `node` com plugin; [servidor](references/server-hydration.md) |
| Hidratação e server functions por HTTP | E2E contra build servido; [servidor e hidratação](references/server-hydration.md) |
| Ausência de avisos e erros | Build dev, captura cobrindo descarte e microtasks; [diagnósticos](references/mount-dispose-diagnostics.md#capturar-diagnósticos) |
| Configuração, produção e Vite+ | [Configuração do Vitest](references/vitest-config.md), incluindo projeto vazio que passa no run conjunto |
| Fake timers e ordem entre Promises | [Assentamento e espera](references/settle-and-wait.md) |
| Tipos e bibliotecas auxiliares | [Mocks e tipos](references/mocks-coverage-types.md); `vitest run` sozinho não verifica `expectTypeOf` |

Canários e controles negativos servem para conferir um harness novo ou investigar falso positivo. Reutilize os do projeto quando existirem; uma alteração comum não exige criar canário, mutante ou relatório padronizado.
