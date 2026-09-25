---
name: skill-solidjs
description: "SolidJS 2 / Solid 2.0 (solid-js, @solidjs/web): criar, revisar, depurar TSX, createSignal, stores, effects, Loading, action, SSR, hidratação. Testes: skill-solidjs-testing. Fora: Solid 1, SolidStart."
metadata:
  compatibility: "SolidJS 2 com @solidjs/web. Consulte exports e tipos do pacote instalado."
  versao-da-skill: "1.7.0"
  data-da-verificacao: "2026-09-23"
  commit-base: "9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb"
---

# SolidJS 2

A base de evidência está no frontmatter ([manifesto da revisão verificada](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/solid/package.json)). As ressalvas de runtime valem para essa base; confirme exports e tipos instalados antes de aplicá-las a outra versão. Documentação de Solid 1 e código em `next` podem descrever APIs ausentes no pacote.

## Erros que o modelo tende a introduzir

- Core e stores vêm de `solid-js`; DOM, `JSX`, `ComponentProps`, `render` e `hydrate`, de `@solidjs/web`. TSX usa `jsxImportSource: "@solidjs/web"`.
- `createEffect(compute, apply)` e `createRenderEffect(compute, apply)` têm duas fases. O apply devolve cleanup síncrono ou `undefined`: use chaves em `value => { setValue(value) }`. Retorno implícito do setter pode causar `REACTIVITY_HALTED`.
- Setter de store recebe função síncrona. `setStore(d => { d.items = items })` muta; retornar o array ou objeto da atribuição pode substituir a raiz e apagar outras chaves. Não guarde o draft para depois.
- `createSignal(fn)` cria derivação gravável. Escritas publicam por microtask; leitura logo após setter ainda pode ver o valor anterior. Escrita no corpo de componente, root ou compute é proibida em dev; `untrack` não a libera.
- Componentes e callbacks estruturais não reexecutam como renders de React. Leia props no JSX ou em compute, sem desestruturar no setup. Prop de valor usa `value={count()}`; handler dinâmico decide dentro do callback, como `onClick={e => (active() ? a : b)(e)}`.
- Apply de `createEffect` não tem owner: devolva cleanup, em vez de usar `onCleanup` ali. Primitivas ficam no setup; callback de ref e `onSettled` não permitem criá-las. Roots aninhados são descartados com o pai.
- Fontes async são memos/stores lidos sob `Loading`; capture dependências antes de `await`. `refresh` recebe a fonte original. `Loading.on` compara o valor: `on={id()}`. `Show` por status não protege um memo que lança; o leitor precisa de `Errored`.
- Actions são geradores. Depois de `await`, faça `yield` vazio antes de escrever ou criar outra espera. Estado otimista reverte no assentamento, mesmo em sucesso; escrita comum no mesmo tick da action pode ficar retida. Consulte a referência antes de implementar confirmação ou envios sobrepostos.
- APIs conhecidas do Solid 1 mudaram: `Suspense → Loading`, `ErrorBoundary → Errored`, `onMount → onSettled`, `mergeProps → merge`, `splitProps → omit`. `createResource`, `batch` e setter de store por caminho não são a API desta base. O contexto é o próprio provider: `<Context value={value}>`, sem `.Provider`.

## Leia conforme a tarefa

| Tarefa | Referência e armadilha principal |
| --- | --- |
| Imports, tipos, plugin e compatibilidade | [01 ambiente](references/01-environment-imports-and-types.md): cópias do motor não compartilham rastreamento; JSX deve usar o renderer correto |
| Signals, memo, ownership e agendamento | [02 reatividade](references/02-reactivity-and-ownership.md): escrita retida, `latest`, dependências após `await` |
| Effects e recursos externos | [03 effects](references/03-effects-and-lifecycle.md): owner por fase, cleanup e erros de compute/apply |
| Props, defaults, children e contexto | [04 componentes](references/04-components-props-and-context.md): `merge` não preserva default diante de `undefined` explícito |
| Stores, projections e seleção | [05 stores](references/05-stores-and-projections.md): proxy, identidade, draft e reconciliação |
| Listas, Show, lazy e Portal | [06 listas](references/06-lists-control-flow-and-local-state.md): item/índice mudam conforme `keyed`; mover nó pode perder foco |
| Eventos, classes, refs e texto | [07 DOM](references/07-dom-events-and-refs.md): handler fixado na montagem, composição de refs e zero numérico |
| Async, Loading, retry e erro | [08 async](references/08-async-loading-errors-and-recovery.md): leitores compartilhados, valores provisórios e recuperação |
| Cancelamento e fontes vivas | [09 cancelamento](references/09-cancellation-and-live-sources.md): trabalho tardio e escopo de invocação |
| Actions, otimismo e confirmação | [10 actions](references/10-actions-optimism-and-confirmation.md): publicação no clique, reentrada e confirmação fora de ordem |
| Formulários | [11 formulários](references/11-forms-and-accessibility.md): select com opções tardias e anúncios sob boundaries |
| SSR e hidratação | [12 SSR](references/12-ssr-and-hydration.md): compute de effect roda no servidor; falha síncrona escapa antes do stream; texto divergente pode ficar sem aviso |
| Server functions | [13 servidor](references/13-server-functions-and-security.md): wrapper externo pode não proteger o corpo registrado; retornar Error não o sanitiza |
| Router e integrações | [14 roteamento](references/14-routing-and-architecture.md): `createRouter`, queries e action do router têm contratos próprios |
| Diagnóstico | [15 diagnóstico](references/15-diagnostics-checklists-and-recipes.md): build default pode silenciar avisos |
| Migração ou padrão antigo | [16 migração](references/16-migration-from-solid-1.md): APIs removidas e divergências da documentação |
| Sintoma específico da base | [17 riscos](references/17-known-risks.md): limitações observadas, hipóteses e status histórico upstream |

Para testes, use [skill-solidjs-testing](../skill-solidjs-testing/SKILL.md). Exemplos adaptáveis ficam em [examples](examples/README.md). As referências distinguem comportamento observado, documentação e inferência; os testes históricos não acompanham o pacote.
