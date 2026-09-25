# Migração do Solid 1 e divergências

Base: `solid-js` e `@solidjs/web` 2.0.0-rc.9. Entra só em tarefa de migração ou quando um padrão antigo aparece no código; a coluna de legado não faz parte da API do Solid 2 e as receitas da skill usam só o contrato v2.

Contrato: API depreciada pode seguir exportada por compatibilidade sem ser recomendada. API presente só no motor interno, em tipos ou em comentários não ganha export público por isso. Se o pedido é corrigir um bug em Solid 1, informe o limite e use a documentação da versão instalada; migração de major é outra tarefa.

## APIs do Solid 1 ausentes na base

Nenhum destes nomes é exportado por `solid-js` na rc.9, nos builds dev e default; os substitutos da coluna Solid 2 existem.

| Solid 1 | Solid 2 | Observação |
| --- | --- | --- |
| `Suspense`, `SuspenseList` | `Loading`, `Reveal` | Contratos próprios de prontidão e de ordem/colapso, não apelidos |
| `ErrorBoundary` | `Errored` | Erro do fallback é accessor |
| `Index` | `<For keyed={false}>` | Item accessor, índice número |
| `mergeProps` | `merge` | `@solidjs/web` exporta `mergeProps` só como helper interno do compilador |
| `splitProps` | `omit` | Filtra chaves; não devolve a mesma tupla |
| `onMount` | `onSettled` | Setup após assentamento, com cleanup retornado |
| `createSelector` | `createProjection` | Seleção granular por chave |
| `createResource` | Memo ou fonte assíncrona sob `Loading` | Sem `loading`, `mutate` nem `refetch` |
| `createComputed` | Memo, fonte derivada ou effect split | Depende da intenção |
| `on` | Compute de `createEffect` | Dependências explícitas no compute; o `defer` do `on` vira a opção `defer` do effect |
| `batch` | Batching automático por microtask; `flush` só para ler estado assentado | Não troque todo `batch` por `flush` |
| `startTransition`, `useTransition` | `action` + `Loading` + `isPending` | Sem troca textual |
| `createDeferred` | Removido; o batching já coalesce por microtask | Não recriar por alias |
| `isRefreshing` | `refresh(target)` devolve Promise; `yield refresh(target)` numa action reexecuta a fonte e espera o assentamento | Não expõe fase a cálculo puro; combine com `affects(target)` ou flag otimista |
| `setStore("a", 0, "b", v)`, `setStore(path, reconcile(...))` | `setStore(d => { d.a[0].b = v })` | Setter por caminho e com objeto lançam `TypeError`: `StoreSetter` só aceita função |
| `createEffect(fn)` | `createEffect(compute, apply)` | No cliente, `createEffect(fn)` lança antes do compute (`MISSING_EFFECT_FN` em dev; `TypeError` sem código no default); `createRenderEffect(fn)` roda o compute e depois falha com `TypeError`, escalando para `REACTIVITY_HALTED` (o teste precisa isolar/resetar o motor). No build de servidor os dois executam o compute uma vez sem erro: SSR e testes com `environment: 'node'` não acusam o padrão |

