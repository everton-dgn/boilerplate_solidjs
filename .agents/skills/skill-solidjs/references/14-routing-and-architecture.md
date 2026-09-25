# Roteamento, integrações e arquitetura

Base: `solid-js` e `@solidjs/web` 2.0.0-rc.9 com `@solidjs/router` 2.0.0-next.26. Versão diferente exige nova prova.

## Compatibilidade por pacote

Contrato: core, renderer, compilador e roteador têm contratos e versões próprios; o conjunto válido é o resolvido no lockfile. O core Solid 2 incorporou server functions e partes do fluxo HTTP, mas isso não decide roteamento, cache por rota, deploy nem autenticação.

Armadilha: pacote que aceita Solid 1 em `peerDependencies` não é compatível porque o nome contém Solid. A tag `latest` pode seguir na linha do Solid 1 enquanto um canal de prévia atende ao Solid 2; peer exato de uma RC não aceita outra RC; intervalo semver aceito não prova funcionamento (Solid Query e Kobalte exigem conferência por publicação). Confira `pnpm view <lib> peerDependencies` antes de adotar. Uma lib pode compilar JSX e falhar em runtime por depender de `onMount`, efeito de fase única, setter por caminho ou owner antigo. Procure cópias duplicadas de `solid-js` e `@solidjs/signals`, sobretudo em workspaces e pacotes linkados. Não remova peer warnings à força nem crie aliases para caminhos internos: as saídas são versão compatível, adaptação pequena documentada, substituição ou manter a versão atual.

## Router 2: superfície instalada

Contrato: o router instalado exporta

- montagem: `createRouter`, `defineRoute`, `defineRoutes`, `browserHistory`, `hashHistory`, `memoryHistory`;
- navegação e leitura: `useNavigate`, `useLocation`, `useParams`, `useSearchParams`, `useMatch`, `useRouteMatches`, `useHref`, `useResolvedPath`, `useIsRouting`, `useLinkState`, `usePreloadRoute`, `useBeforeLeave`;
- dados: `query`, `revalidate`, `action`, `useAction`, `useSubmissions` e `liveQuery` (experimental; a documentação de dados o omite).

Não existem `Router`, `Route`, `A`, `Navigate`, `createAsync`, `createAsyncStore`, `useSubmission`, `cache`, `json`, `createMemoryHistory` nem `MemoryRouter`. O `Router` da receita é a instância retornada por `createRouter`, usada como componente num host real, com children explícitos: `render(() => <Router>{props => props.children}</Router>, host)`; `render()` recebe um `MountableElement`, não objeto de opções. `redirect`, `reload` e `respond` vêm de `@solidjs/web`. `viewTransition` e um hook como `useViewTransitionState` não existem; componha um wrapper sobre `document.startViewTransition`. Versões posteriores do router trazem APIs experimentais (como `serverRouteComponent`) ausentes no instalado. `createResource`, `createAsync` e `createAsyncStore` também não existem em `solid-js`: leitura assíncrona passa por `query(fn, name)` lida por `createMemo`, `createProjection` ou `createOptimistic`, sob `Loading`/`Errored`.

Receita:

```tsx
import { For, Loading, createMemo } from "solid-js"
import { createRouter, query } from "@solidjs/router"

type Todo = { id: string; title: string }

declare function fetchTodos(): Promise<Todo[]>

const getTodos = query(fetchTodos, "todos")

function Todos() {
  const todos = createMemo(() => getTodos())
  return (
    <Loading fallback={<p>Carregando</p>}>
      <ul><For each={todos()}>{todo => <li>{todo.title}</li>}</For></ul>
    </Loading>
  )
}

export const Router = createRouter({ routes: [{ path: "/", component: Todos }] })
// render(() => <Router>{props => props.children}</Router>, container)
```

Regras sustentadas pelo código instalado:

- `query(fn, name)` devolve função com `key` e `keyFor(...args)`; `revalidate(getTodos.key)` invalida todas as entradas, `revalidate(getTodos.keyFor(id))` só uma.
- A action do router tem `url`, `with(...args)`, `onSubmit(hook)` e `onSettled(hook)`. `.onSubmit` executa dentro da transação otimista; escreva a sobreposição nesse hook. A action geradora de `solid-js` tem outro contrato, sem `.with`.
- Chamada programática da action pode rejeitar mesmo depois de registrar o erro em `useSubmissions`; trate a Promise no handler. Observar o histórico não contém a rejeição.
- Action que termina sem erro e sem metadados revalida todas as queries; com `X-Revalidate`, só as chaves declaradas; se lança, nenhuma (leitura do código, sem teste de runtime). `X-Revalidate: *` equivale a `REVALIDATE_ALL` de `@solidjs/web`; chaves nomeadas usam prefix-match; lista vazia não casa nada. Teste o cache depois da invalidação: checar só o header dá falso-verde.
- Server function lida por `query` que viaja como GET precisa de `GET(fn)` no módulo servidor; sem ele, GET responde 405 com `Allow: POST`.

