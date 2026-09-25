# Migração do Solid 1, inventário de APIs e divergências

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
| `onMount` | `onSettled`; em fixture de teste, `createEffect(() => undefined, setup)` roda o setup uma vez sem rastrear | Cleanup retornado |
| `createSelector` | `createProjection` | Seleção granular por chave |
| `createResource` | Memo ou fonte assíncrona sob `Loading` | Sem `loading`, `mutate` nem `refetch` |
| `createComputed` | Memo, fonte derivada ou effect split | Depende da intenção |
| `on` | Compute de `createEffect` | Dependências explícitas no compute; o `defer` do `on` vira a opção `defer` do effect |
| `batch` | Batching automático por microtask; `flush` só para ler estado assentado | Não troque todo `batch` por `flush` |
| `startTransition`, `useTransition` | `action` + `Loading` + `isPending` | Sem troca textual |
| `createDeferred` | Removido; o batching já coalesce por microtask | Não recriar por alias |
| `isRefreshing` | `refresh(target)` devolve Promise; `yield refresh(target)` numa action reexecuta a fonte e espera o assentamento | Não expõe fase a cálculo puro; combine com `affects(target)` ou flag otimista |
| `setStore("a", 0, "b", v)`, `setStore(path, reconcile(...))` | `setStore(d => { d.a[0].b = v })` | Setter por caminho e com objeto lançam `TypeError`: `StoreSetter` só aceita função |
| `createEffect(fn)` | `createEffect(compute, apply)` | No cliente, `createEffect(fn)` lança antes do compute (`MISSING_EFFECT_FN` em dev; `TypeError` sem código no default); `createRenderEffect(fn)` roda o compute e depois falha com `TypeError`, escalando para `REACTIVITY_HALTED` (exige `resetErrorHalt()`). No build de servidor os dois executam o compute uma vez sem erro: SSR e testes com `environment: 'node'` não acusam o padrão |

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

## Contratos do Solid 1 que continuam

Continuar exportado não garante a mesma semântica em todo detalhe. `observado na rc.9` marca linha verificada com testes locais retirados em 25/09/2026; linha sem teste fica como não verificada.

| Contrato do Solid 1 | Na base | Verificação |
| --- | --- | --- |
| Corpo do componente roda uma vez; só leituras reativas reexecutam | Continua | observado na rc.9 |
| Props chegam como getters; desestruturar no parâmetro lê uma vez e congela | Continua. Em dev a leitura solta avisa `STRICT_READ_UNTRACKED`; no default fica em silêncio | observado na rc.9 |
| `untrack` lê sem assinar | Continua | observado na rc.9 |
| `onCleanup` roda no descarte do owner e antes de um memo recalcular | Continua. A ordem entre cleanups de pai e filho difere entre dev e default ([ownership](02-reactivity-and-ownership.md)) | observado na rc.9 |
| `createRoot` cria escopo com `dispose` próprio | Muda: root criado sob outro owner é descartado com o pai; no Solid 1 ficava fora da lista de filhos | observado na rc.9 |
| Atualizador funcional compõe escritas seguidas | Continua | observado na rc.9 |
| `useContext` lê o provider mais próximo e, sem provider, o default; `runWithOwner(getOwner())` restaura o contexto | Continua, com três mudanças: o contexto é o próprio provider (`<Ctx value>`); `useContext` sem owner lança `NoOwnerError` (Solid 1 devolvia o default); `createContext()` sem default e sem provider lança `ContextNotFoundError` (Solid 1 devolvia `undefined`). Nenhuma das classes é exportada | observado na rc.9 |
| `mapArray` e `For` preservam a linha pela referência do item ao reordenar | Continua | observado na rc.9 |
| `Show`, `Switch` e `Match` existem | Continuam. O callback de `Show` não keyed é owner: leitura no topo congela e avisa, leitura no JSX segue viva | observado na rc.9 |
| `Portal` renderiza no alvo externo e mantém o contexto do ramo lógico | Continua. Clique delegado sobe pelos ancestrais lógicos; listener nativo segue a árvore física | observado na rc.9 |
| `ref` callback recebe o elemento | Continua. Array de refs compõe; item não chamável lança | observado na rc.9 |
| `lazy(() => import(...))` com export default | Continua nos tipos; export nomeado usa `{ export: "Nome" }` | tipos; runtime não verificado |
| `children()` resolve filhos | Exportado | Comportamento não verificado |

Ao atualizar o Solid, confira as duas tabelas contra os exports, os tipos e a documentação da versão nova. Atualize as tabelas antes de mudar a orientação.

Refutações delimitadas, observadas na rc.9:

- Store derivada com push otimista de três itens e refetch de cinco não produziu `undefined` no `mapArray` final; sem garantia geral sobre refetch.
- `input value={undefined}` e reuso do mesmo nó entre fallback e children de `Show` não reproduziram os defeitos antigos.
- SSR distingue sanitização no build padrão e exposição em dev; boundaries e transporte têm contratos separados.
- Effect com boundary ancestral pode ser capturado; sem boundary, a falha para a reatividade. Escrita na dependência do próprio memo lança em dev; o build padrão pode deixar o memo dessincronizado sem loop.
- Cópias físicas independentes de Solid e da engine quebram rastreamento cruzado.

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

## Inventário de APIs por responsabilidade

