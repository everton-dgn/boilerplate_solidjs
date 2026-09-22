<h1 align="center">SolidJS + Vite+ Boilerplate</h1>

<br />

# :memo: Sobre o Projeto

Boilerplate enxuto para iniciar projetos com SolidJS, renderização no servidor
(SSR), server functions e Vite+ como toolchain única. A base traz roteamento,
middleware, servidor Nitro e a esteira de qualidade (formatação, lint, tipos,
testes e hooks de git), sem aplicação de produto pronta.

<br />

---

# :globe_with_meridians: Tecnologias

| Categoria         | Tecnologia                                                |
| ----------------- | --------------------------------------------------------- |
| Framework         | SolidJS (`solid-js` + `@solidjs/web`)                     |
| Roteamento        | `@solidjs/router`                                         |
| Renderização      | SSR com hidratação e server functions                     |
| Linguagem         | TypeScript (modo estrito, `erasableSyntaxOnly`)           |
| Toolchain         | Vite+ (`vp`): Vite, Rolldown, Vitest, Oxlint, Oxfmt       |
| Servidor          | Nitro, com preset Vercel e preview local                  |
| Testes            | Vitest com projetos `node`, `dom` (happy-dom) e `browser` |
| Testes no browser | Vitest Browser Mode + Playwright (Chromium)               |
| Lint              | Oxlint (type-aware) + `eslint-plugin-solid`               |
| Formatação        | Oxfmt                                                     |
| Hooks do Git      | Lefthook + Commitlint                                     |

<br />

---

# :triangular_flag_on_post: Funcionalidades

- [x] SSR com hidratação no cliente e `Document` próprio (`src/Document.tsx`)
- [x] Toolchain configurada para server functions com `'use server'`
- [x] Middleware de servidor: `server-timing`, cabeçalhos de segurança e
      `requestId` por requisição
- [x] Roteamento com lazy loading e rota 404 respondendo com status HTTP correto
- [x] SEO: canonical e Open Graph por rota com `useHead`, imagem social,
      `sitemap.xml` e `llms.txt` gerados a partir do manifesto de rotas e
      `robots.txt` com bloqueio de robôs de treinamento de IA
- [x] Layout responsivo com Topbar, página inicial e páginas de erro
- [x] Botão, menu de tema e componentes de página com CSS Modules
- [x] Tema claro, escuro ou do sistema (padrão), aplicado antes da hidratação,
      com persistência e sincronização entre abas
- [x] Nitro para servir estáticos e SSR, com preset Vercel e preview local
- [x] Três projetos de teste separados por sufixo de arquivo:
      `*.node.test.{ts,tsx}`, `*.dom.test.{ts,tsx}` e `*.browser.test.{ts,tsx}`
- [x] Lint type-aware com regras de acessibilidade (`jsx-a11y`), promessas,
      imports e regras específicas do Solid
- [x] TypeScript com configurações para aplicação e ferramentas Node, com cache
      incremental
- [x] Hooks de git: format + lint no commit, typecheck, testes e build no push
- [x] Conventional Commits validados no `commit-msg`
- [x] Versões de Node e pnpm fixadas em `package.json` e baixadas
      automaticamente quando ausentes (`devEngines`)

<br />

---

# :straight_ruler: Convenções

As páginas em `src/routes` usam `export default` e são descobertas pelo
`filesystem-routing`. `index.tsx` define `/`, `[id].tsx` define um parâmetro
dinâmico e `[...404].tsx` captura caminhos desconhecidos. O `export const route`
define opções como `preload`, usado pelo fallback para responder com HTTP 404.
Componentes colocalizados podem ficar em pastas `components` dentro de `routes`:
use exportações nomeadas para que eles não sejam registrados como páginas. Não é
necessário editar `src/router.ts` ao adicionar uma página.

O arquivo `src/routes/(base).tsx` define o layout compartilhado com `Topbar` e
renderiza `props.children` com `RouteSectionProps`. Sua pasta `(base)/` contém
`(home)/index.tsx` e `[...404].tsx`. Os grupos entre parênteses não aparecem na
URL: a Home continua em `/` e o fallback mantém a barra de navegação. `App.tsx`
mantém o provider, o SEO e a boundary global, que também captura falhas no
layout. As fixtures E2E têm sua própria árvore e reexportam esse layout para as
páginas, incluindo Home e 404.

Rotas de API são módulos de `src/routes` que exportam `GET`, `POST` ou outro
método HTTP em vez de `export default`. O `createAPIHandler` em
`src/middleware/index.ts` responde a essas requisições antes do SSR e deixa
passar as demais. O nome do arquivo vira o caminho sem a extensão, então
`sitemap.xml.ts` atende `/sitemap.xml`; colchetes continuam indicando parâmetros
dinâmicos.

O plugin gera `src/@types/routes.d.ts` com os caminhos tipados durante o build
ou desenvolvimento. Mantenha essa declaração versionada e atualizada ao mudar as
rotas, para permitir typecheck antes de iniciar o Vite.