Armadilha: em `<form action>` com action vinculada, os argumentos vão serializados no parâmetro `args` da URL. Use só valores apropriados a essa exposição e valide e autorize no servidor; vincular um id no cliente não comprova permissão.

### Mapa de migração do router

| Antes (Solid 1) | Router 2 instalado |
| --- | --- |
| `<Router root={App}>` com `<Route>` | `createRouter({ routes: [...] })` e `<Router>{props => ...}</Router>`; rotas como objetos, filhos em `children` |
| `<HashRouter>`, `<MemoryRouter>` | `createRouter({ routes, history: hashHistory() })` ou `memoryHistory("/inicial")` |
| `<A href>` com `activeClass` | `<a href>` comum; estilo por `[data-active]` e `[aria-current="page"]`; `noScroll` no JSX (única grafia que passa no typecheck; o DOM normaliza para `noscroll`, que o router lê) |
| `<Navigate>` | `useNavigate()` no setup ou redirect no preload |
| `useCurrentMatches` | `useRouteMatches` |
| `createAsync`, `createAsyncStore` | `createMemo`, `createProjection`, `createOptimistic` ou `createOptimisticStore` lendo a `query` |
| `cache` | `query` |
| `useSubmission` | otimismo por `.onSubmit(...)` e histórico por `useSubmissions(...).at(-1)` |
| `json(data, init)` | `respond(data, init)` de `@solidjs/web` |
| `redirect`, `reload` do router | os mesmos de `@solidjs/web` |

## Armadilhas do router instalado

- `useLocation`, `useParams` e `useNavigate` resolvem o contexto do `<Router>` na chamada e lançam sem ele. Chame no corpo do componente, sob o provider, e guarde o valor; handler ou getter tardio pode rodar fora do contexto.
- Trailing slash é ignorado na comparação de rota ativa: `<a href="/admin/">` recebe `[aria-current="page"]` e `[data-active]` em `/admin`, `/admin/` e descendentes como `/admin/users`.
- `useBeforeLeave` expõe um único evento por navegação: os listeners compartilham `defaultPrevented` e cada um lê o estado deixado pelos anteriores. Só o listener mais interno chama `e.preventDefault()`; os demais leem `e.defaultPrevented`.
- Se o router já administra carregamento, cache e cancelamento de uma consulta, não ponha outra camada de cache por componente; estado puramente local não vai ao roteador. Não importe `query` ou route loader de outro pacote porque um tutorial usa.

## Leitura granular, identidade e ingestão

Contrato: leia as folhas que o componente precisa. Desde `@solidjs/web` rc.8, `style={state.style}` e `class={row.classes}` com expressão não inline passam por `readShallow`: mudar uma chave do objeto já reativa o binding. Trocar a identidade segue como caminho mais barato para mudanças grandes.

Armadilha: `deep` na store inteira, seletor que percorre milhares de registros por tecla ou snapshot para espalhar tudo eliminam a granularidade; desestruturar no corpo para "otimizar" remove atualizações; envolver tudo em `createMemo` custa nós. Comparar cada linha de uma lista grande contra um signal de seleção cria fan-out amplo; um mapa derivado por chave ou uma projection reduz invalidações, mas só com problema medido, e teste a fidelidade da seleção depois.

Use IDs estáveis para reconciliar; escolha `reconcile`/keyed para manter identidade sem esconder mudanças de campos. `shallow` serve a ingestão imutável e coleções grandes, não é default. Não converta entidades em proxies e de volta a JSON repetidamente; valide na entrada, mapeie para domínio e devolva do servidor só o necessário.

Armadilha: em monorepo, cópias independentes de `solid-js` quebram reatividade cruzada sem erro visível (um `effect` de uma cópia não rastreia `signal` da outra). Declare `solid-js`, `solid-js/*` e `@solidjs/web` como `external` no build de pacote interno; dentro do Vite, prefira `resolve.dedupe` ([ambiente](01-environment-imports-and-types.md)).

## Diagnósticos de custo

`ASYNC_WATERFALL` no servidor aponta flights em série dentro de um `Loading`; `HOT_SCOPE_FANOUT` no cliente agrega escopos quentes pela causa raiz. `markFlight(promise, startedAt)`, de `solid-js/attribution`, registra o início de um fetch. Uso e limites em [diagnósticos](15-diagnostics-checklists-and-recipes.md#diagnósticos-de-custo).