Mapa de seleção, não enumeração completa. Export existir não garante API pública estável (há marcas internal, entradas de integração e experimentais). Desconsidere o bloco comentado `Not Implemented` do core e não deduza `storePath` dos tipos de path exportados. Para chamada menos usual, abra a declaração instalada antes de gerar argumentos.

Reatividade do core (`solid-js`):

| Família | APIs |
| --- | --- |
| Fontes e derivação | `createSignal`, `createMemo` (síncrono ou assíncrono) |
| Estruturas e projeção | `createStore`, `createProjection` |
| Otimismo coordenado por action | `createOptimistic`, `createOptimisticStore` |
| Efeito externo e setup | `createEffect` (compute + apply), `onSettled` (cleanup retornado), `onCleanup` |
| Integração de efeito | `createRenderEffect`, `createReaction` |
| Ação e impacto | `action`, `affects` |
| Prontidão e espera | `isPending`, `latest`, `resolve`, `until` |
| Invalidação e agendamento | `refresh`, `flush` |
| Views de objeto | `merge`, `omit` |
| Reconciliação | `reconcile`, `snapshot`, `deep` |
| Rastreamento | `untrack`, `getObserver` |
| Ownership | `createRoot`, `createOwner`, `getOwner`, `runWithOwner`, `isDisposed` |
| Contexto e conteúdo | `createContext`, `useContext`, `children`, `createUniqueId`, `lazy` |
| Iteração e inspeção de baixo nível | `mapArray`, `repeat`, `isEqual`, `isStatic`, `isWrappable`, `flatten` (conferir contrato) |
| Boundaries de baixo nível | `createErrorBoundary`, `createLoadingBoundary`, `createRevealOrder` (em UI prefira os componentes) |
| Erros de prontidão | `NotReadyError`, `TimeoutError` |
| Observabilidade | `configureClientErrors`, `OBSERVE`, `DEV` |

`createOptimistic(value | (() => T), options?)` e `createOptimisticStore(initial | (() => initial), seed?, options?)` aceitam forma plana e derivada; ambos revertem ao fim da action. `createTrackedEffect` está depreciado. `resetErrorHalt` não é rotina a chamar em loop. `enforceLoadingBoundary` e `enableExternalSource` são configuração avançada. Não use `$PROXY`, `$TRACK`, `$DEVCOMP`, `sharedConfig` ou IDs internos. `markRaw` não existe: embrulhe num getter (`createSignal(() => ({ raw }))`) ou use `snapshot(target)`; `deep(target)` faz o oposto e não tem segundo argumento. O patch mode foi removido sem substituto público.

Componentes de fluxo de `solid-js`: `For`, `Repeat`, `Show`, `Switch`, `Match`, `Loading`, `Errored`, `Reveal`, `NoHydration`, `Hydration`. Os parâmetros de callback são parte do contrato; não os derive do nome nem de exemplo v1.

Renderer web (`@solidjs/web`): montagem `render`, `hydrate`; SSR `renderToString`, `renderToStream`; bootstrap `HydrationScript`, `generateHydrationScript`; componentes DOM `Portal`, `dynamic`, `clientOnly`; constantes `isServer`, `isDev`; tipos `JSX`, `ComponentProps`, `ValidComponent`, `IntrinsicElement`; request `getRequestEvent`, `createRequestEvent`; resposta `createSSRResponse`, `commitEventResponse`; HTTP declarativo `httpStatus`, `httpHeader`; resultado `respond`, `redirect`, `reload`; cookies `parseCookieHeader`, `serializeCookie`; erros `configureServerErrors`, `getTraceContext`. `Dynamic` e `DynamicProps` estão depreciados. Helpers de template, inserção, spread, delegação e serialização servem ao compilador, não a renderer manual; `mergeProps` de `@solidjs/web` é `@internal`.

Entradas especializadas: `@solidjs/web/storage` (`provideRequestEvent`); `@solidjs/web/server-functions` (configuração, chamada e RPC por lado: `GET`, `withMeta`, `getServerFunctionMetadata`, `isServerFunction`, `invoke`; `prepareRequest` é hook de configuração, não API global); `/server-functions/rich-args`; `/client` e `/server` para integrações; `/serialization` e `/frames` são infraestrutura fora da garantia geral. Para codecs, use as exportações da própria instância do runtime; não importe uma segunda cópia de serializador.

Tipos principais: `Accessor<T>` (`() => T`), `SourceAccessor<T>` (identidade de fonte), `Setter<T>`, `Signal<T>`, `Store<T>` (view, não função), `StoreSetter<T>` (draft), `MemoOptions`/`SignalOptions`/`EffectOptions` (não intercambiáveis), `StoreOptions`/`ProjectionOptions`, `EffectBundle` (braços effect e error), `Component`/`ParentComponent`/`VoidComponent`/`FlowComponent` e `ParentProps`/`VoidProps`/`FlowProps` (contratos de children), `Element` (core) e `JSX.Element`/`JSX.EventHandler` (renderer). Para `ComponentProps<"input">`, use `@solidjs/web`.

Antes de usar uma API rara: está exportada e tipada na versão instalada? É pública, de integração ou experimental? Qual owner exige? Pode suspender, escrever ou precisar de cleanup? Funciona no servidor, no cliente ou é stub de um lado? Um teste pequeno responde melhor que uma assinatura de memória.
