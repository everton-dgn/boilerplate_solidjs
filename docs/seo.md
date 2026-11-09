# SEO e índices do site

[Voltar ao README](../README.md)

## Metadados de rota

`VITE_SITE_URL` no `.env` é obrigatória e define a URL pública do site, validada
em `env.ts`. `createSeo({ route: true })`, chamado uma vez no callback raiz do
`Router` em `App.tsx`, usa `useHead` do `@solidjs/web` para publicar
`canonical`, `og:url`, `og:type`, a imagem social absoluta (Open Graph e
Twitter, com dimensões e texto alternativo) e um
`<script type="application/ld+json">` para a rota atual, inclusive na navegação
no cliente. As tags sociais que não variam por rota (`og:locale`,
`og:site_name`, `twitter:card`, `twitter:site` e `twitter:creator`) também saem
do `createSeo`, para acompanhar a regra de `noindex` abaixo; em `Document.tsx`
ficam só `author` e um `<title>` com `SITE.title`. Esse título é a exceção: o
runtime substitui no lugar o primeiro `<title>` do shell pelo que o `createSeo`
publica com `useHead`, e o documento sai com um único `<title>`, conferido nos
E2E de SEO. Não repita no `Document.tsx` outra tag que o `createSeo` publica,
porque o crawler lê a primeira ocorrência.

Cada página mantém seus metadados em `seo.ts`, ao lado de `index.tsx`, e importa
o objeto `seo` para `route.info.seo`. O contrato aceita `title`, `description`,
`noindex`, `type`, `image` e `article`. Isso não muda sua estratégia de
renderização nem torna a página estática: são metadados, disponíveis também em
rotas com parâmetros. Na chamada com `route: true`, `createSeo` lê a cadeia de
rotas ativas com `useRouteMatches` e publica esses campos no título, na
descrição, no Open Graph, no Twitter e no JSON-LD usando `useHead`. A rota filha
sobrescreve os campos que declara e herda os demais do layout; `image` é
mesclada atributo a atributo (`path`, `width`, `height`, `alt`). Ao trocar o
`path`, declare também `width` e `height` do novo arquivo: dimensões omitidas
são herdadas da imagem anterior e publicadas em `og:image:width` e
`og:image:height`, e a prévia nas redes pode sair cortada. Sem definição na
cadeia, título, descrição e imagem vêm de `SITE`, `type` é `website` e `noindex`
é `false`. A home declara um título próprio que identifica o boilerplate e seu
uso para aplicações web com SSR. Página indexável publica `robots` com
`index, follow, max-image-preview:large`: os dois primeiros já são o padrão do
crawler e o terceiro libera a prévia grande da imagem no Google Discover.
Escolha do projeto: com `noindex: true`, a chamada de rota publica só
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

Por exemplo, uma página pode declarar seus metadados em `seo.ts`:

```ts
import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'

export const seo = {
  get title() {
    return m.about_title()
  },
  get description() {
    return m.about_description()
  }
} satisfies SeoRouteInfo
```

Em `index.tsx`, importe `seo` e use `info: { seo }` na definição da rota, junto
dos demais controles que a página declarar. Getters preservam o idioma da
requisição; não copie os textos traduzidos para valores no topo do módulo. Os
catálogos ficam em `i18n/{pt,en,es}.json` ao lado desses arquivos. Os dados que
o componente renderiza ficam em `index.tsx`, numa constante não exportada com
getters (as páginas que usam `SiteArticle` a tipam com `satisfies SitePage`), ou
em chamadas de `m` no próprio JSX. O manifesto de rotas importa o `route` de
cada página no bundle inicial, e tudo o que `seo.ts` importa entra junto. Por
isso os getters de `seo` chamam as mensagens diretamente, sem ler o objeto da
página, e o corpo fica só no módulo da rota, baixado na navegação. Uma página
que ainda exporte `content` de `seo.ts` deve movê-lo para `index.tsx` e trocar
as leituras de `seo` pelas mensagens. A regra de lint `project/seo-module` acusa
um `seo.ts` que exporte outra coisa além de `seo` ou que importe como valor um
módulo local, por caminho relativo, por alias da árvore `src/routes` ou por
`import()`, e o teste de i18n em produção confere que cada corpo fica só no
módulo da rota. É dado de UI: o Markdown não o lê, porque sai do HTML
renderizado.