Tipos, estilos específicos, testes e primitives usados por um único componente
ficam junto dele, incluindo `Button/styles.module.css`. As utilidades globais
ficam em `theme/class/`, e `theme/tokens/` concentra os valores visuais
consumidos pelo CSS. `helpers/` contém funções puras compartilhadas; um módulo
usado por uma única rota fica ao lado dela em `routes/`, sem export default nem
handler HTTP, e por isso não vira rota. `infra/adapters/` isola as APIs do
navegador, e `infra/server/` concentra o transporte de backend, a proteção das
operações e a criação de erros públicos. Os módulos de servidor usam
`server-only`; consulte o
[contrato de erros no servidor](docs/server-errors.md). O prefixo `make`
identifica utilitários sem estado reativo próprio, como `makeThemeChannel`, que
devolve seu descarte. O prefixo `create` identifica primitives com estado ou
efeitos reativos, como `createTheme`.

Imports de CSS Modules usam o nome `S`, por exemplo,
`import S from './styles.module.css'`. A regra local
`project/css-modules-import` do lint exige esse formato.

### Dependências entre camadas

`architecture/layer-imports`, em `tooling/architecturePolicy/index.ts`, verifica
as dependências diretas de imports e reexportações pelos caminhos locais. As
restrições são:

| Origem                                                     | Dependências proibidas                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `helpers`, `constants`, `@types`, `data`, `infra`, `theme` | `primitives`, `components`, `routes` e entradas da aplicação |
| `primitives`                                               | `components`, `routes` e entradas da aplicação               |
| `components/atoms`                                         | `components/molecules` e `components/organisms`              |
| `components/molecules`                                     | `components/organisms`                                       |
| Qualquer módulo de produção em `src`                       | Testes, fixtures de `src/tests` e `tooling`                  |

As entradas são `App`, `Document`, `router` e `middleware`. A classificação
parte da raiz de `src`: primitives colocalizadas dentro de um componente
continuam na camada desse componente. Testes (`*.test.*`, `*.spec.*`,
`__tests__` e `src/tests`) podem importar as camadas que verificam. A declaração
gerada `src/@types/routes.d.ts` continua excluída do lint.

Nos diagnósticos, `base` identifica as seis pastas da primeira linha, `entry`
identifica as entradas e `source` os demais módulos de `src`.

A regra normaliza `@/`, `/src/` e caminhos relativos. Verifica reexportações,
imports só de tipo e `import()` com string ou template sem interpolação. Pacotes
externos, módulos virtuais e caminhos calculados não são resolvidos. Cada
declaração é verificada no arquivo que a contém, sem seguir a cadeia de módulos
importados. `import.meta.glob` e outros carregadores exigem revisão. Ao criar
uma camada ou alias, atualize a classificação e os testes. O lint de camadas não
substitui o contrato de [erros de servidor](docs/server-errors.md).

A implementação usa `defineRule` e `definePlugin` de `vite-plus/lint/plugins`,
com `RuleTester` de `vite-plus/lint/plugins-dev`, sem dependência adicional.
Execute os comandos a partir da raiz do projeto. `pnpm check:ci` verifica o
código atual; `pnpm test:tooling` testa a política, seu registro no lint e as
restrições de backend. Os dois comandos rodam no CI.

### Regras de CSS

Execute `pnpm lint:css` para verificar todos os arquivos CSS de `src/`. O
comando faz parte de `pnpm lint` e `pnpm check:ci`. O pre-push e o CI executam
essa verificação. O pre-commit usa apenas `vp check --fix` nos arquivos staged,
sem executar o lint de CSS. `vp lint` e `vp check` chamados diretamente
continuam sendo os comandos internos do Vite+.

- Classes de todo o projeto usam snake_case, como `.home_link` e `.sr_only`.
  Nomes de uma palavra, como `.btn` e `.page`, continuam válidos.
- Componentes com variantes e tamanhos usam classes independentes da classe
  base, com os prefixos `variant_` e `size_`, como `.variant_default` e
  `.size_sm`. Concatene o prefixo com o valor da prop no acesso ao CSS Module,
  sem mapas de constantes. Use nesting para estados e media queries de cada
  classe.
- Tokens usam nomes em kebab-case, como `--color-primary-hover`. A regra
  `custom-property-no-missing-var-function` detecta a ausência de `var()` para
  tokens declarados no mesmo arquivo. Nas propriedades protegidas pelo plugin de
  tokens, valores sem `var()` também são rejeitados.
- Seletores e media queries inválidos, seletores duplicados no mesmo contexto e
  etapas duplicadas em `@keyframes` geram erro.
- Nomes e valores desconhecidos em media features, operadores sem os espaços
  obrigatórios em `calc()` e `@import` em posição inválida geram erro.
- Fora de `src/theme/`, `color-mix()` e `light-dark()` são proibidos.
  `stylelint-declaration-strict-value` exige tokens nas propriedades de cor,
  `background`, `fill`, `stroke`, sombras, `font-size`, `font-weight`, `z-index`
  e `border-radius` (incluindo cantos físicos e lógicos), com análise das
  abreviações suportadas pelo plugin. Funções locais não são liberadas;
  gradientes compartilhados ficam nos tokens. Valores como `transparent`,
  `currentColor`, `inherit`, `none` e `auto` são permitidos. O tema pode definir
  os valores e manter as cores de sistema usadas no reset de alto contraste. O
  plugin não escolhe tokens nem aplica correções automáticas. Sua análise de
  abreviações é experimental e não cobre toda a sintaxe CSS.
- Propriedades, valores, unidades, cores hexadecimais, pseudoclasses e at-rules
  desconhecidos geram erro. `:global` e `:local` não são permitidos; os estilos
  globais ficam em `src/theme/`.
- Declarações duplicadas e abreviações que sobrescrevem propriedades anteriores
  geram erro. Fallbacks consecutivos com sintaxes diferentes são permitidos.
