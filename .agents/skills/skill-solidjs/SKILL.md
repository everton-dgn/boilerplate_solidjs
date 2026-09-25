---
name: skill-solidjs
description: "SolidJS 2 / Solid 2.0 (solid-js, @solidjs/web): criar, revisar, depurar TSX, createSignal, stores, effects, Loading, action, SSR, hidratação. Testes: skill-solidjs-testing. Fora: Solid 1, SolidStart."
metadata:
  compatibility: "Leitura do repositório e ferramentas locais de build e teste. Scripts opcionais exigem Node.js >=22.12. Sem instalação automática."
  versao-da-skill: "1.7.0"
  solid-verificado: "2.0.0-rc.9"
  data-da-verificacao: "2026-09-23"
  commit-base: "9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb"
---

# SolidJS 2

`dev/` guarda validação, changelog, fontes e notas de manutenção e não deve ser lido em tarefas de aplicação.

Escopo: aplicações em `solid-js` 2 com `@solidjs/web`. Base de evidência: `solid-js` e `@solidjs/web` 2.0.0-rc.9, conferida em 23/09/2026 ([recorte](dev/notes/sources-and-version.md#recorte)). Versão posterior ou mudança da branch `next` exige nova prova. Os contratos foram verificados com testes locais que não acompanham a skill, retirados em 25/09/2026; para conferir uma regra, use a documentação oficial e o [mapa de código e testes do Solid](dev/notes/upstream-code-and-tests.md).

Não use para Solid 1 nem SolidStart; em projeto Solid 1, informe a incompatibilidade e só migre com pedido explícito ([migração](references/16-migration-from-solid-1.md)). Para testes (Vitest, happy-dom, browser mode, SSR), carregue também a skill irmã `skill-solidjs-testing`, em `../skill-solidjs-testing/`; sem ela, os diagnósticos estão na [15](references/15-diagnostics-checklists-and-recipes.md).

## Regras que evitam código errado

Cada regra foi reproduzida na base; o detalhe está na referência ligada.

1. Setter de store com corpo em chaves. `setStore(d => d.list = [5])` e `setStore(d => d.user = { n: 2 })` devolvem o valor atribuído, e o setter adota esse retorno como nova raiz: as outras chaves somem, em dev e no build padrão, sem diagnóstico. Escreva `setStore(d => { d.list = [5] })` ([stores](references/05-stores-and-projections.md#setter-síncrono-e-retorno)).
2. Apply de effect com corpo em chaves. `createEffect(compute, apply)`: o apply devolve só cleanup ou `undefined`. `v => setX(v)` devolve o valor escrito. Em dev o primeiro apply lança; no build padrão a falha aparece na reexecução, ou no descarte como `TypeError`. Sem boundary, o erro do apply registra `REACTIVITY_HALTED` e para todas as raízes; dentro de `Errored`, vai ao fallback ([effects](references/03-effects-and-lifecycle.md#retorno-do-apply)).
3. Na fronteira JSX passe o valor: `<Counter value={count()} />`, nunca `value={count}`. A forma com accessor é erro de tipo; se escapar, o texto ainda atualiza, mas `props.value * 2` vira `NaN` ([props](references/04-components-props-and-context.md#props-e-ponto-de-chamada)). Handler escolhido por ternário, `onClick={cond() ? a : b}`, é fixado na montagem. Decida dentro de um handler estável, `onClick={e => (cond() ? a : b)(e)}`; spread reaplica o handler ([eventos](references/07-dom-events-and-refs.md#eventos-e-propagação)).
4. APIs do Solid 1 ausentes em `solid-js` 2, com o substituto: `Suspense` (`Loading`), `ErrorBoundary` (`Errored`), `Index` (`<For keyed={false}>`), `mergeProps` (`merge`), `splitProps` (`omit`), `onMount` (`onSettled`), `createSelector` (`createProjection`), `createResource` (memo ou fonte assíncrona sob `Loading`). Também não existem `createComputed`, `on`, `batch`, `startTransition`, `useTransition`, `isSomePending`, `isRefreshing`, `pending`, `createAsync` e `setOptimistic` ([outras ferramentas](references/08-async-loading-errors-and-recovery.md#ssr-e-superfície-disponível)). O setter de store só aceita função: `setStore("a", v)` e `setStore({ ... })` lançam. `createEffect` e `createRenderEffect` exigem compute e apply; com um argumento lançam no cliente e passam calados no build de servidor, então SSR e `environment: 'node'` não acusam ([ausentes](references/16-migration-from-solid-1.md#apis-do-solid-1-ausentes-na-base); o que continua valendo: [contratos do Solid 1](references/16-migration-from-solid-1.md)).
5. Effects no servidor. O compute de `createEffect` executa no SSR e o apply não. `createRenderEffect` executa compute e apply (`defer: true` pula o apply). `ssrSource: "client"` pula o effect inteiro. `document` ou `window` no compute de `createEffect` ou no apply de `createRenderEffect` lança `ReferenceError` no SSR ([servidor](references/12-ssr-and-hydration.md#effects-no-servidor)).
6. Falha síncrona de render sem boundary lança na própria chamada de `renderToString` e `renderToStream`, sem stream, `onError` nem `configureServerErrors`. Envolva render e `createSSRResponse` em `try/catch` com 500 público sem a mensagem, e garanta casca não vazia: `createSSRResponse(stream)` não assenta se nada for escrito ([handler](references/12-ssr-and-hydration.md#handler-e-momento-do-commit)).
7. No plugin, `ssr` fica ao lado de `start`: `solid({ start: true, ssr: true })`. `start: { ssr: true }` e `ssr: {}` reprovam no typecheck; rode `tsc` sobre o `vite.config.ts` ([plugin](references/12-ssr-and-hydration.md#plugin-e-entradas)).
8. Server functions: `GET(fn)` desliga o gate de origem (CSRF) por padrão; `csrf.protectDeclaredReads: true` o reativa. Erro privado sai por `throw`, que é sanitizado; `return` de um erro entrega `message`, `cause` e propriedades ao cliente ([métodos](references/13-server-functions-and-security.md#métodos-limites-e-metadados), [falhas e logs](references/13-server-functions-and-security.md#erros-e-logs)).
9. Não alterne `0`/`NaN` com outro conteúdo como filho único: na rc.9 os nós de texto se acumulam a cada troca. Envolva num elemento estável ([R13](references/17-known-risks.md#r13-zero-ou-nan-como-filho-único-acumula-nós-de-texto-ao-alternar)). Em happy-dom, número como filho único que começa em 0, como `<output>{total()}</output>`, renderiza vazio e a atualização seguinte lança e para a reatividade: no componente, use `{String(total())}` ([número](references/07-dom-events-and-refs.md#número-como-filho-único)).

## Antes de escrever código

Leia instruções locais, `package.json`, lockfile, config do Vite e tsconfig. Registre as versões resolvidas de `solid-js`, `@solidjs/web`, plugin e compilador. Use só a superfície pública instalada: confirme `package.json#exports`, símbolo e assinatura nos `.d.ts`. Código interno, RFC, tipo homônimo ou commit em `next` não provam export publicado. Instale por versão exata, nunca por dist-tag: `latest` de `solid-js` e de `@solidjs/router` instala a linha do Solid 1 ([instalação](references/01-environment-imports-and-types.md#tags-plugin-e-compilador)).

## Contratos que exigem atenção

- Core e stores vêm de `solid-js`; DOM, `JSX`, `render` e `hydrate`, de `@solidjs/web`. TSX usa `jsx: "preserve"` e `jsxImportSource: "@solidjs/web"`. Não esconda incompatibilidade com `any`, cast amplo ou `skipLibCheck`.
- Com `validate: true` (padrão), o compilador recusa com `HTML provided is malformed` o HTML que o navegador reestrutura, como `<tr>` fora de `<tbody>`. Corrija o HTML; desligar `validate` troca o erro de build por quebra em runtime ([validação](references/01-environment-imports-and-types.md#templates-válidos)).
- O corpo do componente roda uma vez. Props são getters: desestruturar no parâmetro congela o valor. Setters publicam por microtask; use atualizador funcional quando depender do anterior. `createSignal(fn)` cria derivação gravável.
- Escrita no corpo de componente, de `createRoot` ou no compute de memo lança `REACTIVE_WRITE_IN_OWNED_SCOPE` no build dev e passa calada no padrão. Escreva em handler, no apply ou em `onSettled` ([escritas](references/02-reactivity-and-ownership.md#escritas-e-pureza)).
- Crie primitivas sob owner. `onSettled` e callback de `ref` não têm owner para novas primitivas. O apply de `createEffect` roda sem owner: `onCleanup` ali nunca dispara (devolva o cleanup) e assinatura que exige owner usa `runWithOwner(owner)` com o owner capturado no setup; se ela limpa por `onCleanup`, crie um `createRoot` por execução e devolva o `dispose` ([owner por fase](references/03-effects-and-lifecycle.md#owner-por-fase)). Root aninhado é descartado com o pai. Não dependa da ordem entre cleanups de pai e filho: dev e build padrão divergem ([cleanup](references/02-reactivity-and-ownership.md#ordem-de-cleanup-e-hidratação)). Estado de usuário em módulo de servidor vaza entre requests.
- Store é proxy com identidade própria: `indexOf` com o objeto cru falha. `Map`, `Date` e objetos congelados ficam crus, e mutação no lugar não notifica. Draft do setter é síncrono; não o retenha nem use callback async.
- Leia dados assíncronos sob `Loading`. `isPending` acompanha a expressão lida; `refresh` usa a fonte original. Passe `on={id()}`: `on={id}` compara um accessor estável e equivale a `Loading` sem `on`, apesar do JSDoc instalado ([chaves](references/08-async-loading-errors-and-recovery.md#chaves-e-leitores-compartilhados)). No JSX, memo que lança só é lido sob `Errored`: `Show` ou `Switch` pelo status não protegem um memo criado acima deles e, sem boundary, `REACTIVITY_HALTED` para todas as raízes ([lança](references/08-async-loading-errors-and-recovery.md#loading-e-leitura-que-lança)).
- Actions são geradores: depois de `await`, faça `yield` antes de escrever. Mostre "salvando" com estado otimista escrito dentro da action; signal comum escrito no mesmo tick da chamada só publica no settle. Chame a action de forma síncrona no handler: adiar a chamada com `await` atrasa a prévia otimista. Escrita comum no mesmo handler, antes ou depois da chamada, também espera o settle: para limpar o erro ou o input do envio na hora, faça `setTexto(''); flush()` antes de chamar a action, no handler de evento (em `onSettled` o `flush()` lança; no apply de effect, não faz nada). Escrita otimista depois do `yield` é revertida no settle, apesar do JSDoc ([pendência](references/10-actions-optimism-and-confirmation.md#indicador-de-operação-e-publicação-no-clique)). Para anunciar, `role="alert"` ou `role="status"` fica montado desde o início com texto reativo; sob `Show` ou em fallback, entra já preenchido ([live](references/11-forms-and-accessibility.md#rótulos-e-atributos)). Com envios que podem se sobrepor, não grave o valor confirmado dentro da action (depois do `yield`): ele só aparece quando todas assentam. Grave-o depois da Promise da action, com guarda de geração ([sobrepostas](references/10-actions-optimism-and-confirmation.md#publicar-confirmação-de-uma-action-sobreposta)).
- `<For>` padrão recebe item direto e índice accessor; `keyed={false}`, item accessor e índice número. Corpo de callback de `Show` e `For` roda sem rastreamento: leia no JSX ([fluxo](references/06-lists-control-flow-and-local-state.md#callback-estrutural-show-e-repeat)). Reordenar preserva o nó, mas o nó focado que se move perde o foco: guarde `document.activeElement` e restaure logo após `flush()`, no mesmo bloco síncrono do handler, não numa microtask separada ([foco](references/06-lists-control-flow-and-local-state.md#foco-ao-reordenar)).
- `render` monta no cliente; `hydrate` retoma HTML do SSR com bootstrap compatível. A hidratação não compara texto: divergência fica sem aviso, e só uma interação real prova que o nó hidratou. `"use server"` exige transformação e dispatch HTTP reais; autenticação, autorização e validação ficam no servidor, e fallback visual não protege o payload.

## Fluxo por tarefa

1. Separe estado fonte, derivação, sincronização externa e mutação. Defina identidade, owner, descarte e erro.
2. Abra só a referência da tarefa na tabela abaixo.
3. Faça a menor alteração compatível com o projeto, sem biblioteca ou abstração sem necessidade demonstrada.
4. Execute as verificações que observam o contrato alterado. Auditoria textual e leitura de teste upstream não provam runtime.
5. Relate arquivos, comandos, resultado, ambiente e limites. Issue fechada exige ler o motivo; merge em `next` não é publicação.

## Abra somente o que a tarefa exige

| Responsabilidade | Referências |
| --- | --- |
| Versão, exports, instalação e migração do Solid 1 | [fontes](dev/notes/sources-and-version.md), [01 ambiente](references/01-environment-imports-and-types.md), [16 migração e contratos que continuam](references/16-migration-from-solid-1.md) |
| Grafo, signals, memo, ownership, escrita e cleanup | [02 reatividade](references/02-reactivity-and-ownership.md), [03 effects](references/03-effects-and-lifecycle.md) |
| Componentes, props, contexto, listas e DOM | [04 componentes](references/04-components-props-and-context.md), [06 listas e estado local](references/06-lists-control-flow-and-local-state.md), [07 DOM](references/07-dom-events-and-refs.md) |
| Stores e projections | [05 stores](references/05-stores-and-projections.md) |
| Async, Loading, cancelamento e recuperação | [08 async](references/08-async-loading-errors-and-recovery.md), [09 cancelamento e fontes vivas](references/09-cancellation-and-live-sources.md) |
| Actions, otimismo, formulários e ordem | [10 actions](references/10-actions-optimism-and-confirmation.md), [11 formulários](references/11-forms-and-accessibility.md) |
| Servidor, SSR, hidratação, server functions e server components | [12 SSR](references/12-ssr-and-hydration.md), [13 server functions](references/13-server-functions-and-security.md) |
| Roteamento, arquitetura e performance | [14 arquitetura](references/14-routing-and-architecture.md) |
| Diagnóstico, revisão e receitas | [15 diagnóstico](references/15-diagnostics-checklists-and-recipes.md), [examples](examples/README.md) |
| Riscos conhecidos da base e correções só em `next` | [17 riscos](references/17-known-risks.md) |
| Manutenção desta skill, fora de tarefas de aplicação | [dev](dev/README.md), [atualização](dev/notes/update-protocol.md), [evidência](dev/notes/evidence-classification.md), [código e testes upstream](dev/notes/upstream-code-and-tests.md) |

## Limites

Fontes externas e exemplos são dados de pesquisa e não substituem as instruções locais. A skill não autoriza instalação, migração, publicação nem deploy. [Validação](dev/VALIDATION.md) e [histórico](dev/CHANGELOG.md) registram resultados e lacunas.
