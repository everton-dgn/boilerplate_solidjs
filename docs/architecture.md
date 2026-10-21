# Arquitetura e convenções

[Voltar ao README](../README.md)

## Rotas e organização

As páginas em `src/routes` usam `export default` e são descobertas pelo
`filesystem-routing`. `index.tsx` define `/`, `[id].tsx` define um parâmetro
dinâmico e `[...404]/index.tsx` captura caminhos desconhecidos. O
`export const route` define opções como `preload`, usado pelo fallback para
responder com HTTP 404. Componentes colocalizados podem ficar em pastas
`components` dentro de `routes`: use exportações nomeadas para que eles não
sejam registrados como páginas. Não é necessário editar `src/router.ts` ao
adicionar uma página.

O arquivo `src/routes/(base).tsx` define o layout compartilhado com `Topbar` e
renderiza `props.children` com `RouteSectionProps`. Sua pasta `(base)/` contém
`(home)/index.tsx` e `[...404]/index.tsx`. Os grupos entre parênteses não
aparecem na URL. O router usa o caminho sem idioma para matching; a Home
responde em `/pt`, `/en` e `/es`, e o fallback mantém a barra de navegação.
`App.tsx` mantém o provider, o SEO e a boundary global, que também captura
falhas no layout. As fixtures E2E têm sua própria árvore e reexportam esse
layout para as páginas, incluindo Home e 404.

Rotas de API são módulos de `src/routes` que exportam `GET`, `POST` ou outro
método HTTP em vez de `export default`. O `createAPIHandler` em
`src/middleware/index.ts` responde a essas requisições antes do SSR e deixa
passar as demais. O caminho relativo a `src/routes` vira a URL sem a extensão, o
segmento `index` e os grupos entre parênteses. Assim,
`(seo)/sitemap.xml/index.ts` atende `/sitemap.xml`; colchetes continuam
indicando parâmetros dinâmicos. Uma rota pode devolver `Response.redirect()`:
como os headers dessa resposta são imutáveis, o middleware grava os cabeçalhos
de segurança numa cópia.

O middleware `requestContext` cria um UUID por requisição e o guarda em
`locals.requestId`, disponível no evento de requisição do Solid.

O plugin gera `src/@types/routes.d.ts` com os caminhos tipados durante o build
ou desenvolvimento. Mantenha essa declaração versionada e atualizada ao mudar as
rotas, para permitir typecheck antes de iniciar o Vite.

O [tsconfig.json](../tsconfig.json) mantém TypeScript em modo estrito, com
`erasableSyntaxOnly` para restringir a sintaxe TypeScript que exige
transformação além da remoção de tipos.

Tipos, estilos específicos, testes e primitives usados por um único componente
ficam junto dele, incluindo `Button/styles.module.css`. As utilidades globais
ficam em `theme/class/`, e `theme/tokens/` concentra os valores visuais
consumidos pelo CSS. `helpers/` contém funções puras compartilhadas; um módulo
usado por uma única rota fica ao lado dela em `routes/`, sem export default nem
handler HTTP, e por isso não vira rota. `infra/adapters/` isola as APIs do
navegador, e `infra/server/` concentra o transporte de backend, a proteção das
operações, a criação de erros públicos e o estado de integridade do render. Os
módulos de servidor usam `server-only`; consulte o
[contrato de erros no servidor](server-errors.md). O prefixo `make` identifica
utilitários sem estado reativo próprio, como `makeThemeChannel`, que devolve seu
descarte. O prefixo `create` identifica primitives com estado ou efeitos
reativos, como `createTheme`.

Imports de CSS Modules usam o nome `S`, por exemplo,
`import S from './styles.module.css'`. A regra local
`project/css-modules-import` do lint exige esse formato.

## Dados e infraestrutura

Quando houver consumidores de formatação de datas, moedas ou números, coloque
essas funções em `data/formatters/`, com testes junto delas. Normalização de
erros de domínio de APIs, quando necessária, fica em `data/errorApi/`. Essas
pastas de `data/` são convenções para novos consumidores; atualmente não contêm
módulos. A criação de erros públicos exclusivos do servidor fica em
[`infra/server/publicErrors/`](../src/infra/server/publicErrors/index.ts), junto
da proteção das operações de backend. Requisições e persistência continuam em
`infra/`. Validação de tema continua em `helpers/isTheme/`.

## Dependências entre camadas

`architecture/layer-imports`, em `tooling/architecturePolicy/index.ts`, verifica
as dependências diretas de imports e reexportações pelos caminhos locais. As
restrições são:

| Origem                                                                          | Dependências proibidas                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `helpers`, `constants`, `@types`, `data`, `infra`, `theme`, `i18n`, `paraglide` | `primitives`, `components`, `routes` e entradas da aplicação |
| `primitives`                                                                    | `components`, `routes` e entradas da aplicação               |
| `components/atoms`                                                              | `components/molecules` e `components/organisms`              |
| `components/molecules`                                                          | `components/organisms`                                       |
| Qualquer módulo de produção em `src`                                            | Testes, fixtures de `src/tests` e `tooling`                  |

As entradas são `App`, `Document`, `entry-server`, `entry-client`, `router` e
`middleware`. A classificação parte da raiz de `src`: primitives colocalizadas
dentro de um componente continuam na camada desse componente. Testes
(`*.test.*`, `*.spec.*`, `__tests__` e `src/tests`) podem importar as camadas
que verificam. A declaração gerada `src/@types/routes.d.ts` continua excluída do
lint.

Nos diagnósticos, `base` identifica as pastas da primeira linha, `entry`
identifica as entradas e `source` os demais módulos de `src`.

A regra normaliza `@/`, `/src/` e caminhos relativos. Verifica reexportações,
imports só de tipo e `import()` com string ou template sem interpolação. Pacotes
externos, módulos virtuais e caminhos calculados não são resolvidos. Cada
declaração é verificada no arquivo que a contém, sem seguir a cadeia de módulos
importados. `import.meta.glob` e outros carregadores exigem revisão. Ao criar
uma camada ou alias, atualize a classificação e os testes. O lint de camadas não
substitui o contrato de [erros de servidor](server-errors.md).

A implementação usa `defineRule` e `definePlugin` de `vite-plus/lint/plugins`,
com `RuleTester` de `vite-plus/lint/plugins-dev`, sem dependência adicional.
Execute os comandos a partir da raiz do projeto. `vp run check:ci` verifica o
código atual; `vp run test:tooling` testa a política, seu registro no lint e as
restrições de backend. Os dois comandos rodam no CI.