- Nomes de animação devem ter `@keyframes` no próprio arquivo ou nas referências
  compartilhadas, incluindo `src/theme/class/animation.css`.
- `no-unknown-custom-properties` rejeita `var(--token)` sem definição no próprio
  arquivo ou em `src/theme/tokens/**/*.css`. Por exemplo, `var(--backgroud)`
  gera erro; `var(--color-background)` é reconhecido. A regra nativa aceita
  variáveis desconhecidas com fallback, como `var(--opcional, red)`. As
  referências compartilhadas usam `referenceFiles`, recurso experimental do
  Stylelint.
- Fora de `src/theme/`, inclusive nas rotas, o nome obrigatório é
  `styles.module.css`. Em `src/theme/`, use nomes como `colors.css` e
  `zIndex.css`.
- O limite é de dois níveis de nesting dentro de uma regra. O Stylelint
  desconsidera at-rules na raiz ao contar essa profundidade.
- `stylelint-use-nesting` aponta seletores e media queries adjacentes que podem
  ser aninhados. Essa regra não encontra toda oportunidade de nesting entre
  blocos distantes. Os comandos do projeto não aplicam correção automática de
  CSS, para preservar a ordem da cascata.

A regra `project/css-filename` do plugin local do Oxlint valida os nomes dos
arquivos CSS referenciados por imports e reexportações em JS/TS. O comando
`lint:css` reutiliza essa validação para todos os arquivos CSS em `src/`,
inclusive aqueles sem imports em JS/TS.

`pnpm test:tooling` verifica o comportamento dos verificadores com casos em
memória e roda nos hooks e no CI. O lint do CSS real continua automático, e suas
violações bloqueiam a validação até serem corrigidas.

Quando houver consumidores de formatação de datas, moedas ou números, coloque
essas funções em `data/formatters/`, com testes junto delas. Normalização de
erros de domínio de APIs, quando necessária, fica em `data/errorApi/`. Essas
pastas de `data/` são convenções para novos consumidores; atualmente não contêm
módulos. A criação de erros públicos exclusivos do servidor fica em
[`infra/server/publicErrors/`](src/infra/server/publicErrors/index.ts), junto da
proteção das operações de backend. Requisições e persistência continuam em
`infra/`. Validação de tema continua em `helpers/isTheme/`.

### Falhas de backend e recuperação

`App` usa um `Errored` global, que substitui a aplicação e o cabeçalho pelo
fallback. A chamada atual está na fixture E2E `readBackend`, protegida por
`requestJson` e pelo registro central de server functions. Antes de criar uma
integração, leia [o contrato de erros no servidor](docs/server-errors.md): ele
define a saída pública, os limites do lint e a retirada futura do wrapper.

O link "Recarregar página" preserva a URL e funciona sem JavaScript. Ele refaz o
carregamento inicial; ações posteriores precisam ser repetidas. O `query` cuida
do cache e pressupõe uma server function com saída pública validada:

```tsx
const getBackend = query(readBackend, 'backend')

export default function Page() {
  const data = createMemo(() => getBackend('example'))
  return <h1>{data().message}</h1>
}
```

O registro central protege server functions no SSR e no HTTP. Exceções de render
fora dessas funções ainda dependem do runtime. O E2E verifica o payload e tolera
somente a mensagem pública fixa repetida durante a hidratação. Após o envio
inicial do streaming, o status HTTP pode permanecer 200.

O tema começa em `system`. O cookie `app-theme` guarda a preferência por um ano,
com `Path=/`, `SameSite=Lax` e `Secure` em HTTPS, restrito ao host atual. O
`Document` lê esse cookie na requisição e entrega o tema explícito no HTML,
mesmo sem JavaScript. O script diretamente no `head` resolve a preferência do
sistema antes da hidratação, e `Provider` mantém uma instância de estado por
árvore. O seletor aplica a escolha imediatamente, antes de tentar persistir o
cookie. `BroadcastChannel` sincroniza abas da mesma origem; ao recuperar foco,
ficar visível ou receber `pageshow`, a aba relê o cookie. Sem o canal, a
sincronização acontece nesses eventos. Se o cookie não puder ser gravado, a
escolha fica em memória e ainda pode ser propagada pelo canal. Ela é preservada
ao retornar à aba enquanto o cookie não mudar e é perdida ao recarregar. O tema
não usa `localStorage`. `infra/adapters/themeStorage/` lê e grava o cookie,
`infra/adapters/applyTheme/` aplica o tema no DOM,
`infra/adapters/makeBroadcastChannel/` encapsula o canal entre abas para
qualquer domínio, `infra/adapters/makeThemeChannel/` concentra a regra de tema
sobre esse canal, `infra/adapters/makeSystemTheme/` observa a preferência do
sistema e `@types/theme.ts` define os tipos compartilhados, mantendo `theme/` só
com CSS. As cores usam `light-dark()` com `color-scheme`, para definir cada par
uma vez e seguir o sistema também quando JavaScript está desabilitado.

### SEO e metadados