`type` aceita `website` e `article`. Ele define `og:type` e o nó da página no
JSON-LD: `WebPage` por padrão, ou `Article` com `headline`, `author` (nó
`Person` com nome, URL e perfis de `SITE.author`, os perfis em `sameAs`),
`publisher` e, quando a rota declara `article: { datePublished, dateModified }`
em ISO 8601, essas datas no nó e nas metas `article:published_time` e
`article:modified_time`. Fora de `article`, as datas são ignoradas. O JSON-LD,
montado pelo helper local `buildStructuredData` de `createSeo`, publica sempre
um nó `WebSite`, o nó da página com URL canônica, descrição, idioma e imagem, e
um nó `Organization` com nome, descrição, URL, logo (`SITE.logo`, ao menos
112x112 pixels) e perfis oficiais (`SITE.socialLinks`, em `sameAs`).
`WebSite.publisher` e `Article.publisher` apontam para esse nó pelo `@id`
`<VITE_SITE_URL>/#organization`. O grafo é tipado com `schema-dts`, então
propriedade inválida falha no typecheck; as dimensões da imagem ficam só no Open
Graph. O idioma da página vem de `SITE.locale`, que também alimenta o `lang` do
`Document.tsx` e o `og:locale` (com sublinhado). `og:locale:alternate` lista os
outros idiomas, e `WebSite.inLanguage` declara os três idiomas disponíveis. O
grafo e os dados próprios da página usam `JSON.stringify` e chegam ao `useHead`
com `type: 'application/ld+json'`. O Solid escapa `<` no HTML do servidor e nas
atualizações de head do streaming; no cliente, insere o conteúdo como texto.
Esse contrato depende do tipo JSON e do uso de `useHead`: não interpole o JSON
diretamente em HTML. As regressões de `createSeo` e `StructuredData` verificam o
primeiro chunk antes da resolução dos dados, conteúdo malicioso preservado como
JSON e ausência de elementos injetados ou execução de código no navegador, antes
e depois da hidratação. Os handles do Twitter saem de `SITE.twitter`
(`twitter:site`, a conta do site) e de `SITE.author.twitter` (`twitter:creator`,
a conta do autor). O LinkedIn não tem meta tag própria: ele lê o Open Graph para
a prévia, e o perfil entra só no `sameAs`. Páginas indexáveis publicam
`hreflang` para os três idiomas e `x-default` apontando para inglês. Canonical e
URL da página no JSON-LD incluem o idioma; a identidade da organização permanece
na raiz do site. O fallback de erro publica título e descrição traduzidos com
`noindex`, mesmo quando a falha acontece antes do Router.

## Dados estruturados por página

Esse grafo base é fixo de propósito. Tipos que dependem da página (`Product`,
`FAQPage`, `BreadcrumbList`, `Event`) entram pela primitive
`createSeo({ structuredData: () => data })`, chamada no corpo do componente da
rota. Ela publica um segundo `<script type="application/ld+json">` com
`@context`. Os dados podem ser um nó ou uma lista (vira `@graph`) e são tipados
com `schema-dts`, os tipos do schema.org mantidos pelo Google, então propriedade
inválida falha no typecheck. A primitive acompanha as mudanças do accessor,
remove o script ao descartar seu escopo e convive com outras instâncias na mesma
página. Retornar `undefined` suspende a publicação; quando o accessor voltar a
fornecer dados, o script reaparece. Para ligar o nó ao grafo base, use o `@id`
da página (a URL canônica), do site (`<VITE_SITE_URL>/#website`) ou da
organização (`<VITE_SITE_URL>/#organization`). A chamada com `structuredData`
não consulta o router nem `noindex`: uma rota fora do índice que a utiliza
publica o JSON-LD mesmo assim. Os dois formatos de chamada são exclusivos nos
tipos: use `route: true` uma vez no App e `structuredData` em cada componente
que precisa publicar dados próprios. As chamadas das páginas não registram o SEO
global.

```tsx
import { createSeo } from '@/primitives/createSeo/index.ts'

export default function FaqPage() {
  createSeo({
    structuredData: () => ({
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'O que é o boilerplate?',
          acceptedAnswer: { '@type': 'Answer', text: 'Uma base SolidJS.' }
        }
      ]
    })
  })

  return (
    <main>
      <h1>Perguntas frequentes</h1>
    </main>
  )
}
```

Uma página do tipo `article`, com imagem própria e seção no `llms.txt`, declara
o tipo e a imagem em `seo.ts`, com o texto alternativo também num getter:

```ts
import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'

export const seo = {
  get title() {
    return m.team_title()
  },
  get description() {
    return m.team_description()
  },
  type: 'article',
  image: {
    path: '/images/equipe.png',
    width: 1200,
    height: 800,
    get alt() {
      return m.team_imageAlt()
    }
  }
} satisfies SeoRouteInfo
```

A rota importa esse objeto e declara a seção ao lado dele:

```tsx
import type { RouteDefinition } from '@solidjs/router'

import { seo } from './seo.ts'

export const route = {
  info: { seo, llms: { section: 'Empresa' } }
} satisfies RouteDefinition
```

## Seleção para llms.txt

Veja [seleção para llms.txt](seo/indexes.md#seleção-para-llmstxt).

## Sitemap e rotas dinâmicas

Veja [sitemap e rotas dinâmicas](seo/sitemap.md#sitemap-e-rotas-dinâmicas).

### Artefatos estáticos e capacidade da origem

Veja
[artefatos estáticos e capacidade da origem](seo/publication.md#artefatos-estáticos-e-capacidade-da-origem).

### Fontes particionadas

Veja [fontes particionadas](seo/sitemap.md#fontes-particionadas).

### Capacidade e medição

Veja [capacidade e medição](seo/publication.md#capacidade-e-medição).

## Endpoints e cache

Veja [endpoints e cache](seo/indexes.md#endpoints-e-cache).

## Leitura por agentes

Veja [leitura por agentes](seo/markdown.md#leitura-por-agentes).

### Agregado llms-full.txt

Veja [agregado llms-full.txt](seo/markdown.md#agregado-llms-fulltxt).

### Artefatos e roteamento da plataforma

Veja
[artefatos e roteamento da plataforma](seo/markdown.md#artefatos-e-roteamento-da-plataforma).