Numa migração, procure no projeto imports desses nomes, subcaminhos como `solid-js/web` e `solid-js/store`, setter de store por caminho, effect de um argumento e exports antigos do router. Router: [mapa próprio](14-routing-and-architecture.md#mapa-de-migração-do-router).

## Mapa de migração

Armadilha: não faça substituição global. Import pode ser mecânico, mas lifecycle, stores, efeitos e transições mudam de contrato. Alinhe dependências, renderer e compilador; depois migre por feature com testes de regressão. `merge` deixa um `undefined` explícito sobrescrever o default.

| Padrão anterior | Direção no Solid 2 | Cuidado |
| --- | --- | --- |
| `solid-js/web` | `@solidjs/web` | Atualizar renderer e tipos |
| `solid-js/store` | `solid-js` | Setter também mudou |
| `solid-js/h`, `/html`, `/universal` | `@solidjs/h`, `@solidjs/html`, `@solidjs/universal` | `solid-js` só exporta `.`, `./refresh`, `./attribution`, `./internal` e `./package.json`; instale só o renderer real |
| `jsxImportSource: "solid-js"` | `"@solidjs/web"` no DOM compilado | Não misturar com hyperscript |
| `indexArray` | `mapArray` com keying posicional | Contrato de item e índice muda |
| `unwrap` | `snapshot` | View plain e leitura não rastreada |
| `produce` | Setter draft síncrono | O draft já muta; remover o wrapper sem perder controle de retorno |
| `createMutable` / `modifyMutable` | Store com escrita por draft; `@solid-primitives/mutable` para legado | Não mutar proxy livremente |
| `createDynamic` / `<Dynamic>` | Fábrica `dynamic` | `Dynamic` existe, depreciado |
| `classList` | `class` com string, objeto ou array | `classList` não existe nos tipos JSX; confirmar composição e precedência |
| `use:` | Fábrica de ref + lifecycle proprietário | Ref callback sozinho não recebe cleanup |
| `attr:` / `bool:` | Atributo ou propriedade padrão | Não perder semântica de booleanos e ARIA |
| `on:` / `oncapture:` | Removidos; evento camelCase delegado (`onClick`) ou `addEventListener` manual | Para `capture`, `passive` ou `once`, registre no ciclo de vida (ou via factory de ref) e remova no `onCleanup` |
| `getListener` | `getObserver` | Owner não é observador |
| `equalFn` | `isEqual` | Conferir assinatura |
| `renderToStringAsync` | `await` do resultado de `renderToStream` | Não consumir o stream duas vezes |
| `Context.Provider` | O próprio Context como provider | Reexaminar defaults e ausência de provider |
| `<Title>` de `@solidjs/meta` | `useHead` de `@solidjs/web` | Tags de `<head>` |
| `sharedConfig.count` | Sem equivalente público | Módulos de hidratação vêm pré-carregados e IDs vivem em owners; não mexer |
| JSX `tabIndex` | `tabindex` (minúsculo) | Em `<dialog>` o tipo é `tabindex?: never` |

`createDeferred`, `enableScheduling`, `writeSignal` e `resetErrorBoundaries` não devem ser recriados por alias. Para `from`/observable, async iterables e effects são direções possíveis, mas um Observable externo nem sempre é AsyncIterable: adapte o protocolo e possua o cancelamento.

## Divergências encontradas na própria documentação

- D01 `storePath`: MIGRATION, CHEATSHEET e RFC de stores ainda o mostram; o core não o exporta. Escreva setters com draft; não importe de `@solidjs/signals` nem de caminho interno.
- D02 `createTrackedEffect`: apresentado como efeito de fase única avançado; o JSDoc o marca depreciado para código novo. Use `createEffect` split e `onSettled`; uso existente é compatibilidade a substituir, não receita.
- D03 Portal no servidor: a cheatsheet descreve um erro antigo; o renderer define Portal como ilha client-only montada após assentar. Não acesse `document` em props avaliadas no servidor nem assuma conteúdo de Portal no HTML.
- D04 callback de `For`: um exemplo do RFC usa item como accessor no modo padrão. Padrão: item direto e índice accessor; posicional: item accessor e índice número; chave personalizada: ambos accessors.
- D05 inicializadores: comentários antigos citam `initialValue`; o segundo argumento de `createMemo` é `MemoOptions` (`name`, `equals`), não valor inicial. Seed de store derivada é outro conceito. Tipos e overloads da versão resolvida prevalecem sobre a prosa e a memória do agente.
- D06 versões do compilador: versão em `package.json` de branch não prova publicação. Confirme registro, peers e lockfile antes de instalar.
- D07 `ComponentProps` e `ValidComponent`: o core tem formas restritas a componentes que não resolvem `ComponentProps<"button">`. Em UI DOM, importe de `@solidjs/web`.

## Mudanças entre prévias e processo seguro

Não trate duas RCs como iguais: a rc.9 altera diagnóstico, exports, stores, streaming, erros e integrações. Ao migrar de beta ou RC anterior, revise lazy com export nomeado, opções de `dynamic`, `onError` de servidor e setters assíncronos. Lazy nomeado: `lazy(() => import(...), { export: "Nome" })`; um wrapper que produz `{ default: modulo.Nome }` em runtime pode quebrar a identificação síncrona da hidratação. O terceiro argumento (`moduleUrl`) é contexto de integração.

Processo: congele uma base com testes, liste imports removidos, migre uma feature representativa com async e formulário, verifique DOM cliente e SSR, então amplie. Não desative todos os diagnósticos na transição; cada exceção temporária tem motivo, escopo e teste.

Armadilha: issue fechada não prova correção no pacote instalado; a semântica de `Loading.on` muda em `next` ([R03](17-known-risks.md#r03-on-e-boundary-criada-durante-hold)); uma resposta antiga pode descrever hook planejado que a rc.9 já tem; um gate encerrado por sinal pode parecer sucesso. Nada disso autoriza importar campo privado ou aplicar patch de comentário.

## APIs que induzem a erro

`storePath` e `markRaw` não são exports públicos desta base. Para valor cru, confira `snapshot` e seus limites; `deep` faz leitura rastreada, não o oposto. Não importe `$PROXY`, `$TRACK`, `sharedConfig` ou campos de hidratação para substituir APIs removidas.

`resetErrorHalt` serve ao [harness de testes](../../skill-solidjs-testing/references/mount-dispose-diagnostics.md#halt-reativo); não é recuperação de erro da aplicação.