`VITE_SITE_URL` no `.env` é obrigatória e define a URL pública do site, validada
em `env.ts`. `SeoHead`, renderizado dentro do `Router` em `App.tsx`, usa
`useHead` do `@solidjs/web` para publicar `canonical`, `og:url`, `og:type`, a
imagem social absoluta (Open Graph e Twitter, com dimensões e texto alternativo)
e um `<script type="application/ld+json">` para a rota atual, inclusive na
navegação no cliente. As tags sociais que não variam por rota (`og:locale`,
`og:site_name`, `twitter:card`, `twitter:site` e `twitter:creator`) também saem
do `SeoHead`, para acompanhar a regra de `noindex` abaixo; em `Document.tsx`
fica só `author`. Não repita no `Document.tsx` uma tag que o `SeoHead` publica,
porque o crawler lê a primeira ocorrência.

Cada página pode exportar `route.info.seo` com `title`, `description`,
`noindex`, `type`, `image` e `article`. Isso não muda sua estratégia de
renderização nem torna a página estática: são metadados, disponíveis também em
rotas com parâmetros. `SeoHead` lê a cadeia de rotas ativas com
`useRouteMatches` e publica esses campos no título, na descrição, no Open Graph,
no Twitter e no JSON-LD usando `useHead`. A rota filha sobrescreve os campos que
declara e herda os demais do layout; `image` é mesclada atributo a atributo
(`path`, `width`, `height`, `alt`). Sem definição na cadeia, título, descrição e
imagem vêm de `SITE`, `type` é `website` e `noindex` é `false`. Por isso a home
não declara `seo`: ela usa exatamente esses padrões. Página indexável publica
`robots` com `index, follow, max-image-preview:large`: os dois primeiros já são
o padrão do crawler e o terceiro libera a prévia grande da imagem no Google
Discover. Escolha do projeto: com `noindex: true`, o `SeoHead` publica só
`robots: noindex`, título e descrição. Canonical, Open Graph, Twitter (inclusive
`og:locale`, `og:site_name` e `twitter:card`) e JSON-LD ficam de fora, inclusive
na página 404. Neste boilerplate esses metadados só têm consumidor em páginas
indexáveis; a canonical da 404 apontava para a URL inexistente digitada, e o
JSON-LD declarava um `WebPage` nela. Uma filha pode sobrescrever `noindex` com
`false` explicitamente. Limite conhecido: página `noindex` feita para
compartilhamento (convite, resultado, campanha) ainda não tem suporte e deixa de
fornecer metadados explícitos para a prévia social. Quando esse caso surgir,
acrescente um campo em `route.info.seo` que devolva Open Graph e Twitter sem
canonical nem JSON-LD.

`type` aceita `website` e `article`. Ele define `og:type` e o nó da página no
JSON-LD: `WebPage` por padrão, ou `Article` com `headline`, `author` (nó
`Person` com nome, URL e perfis de `SITE.author`, os perfis em `sameAs`),
`publisher` e, quando a rota declara `article: { datePublished, dateModified }`
em ISO 8601, essas datas no nó e nas metas `article:published_time` e
`article:modified_time`. Fora de `article`, as datas são ignoradas. O JSON-LD,
montado por `SeoHead/buildStructuredData/`, publica sempre um nó `WebSite`, o nó
da página com URL canônica, descrição, idioma e imagem, e um nó `Organization`
com nome, URL, logo (`SITE.logo`, ao menos 112x112 pixels) e perfis oficiais
(`SITE.socialLinks`, em `sameAs`). `WebSite.publisher` e `Article.publisher`
apontam para esse nó pelo `@id` `<VITE_SITE_URL>/#organization`. O grafo é
tipado com `schema-dts`, então propriedade inválida falha no typecheck; as
dimensões da imagem ficam só no Open Graph. O idioma vem de `SITE.locale`, que
também alimenta o `lang` do `Document.tsx` e o `og:locale` (com sublinhado).
`helpers/serializeJsonLd/` escapa `<`, `>` e `&` como sequências JSON para não
encerrar o `<script>`. Os handles do Twitter saem de `SITE.twitter`
(`twitter:site`, a conta do site) e de `SITE.author.twitter` (`twitter:creator`,
a conta do autor). O LinkedIn não tem meta tag própria: ele lê o Open Graph para
a prévia, e o perfil entra só no `sameAs`. Dados que o projeto não tem, como
`hreflang`, não são publicados.

Esse grafo base é fixo de propósito. Tipos que dependem da página (`Product`,
`FAQPage`, `BreadcrumbList`, `Event`) entram pela primitive
`createStructuredData`, chamada no corpo do componente da rota. Ela recebe um
accessor `() => data` e publica um segundo `<script type="application/ld+json">`
com `@context`. Os dados podem ser um nó ou uma lista (vira `@graph`) e são
tipados com `schema-dts`, os tipos do schema.org mantidos pelo Google, então
propriedade inválida falha no typecheck. A primitive acompanha as mudanças do
accessor, remove o script ao descartar seu escopo e convive com outras
instâncias na mesma página. Retornar `undefined` suspende a publicação; quando o
accessor voltar a fornecer dados, o script reaparece. Para ligar o nó ao grafo
base, use o `@id` da página (a URL canônica), do site
(`<VITE_SITE_URL>/#website`) ou da organização
(`<VITE_SITE_URL>/#organization`). A primitive não consulta `noindex`: uma rota
fora do índice que a utiliza publica o JSON-LD mesmo assim.

```tsx
import { createStructuredData } from '@/primitives/createStructuredData/index.ts'

export default function FaqPage() {
  createStructuredData(() => ({
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'O que é o boilerplate?',
        acceptedAnswer: { '@type': 'Answer', text: 'Uma base SolidJS.' }
      }
    ]
  }))

  return (
    <main>
      <h1>Perguntas frequentes</h1>
    </main>
  )
}
```

```tsx
import type { RouteDefinition } from '@solidjs/router'

export const route = {
  info: {
    seo: {
      title: 'Sobre nós',
      description: 'Conheça nossa equipe.',
      type: 'article',
      image: { path: '/images/equipe.png', alt: 'Foto da equipe' }
    },
    llms: { section: 'Empresa' }
  }
} satisfies RouteDefinition
```

O `llms.txt` coleta os mesmos metadados pelo manifesto, sem renderizar páginas
nem executar preloads, e publica só as páginas que declaram `route.info.llms`. O
arquivo é um índice curado para modelos de linguagem, não um sitemap: em sites
grandes, selecione as páginas que explicam o produto e agrupe-as. `llms: true`
inclui a página; sem seção herdada, ela entra na seção padrão `Páginas`.
`{ section: 'Guias' }` cria ou reutiliza uma seção com esse nome, na ordem em
que aparece no manifesto; `{ optional: true }` move a página para a seção
`Optional`, que o formato reserva ao conteúdo que o modelo pode pular, e uma
seção declarada com esse nome se funde a ela. A configuração é herdada pela
cadeia de rotas: um layout com `llms: { section: 'Docs' }` inclui suas filhas
nessa seção, uma filha pode sair com `llms: false` ou sobrescrever só o campo
que declara, e `llms: true` numa filha reativa a inclusão preservando seção e
marcação opcional herdadas. `noindex: true` exclui a página do sitemap e do
llms.txt, mesmo com a flag. O filtro considera a configuração efetiva da página,
incluindo herança e a rota de índice filha.

O `llms.txt` só lista URLs sem parâmetros. No sitemap, uma rota com parâmetro
entra pelas entradas de `route.info.sitemap`: uma função, síncrona ou
assíncrona, que devolve `{ path, lastmod? }` com caminhos absolutos do site,
enumerados a partir da fonte de dados. O módulo da rota entra no bundle do
cliente, então banco e SDK ficam numa server function chamada pela fonte,
conforme o [contrato de erros no servidor](docs/server-errors.md). A fonte roda
a cada request do sitemap (o CDN reutiliza a resposta por uma hora) e é ignorada
sob `noindex`, próprio ou herdado; numa página sem parâmetro ela não tem efeito.
As entradas são validadas na fronteira: caminho que não começa com `/`, com
host, esquema, query, fragmento ou espaço falha; barras finais e repetidas são
normalizadas; caminho repetido mantém a primeira ocorrência (a página estática
antes da fonte); `lastmod` fora do W3C Datetime é omitido. Falha de qualquer
fonte, entrada inválida, prazo estourado ou sitemap acima do limite do protocolo
(os dois valores ficam em `sitemap.xml/constants.ts`) respondem 503 sem corpo e
sem cache: o crawler tenta de novo e o CDN mantém a última cópia boa, em vez de
guardar um sitemap parcial por uma hora. Títulos carregados em runtime ainda
podem usar `useHead`, mas essas alterações não são lidas pelo gerador.

```tsx
import type { RouteDefinition } from '@solidjs/router'

import { listPostEntries } from './listPostEntries/index.ts'

// blog/[slug].tsx: `listPostEntries` é uma server function que devolve
// `{ path: '/blog/meu-post', lastmod: '2026-09-21' }` por registro publicado.
export const route = {
  info: { seo: { type: 'article' }, sitemap: listPostEntries }
} satisfies RouteDefinition
```

Para que `noindex` seja respeitado pelas listas, declare-o em `route.info.seo`,
em vez de acrescentar apenas uma tag HTML avulsa.

A travessia do manifesto é iterativa, para não depender do limite de recursão do
JavaScript. O coletor do sitemap lê caminhos, `noindex`, `type` e as datas de
artigo, sem resolver título ou descrição. O coletor do `llms.txt` resolve também
os metadados das páginas. O registro histórico da medição dos casos extremos
está em [desempenho da coleta de SEO](docs/seo-performance.md).

`sitemap.xml/`, `robots.txt/` e `llms.txt/` são rotas de API (`index.ts`): o
sitemap lista as páginas estáticas do manifesto de rotas, sem o fallback 404 e
sem `noindex`, com `<lastmod>` nas páginas `article` (a mesma data do JSON-LD,
`dateModified` ou `datePublished`), mais as entradas das fontes de
`route.info.sitemap`, e o llms.txt publica, em Markdown, as notas de
`llms.txt/constants.ts` (fatos que o agente precisa saber antes de abrir os
links: idioma, o que o site oferece, o que não existe) e, em seguida, título e
descrição das páginas selecionadas por `route.info.llms`, agrupadas por seção.
Reescreva as notas em cada projeto derivado. O `Document.tsx` anuncia esse
arquivo em todas as páginas com `<link rel="describedby" href="/llms.txt">`, a
descoberta recomendada pela spec do llms.txt; agentes não são redirecionados. O
robots publica os grupos de `robots.txt/constants.ts`: `*` com `Allow: /` e
`Disallow: /_server` (endpoint das server functions), robôs de treinamento de IA
com `Disallow: /`, e o link do sitemap. Buscadores e agentes que leem páginas a
pedido do usuário continuam liberados, porque são o público do llms.txt.
`Disallow` é um pedido que robôs mal comportados ignoram e não remove URL do
índice; para isso, use `noindex` em `route.info.seo`. Em produção o processo
guarda em memória a resposta do robots e do llms.txt e a leitura do manifesto do
sitemap, porque o manifesto, os grupos e a URL do site são fixos no build; as
fontes do sitemap rodam a cada request. Os três arquivos saem com
`public, max-age=0, s-maxage=3600` em produção (o CDN reutiliza por uma hora; a
Vercel só cacheia resposta de função com `s-maxage`) e com `no-store` em
desenvolvimento. As URLs absolutas dos três arquivos partem da origem de
`VITE_SITE_URL`; um site servido em um subcaminho não é suportado por essa
geração. A página 404 declara `robots: noindex`. A imagem social fica em
`public/images/og.png`, com cache imutável configurado em `vercel.json`; o logo
do JSON-LD reutiliza `public/favicon/apple-touch-icon.png`.

<br />

---

# :white_check_mark: Pré-requisitos

As versões exatas vivem no `package.json`, não nesta página:

- **Node**: a linha declarada em `engines.node`. O bloco `devEngines` fixa a
  versão exata e, com `onFail: download`, o pnpm baixa o runtime se a versão
  local não bater.
- **pnpm**: a versão fixada em `packageManager`. Instale qualquer versão recente
  (`brew install pnpm`) e o próprio pnpm troca para a versão fixada ao rodar
  dentro do projeto.
- **Chromium do Playwright**: só para `pnpm test:browser`. Não é baixado no
  `pnpm install`; instale uma vez com `pnpm test:browser:install`.

Ao subir a linha do Node, altere `engines` e `devEngines` no mesmo commit.

<br />

---

# :rocket: Primeiros Passos

```bash
# Clonar o repositório
git clone git@github.com:everton-dgn/boilerplate_solidjs.git
cd boilerplate_solidjs

# Instalar o pnpm (se ainda não tiver)
brew install pnpm

# Instalar dependências (instala os hooks do Lefthook)
pnpm i

# Instalar o Chromium para os testes de browser (uma vez)
pnpm test:browser:install

# Iniciar servidor de desenvolvimento
pnpm dev
```

Disponível em http://127.0.0.1:3000, conforme `HOST` e `PORT` no `.env`.

Para conferir o build de produção localmente, incluindo SSR e server functions:

```bash
pnpm build && pnpm start
```

O preview usa o Vite+ com a integração do Nitro. O `.env` versionado contém os
valores locais de `HOST` e `PORT`, usados tanto pelo dev quanto pelo preview, e
`VITE_SITE_URL`, a URL pública obrigatória dos metadados de SEO. Ele também é
carregado durante o build; variáveis já definidas no ambiente têm prioridade.
Para escolher outra porta ou interface no preview, use `pnpm start --port 3001`
ou `pnpm start --host 0.0.0.0`.

`pnpm start` é um alias do preview local. Em produção, configure as variáveis na
plataforma de hospedagem; o comando `preview` é destinado à conferência local.

O Nitro usa `preset: 'vercel'` no `vite.config.ts` e gera a função SSR e os
estáticos em `.vercel/output/`. O plugin do Solid gera a entrada SSR, que o
Nitro usa diretamente. As requisições de server functions usam a integração
nativa entre Solid e Nitro/srvx.

Para gerar o artefato da Vercel:

```bash
pnpm build
```

Esse comando gera `.vercel/output/`, incluindo estáticos e a função SSR com
runtime Node. O `vercel.json` define esse comando como build do projeto. Na
Vercel, importe o repositório e deixe o diretório de saída sem override manual
para usar a Build Output API. Gerar o artefato localmente não publica a
aplicação.

O Nitro é definido no [package.json](package.json). Ao atualizá-lo, valide o
build Vercel, o preview local e os E2E. Os diretórios gerados `.output/`,
`.nitro/` e `.vercel/` são ignorados pelo Git.

<br />

---

# :wrench: Scripts

| Script                      | Descrição                                                   |
| --------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                  | Servidor de desenvolvimento com HMR                         |
| `pnpm build`                | Build Nitro para Vercel em `.vercel/output/`                |
| `pnpm start`                | Pré-visualizar o build pelo Vite                            |
| `pnpm typecheck`            | Tipos da aplicação e das ferramentas Node                   |
| `pnpm typecheck:node`       | Tipos das ferramentas no ambiente Node                      |
| `pnpm lint`                 | CSS, lint e tipos com cache do Vite+                        |
| `pnpm format`               | Formatar código com Oxfmt                                   |
| `pnpm check:ci`             | Formatação, lint e tipos da aplicação                       |
| `pnpm check:fix`            | Formatação + lint corrigindo o que for possível             |
| `pnpm test`                 | Todos os projetos de teste da aplicação                     |
| `pnpm test:tooling`         | Testes de `tooling/` com `node:test`                        |
| `pnpm test:unit`            | Só os projetos `node` e `dom` (happy-dom)                   |
| `pnpm test:browser`         | Só o projeto `browser` (Chromium headless)                  |
| `pnpm test:browser:install` | Baixar o Chromium do Playwright                             |
| `pnpm test:watch`           | Testes em modo de observação                                |
| `pnpm validate`             | check:ci + typecheck:node + test:coverage + tooling + build |
| `pnpm commitlint`           | Validar mensagem de commit                                  |

Os scripts chamam o binário local `vp` (Vite+). `vp <comando>` executa um
comando embutido; `vp run <script>` executa um script do `package.json`. Os dois
podem divergir, então confira o `package.json` antes de rodar direto.

`pnpm lint` e `pnpm check:ci` usam as tarefas `lint-project` e `check-project`
do `vite.config.ts`. O Vite+ reaproveita resultados bem-sucedidos quando os
arquivos lidos, as listagens de diretórios, os argumentos e as variáveis de
ambiente selecionadas continuam iguais. O rastreamento de arquivos permanece
automático, incluindo dependências e tipos gerados. As tarefas incluem
`NODE_ENV`, `NODE_OPTIONS` e `PATH` na chave do cache; o Vite também registra as
variáveis que carrega. A configuração do servidor limita `loadEnv` aos prefixos
`HOST` e `PORT`, para não registrar todo o ambiente. Variáveis de sessão sem
relação com essas verificações não invalidam o resultado.

O cache mantém `typeAware` e `typeCheck` ativos e identifica na saída quando
reproduz um resultado anterior. Para executar tudo novamente, use
`vp run --no-cache lint` ou `vp run --no-cache check:ci`. `check:fix`,
`typecheck` e as suítes de testes mantêm seus comandos próprios.

<br />

---

# :test_tube: Testes

Os arquivos de teste ficam em pastas `__tests__` ao lado do código que exercitam
(`src/__tests__/`, pastas dos módulos, `tooling/release/__tests__/`). Os testes
E2E são a exceção e vivem em `src/tests/pages/`, fora dos projetos do Vitest.

Teste regras e resultados observáveis: recuperação após erro, navegação,
seleção, persistência e sincronização. Componentes de apresentação simples não
precisam de suíte própria para conferir montagem, textos estáticos, classes ou o
funcionamento nativo de botões. Escolha o ambiente que cobre o comportamento e
evite repetir o mesmo cenário em outro nível.

O `vite.config.ts` define três projetos do Vitest, escolhidos pelo sufixo do
arquivo:

Os testes em `tooling/**/__tests__/` usam o executor nativo `node:test`, sem
configuração adicional, e rodam com `pnpm test:tooling`. Um único glob cobre
todos os módulos, então um módulo novo não exige script próprio. Essa suíte roda
em `validate`, no `pre-push` e no CI, mas fica fora dos comandos do Vitest:
teste, cobertura, UI e watch.

| Sufixo                    | Ambiente      | Uso                                         |
| ------------------------- | ------------- | ------------------------------------------- |
| `*.node.test.{ts,tsx}`    | Node          | Server functions, middleware, utilitários   |
| `*.dom.test.{ts,tsx}`     | happy-dom     | Componentes sem dependência de browser real |
| `*.browser.test.{ts,tsx}` | Chromium real | Interação, layout e APIs de browser         |

Os projetos `node` e `dom` usam `pool: 'threads'` e `css: false`. O projeto
`node` não carrega happy-dom nem os plugins de componentes. O projeto `dom`
carrega happy-dom, Solid e ícones, sem Nitro ou a configuração de SSR. O projeto
`browser` usa Chromium com CSS habilitado e o mesmo PostCSS da aplicação.
Importe o CSS no teste quando precisar validar estilos.

A configuração compartilhada limpa o histórico de mocks entre testes e exclui
arquivos E2E, `node_modules` e `playwright`. `passWithNoTests: false` faz a
execução falhar quando nenhum teste é encontrado. Os projetos declaram suas
opções compartilhadas explicitamente, sem herdar a configuração raiz por
`extends`.

Nos testes, importe de `vite-plus/test` em vez de `vitest` (a regra
`vite-plus/prefer-vite-plus-imports` bloqueia o import direto). O contexto de
requisição dos middlewares é testado com `provideRequestEvent` de
`@solidjs/web/storage` em `src/middleware/__tests__/middleware.node.test.ts`.

<br />

---

## Processamento de CSS

`vite.config.ts` usa `postcss-preset-env` com stage 3, Autoprefixer e custom
properties habilitados, seguindo as opções do DevInsights. O Vite+ cuida dos
imports de CSS e da minificação no build. A configuração é carregada em
`css.postcss` e também se aplica aos builds Nitro para Node e Vercel.

## SVGs locais como componentes

O `unplugin-icons` carrega a coleção `my-images` de `src/assets/images/` com
`FileSystemIconLoader`. A home demonstra a importação do logo do Solid:

```tsx
import SolidLogo from '~icons/my-images/solid'

<SolidLogo width="96" height="90" aria-hidden="true" />
```

Adicione arquivos `.svg` nessa pasta e importe pelo nome, sem extensão. As cores
originais são preservadas. PNG, JPEG e WebP continuam sendo imagens comuns.
`src/@types/icons.d.ts` declara os componentes com os tipos de `@solidjs/web`
para manter os ícones alinhados à API usada pelo projeto.

O
[SVG do Solid vem do template oficial do Vite](https://github.com/vitejs/vite/blob/main/packages/create-vite/template-solid/src/assets/solid.svg).

Os ícones prontos usam a coleção `@iconify-json/hugeicons` pelo mesmo plugin. O
seletor de tema usa, por exemplo,
`import IconSun from '~icons/hugeicons/sun-01'`. Apenas os ícones importados
entram no build.

## Testes da aplicação completa

`pnpm test:e2e` executa os testes em `src/tests/pages/**/*.e2e.test.ts`, exceto
os arquivos `*.production.e2e.test.ts`, com Chromium. O Playwright gera o build
e inicia o servidor de produção em `http://127.0.0.1:4317`, encerrando-o ao
terminar. A porta precisa estar livre. Os cenários cobrem a página inicial,
hidratação do seletor de tema, teclado, persistência e sincronização entre abas,
cores sem JavaScript, layout e resposta 404 com navegação de volta ao início.
Também cobrem a confidencialidade de erros do servidor: HTTP 500 de um backend
local, exceção após a leitura, `Error` dentro do resultado, erro público e
sucesso, cada um em SSR inicial, chamada pelo navegador e streaming, além de
recarregamento ainda com falha, recuperação após o backend voltar e isolamento
do bundle cliente. O SSR inicial também é verificado com JavaScript desativado.
O detalhe está em [docs/server-errors.md](docs/server-errors.md); o CI executa a
suíte inteira.

O build E2E usa `--mode e2e` com otimizações de produção e acrescenta a página
de teste pelo diretório `src/tests/fixtures/e2e/routes/`. O backend simulado
escuta somente em `127.0.0.1:4318` e é iniciado e encerrado pelo Playwright. O
build normal (`pnpm build`) usa apenas `src/routes/` e não inclui essa página
nem o backend simulado. As portas 4317 e 4318 precisam estar livres.

`pnpm test:e2e:production` executa os arquivos `*.production.e2e.test.ts` contra
um build normal, com a árvore real de `src/routes/`. Essa suíte verifica por
HTTP que `/robots.txt`, `/llms.txt` e `/sitemap.xml` respondem sem
redirecionamento, com conteúdo e headers esperados, e que os helpers locais não
viram endpoints públicos. Também verifica a ausência de uma rota das fixtures. O
comando usa a mesma `BASE_URL_TEST`, carrega as variáveis públicas no modo
`production` e dispensa o backend simulado. Execute as duas suítes em sequência,
pois compartilham a porta e os artefatos de build. O CI executa ambas; a suíte
de produção também valida o build final.

Use `pnpm test:e2e:ui` para abrir a interface interativa do Playwright. Com
`CI=true`, os E2E usam um único worker; localmente, mantêm o paralelismo padrão.

Os relatórios HTML ficam em `playwright-report/e2e/` e
`playwright-report/production/`. Os traces de falhas ficam em
`test-results/e2e/` e `test-results/e2e-production/`, respectivamente. Os testes
do Vitest Browser Mode guardam traces de falhas em
`test-results/browser-traces/`. Esses artefatos são ignorados pelo Git. Os E2E
têm comando separado e não fazem parte de `pnpm test` ou `pnpm validate`.

Para conferir a interface em um celular na mesma rede, execute `pnpm dev:phone`
e abra a URL de rede exibida pelo Vite. Esse comando disponibiliza o servidor de
desenvolvimento nas interfaces de rede da máquina.

# :shield: Hooks de Git

Instalados pelo Lefthook no `pnpm install` (habilitado em `allowBuilds` do
`pnpm-workspace.yaml`):

| Hook         | O que roda                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `pre-commit` | `check:fix` nos arquivos staged (com re-stage) + `scan:secrets --staged` quando Kingfisher está disponível |
| `commit-msg` | `commitlint` (header até 50 caracteres, corpo até 100)                                                     |
| `pre-push`   | `check:ci`, `typecheck:node`, `test:ci` e `test:tooling` em paralelo                                       |

O `pre-commit` é pulado durante `merge` e `rebase`. Em CI o Lefthook não instala
os hooks.

<br />

---

# :rotating_light: Considerações Importantes

- As versões de dependências são fixadas sem `^` (`savePrefix` vazio) para
  evitar quebras silenciosas. Consulte os arquivos de dependências para saber
  quais estão instaladas.
- `vite` e `vitest` vêm do catálogo em `pnpm-workspace.yaml`; `vite` resolve
  para o core do Vite+. Atualize os dois lá, não no `package.json`.
- Commits devem seguir Conventional Commits.
- O lint é type-aware e roda com `typeCheck: true`; erros de tipo aparecem no
  `pnpm lint` além do `pnpm typecheck`.
- O CI, o pre-push e `pnpm validate` combinam `check:ci` com `typecheck:node`
  para verificar a aplicação uma vez e preservar a checagem das ferramentas sem
  os tipos do DOM. `pnpm typecheck` continua verificando os dois projetos.
- Use as versões de Node e pnpm definidas em `package.json`.

<br />

---

# :link: Referências

- SolidJS: https://docs.solidjs.com
- Solid Router: https://docs.solidjs.com/solid-router
- Vite+: https://viteplus.dev/guide/
- Vite: https://vite.dev
- Vitest: https://vitest.dev
- Vitest Browser Mode: https://vitest.dev/guide/browser/
- Playwright: https://playwright.dev
- Oxlint: https://oxc.rs/docs/guide/usage/linter
- Oxfmt: https://oxc.rs/docs/guide/usage/formatter
- eslint-plugin-solid: https://github.com/solidjs-community/eslint-plugin-solid
- Commitlint: https://commitlint.js.org
- Lefthook: https://github.com/evilmartians/lefthook
- TypeScript: https://www.typescriptlang.org/docs

<br />

---

# :technologist: Autor

Por [Éverton Toffanetto](https://devinsights.dev).

:link: LinkedIn: https://www.linkedin.com/in/everton-toffanetto

:link: YouTube: https://youtube.com/@toffanettodev
