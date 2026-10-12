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
fica só `author`. Não repita no `Document.tsx` uma tag que o `createSeo`
publica, porque o crawler lê a primeira ocorrência.

Cada página pode exportar `route.info.seo` com `title`, `description`,
`noindex`, `type`, `image` e `article`. Isso não muda sua estratégia de
renderização nem torna a página estática: são metadados, disponíveis também em
rotas com parâmetros. Na chamada com `route: true`, `createSeo` lê a cadeia de
rotas ativas com `useRouteMatches` e publica esses campos no título, na
descrição, no Open Graph, no Twitter e no JSON-LD usando `useHead`. A rota filha
sobrescreve os campos que declara e herda os demais do layout; `image` é
mesclada atributo a atributo (`path`, `width`, `height`, `alt`). Sem definição
na cadeia, título, descrição e imagem vêm de `SITE`, `type` é `website` e
`noindex` é `false`. A home declara um título próprio que identifica o
boilerplate e seu uso para aplicações web com SSR. Página indexável publica
`robots` com `index, follow, max-image-preview:large`: os dois primeiros já são
o padrão do crawler e o terceiro libera a prévia grande da imagem no Google
Discover. Escolha do projeto: com `noindex: true`, a chamada de rota publica só
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
montado pelo helper local `buildStructuredData` de `createSeo`, publica sempre
um nó `WebSite`, o nó da página com URL canônica, descrição, idioma e imagem, e
um nó `Organization` com nome, descrição, URL, logo (`SITE.logo`, ao menos
112x112 pixels) e perfis oficiais (`SITE.socialLinks`, em `sameAs`).
`WebSite.publisher` e `Article.publisher` apontam para esse nó pelo `@id`
`<VITE_SITE_URL>/#organization`. O grafo é tipado com `schema-dts`, então
propriedade inválida falha no typecheck; as dimensões da imagem ficam só no Open
Graph. O idioma da página vem de `SITE.locale`, que também alimenta o `lang` do
`Document.tsx` e o `og:locale` (com sublinhado). `og:locale:alternate` lista os
outros idiomas, e `WebSite.inLanguage` declara os três idiomas disponíveis.
`helpers/serializeJsonLd/` escapa `<`, `>` e `&` como sequências JSON para não
encerrar o `<script>`. Os handles do Twitter saem de `SITE.twitter`
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

## Seleção para llms.txt

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

## Sitemap e rotas dinâmicas

O `llms.txt` só lista URLs sem parâmetros. No sitemap, uma rota com parâmetro
entra pelas entradas de `route.info.sitemap`: uma função, síncrona ou
assíncrona, que devolve `{ path, lastmod? }` com caminhos absolutos do site,
enumerados a partir da fonte de dados. O módulo da rota entra no bundle do
cliente, então banco e SDK ficam numa server function chamada pela fonte,
conforme o [contrato de erros no servidor](server-errors.md). A fonte roda a
cada request do sitemap (o CDN reutiliza a resposta por uma hora) e é ignorada
sob `noindex`, próprio ou herdado; numa página sem parâmetro ela não tem efeito.
As entradas são validadas na fronteira: caminho que não começa com `/`, com
host, esquema, query, fragmento ou espaço falha; barras finais e repetidas são
normalizadas; caminho repetido mantém a primeira ocorrência (a página estática
antes da fonte); `lastmod` fora do W3C Datetime é omitido. Falha de qualquer
fonte, entrada inválida, prazo estourado ou sitemap acima do limite do protocolo
(a quantidade fica em `sitemap.xml/constants.ts` e o limite de bytes em
`sitemap.xml/helpers/buildSitemapResponse/index.ts`) respondem 503 sem corpo e
sem cache: o crawler tenta de novo e o CDN mantém a última cópia boa, em vez de
guardar um sitemap parcial por uma hora. Títulos carregados em runtime ainda
podem usar `useHead`, mas essas alterações não são lidas pelo gerador.

Os limites são conferidos depois de gerar uma URL por idioma, com alternates e
`x-default`. Veja a [integração dos índices com i18n](i18n.md#índices-de-seo).

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
está em [desempenho da coleta de SEO](seo-performance.md).

## Endpoints e cache

`sitemap.xml/`, `robots.txt/` e `llms.txt/` são rotas de API (`index.ts`): o
sitemap lista as páginas estáticas do manifesto de rotas, sem o fallback 404 e
sem `noindex`, com `<lastmod>` nas páginas `article` (a mesma data do JSON-LD,
`dateModified` ou `datePublished`), mais as entradas das fontes de
`route.info.sitemap`, e o llms.txt publica, em Markdown, as notas de
`llms.txt/constants.ts` (fatos que o agente precisa saber antes de abrir os
links: idioma, o que o site oferece, o que não existe) e, em seguida, título e
descrição das páginas selecionadas por `route.info.llms`, agrupadas por seção.
Os casos de uso de `LLMS_USE_CASES` abrem a seção `When to use`, com links e
descrições que orientam a leitura da home e da página sobre o projeto. Reescreva
as notas e os casos de uso em cada projeto derivado. O `Document.tsx` anuncia
esse arquivo em todas as páginas com
`<link rel="describedby" href="/llms.txt">`, a descoberta recomendada pela spec
do llms.txt; agentes não são redirecionados. O robots publica os grupos de
`robots.txt/constants.ts`: `*` com `Allow: /` e `Disallow` do endpoint das
server functions (`/_server` por padrão, lido do
`virtual:solid-server-function-handler` do plugin), robôs de treinamento de IA
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

## Leitura por agentes

A home e as páginas `/about`, `/contact` e `/privacy` têm conteúdo autoral em
`src/data/readSitePage/`, consumido pelas rotas HTML e pelo middleware
`markdownContent`. Os catálogos ficam junto dessa fonte compartilhada; as
mensagens são lidas dentro do contexto de idioma da requisição. O conteúdo
principal é visível no HTML inicial, inclusive sem JavaScript. A home mantém sua
abertura e acrescenta seções de recursos e uso abaixo dela.

Um GET com `Accept: text/markdown` recebe a representação Markdown dessas
páginas, com `Content-Type: text/markdown; charset=utf-8`. A negociação compara
pesos `q` e especificidade; HTML é a preferência quando há empate. Ausência de
`Accept` e `*/*` usam HTML. Um tipo com `q=0` não pode ser selecionado. Se
nenhuma representação for aceitável, a resposta é 406. As respostas negociadas
preservam os campos existentes de `Vary` e incluem `Accept`. HEAD mantém status
e cabeçalhos, sem corpo.

As URLs sem idioma seguem a resolução existente de idioma e redirecionam para o
caminho localizado. Endpoints de API, server functions e assets não entram nessa
negociação. Uma rota sem representação Markdown própria continua no fluxo
normal; quando o resultado real é HTML com status 404, o middleware o substitui
por uma explicação Markdown com link para `/llms.txt`, preservando o status 404.
Respostas de erro 500 não viram 404.

O Markdown usa `private, no-store` e continua sob os cabeçalhos de segurança:
como não é HTML, recebe `script-src 'none'`. O contexto de idioma, os cookies de
preferências e a proteção dos erros do servidor permanecem na cadeia existente.
Os três índices de descoberta conservam seu contrato de cache e seus tipos de
conteúdo.

As páginas sobre o projeto e de contato usam os dados públicos do repositório. O
aviso de privacidade descreve as preferências e os limites observáveis na
demonstração. O `contactPoint` usa `contato@email.com` e `0000000000` como
placeholders, com `contactType: demo` e uma descrição que informa que esses
valores não são canais de contato do mantenedor. A demonstração omite `address`.
Substitua os contatos de exemplo por dados reais ao adaptar o boilerplate para
outro produto. Revise o aviso quando adicionar serviços ou coleta de dados.

Valide com `vp run check:ci`, `vp run typecheck:node`, `vp run test:tooling` e
os testes Node de `src/middleware/` e de SEO. Execute
`vp run test:e2e:production` para conferir a árvore real e `vp run test:e2e`
para exercitar também as fixtures e falhas do servidor. As suítes
`AgentReadiness` cobrem conteúdo sem JavaScript, idiomas, negociação, HEAD, 404
e navegação em larguras de celular e desktop.

Após publicar, confira status final, cabeçalhos e corpo, seguindo redirects:

```sh
curl -sS -L -i -H 'Accept: text/markdown' https://seu-dominio.example/
curl -sS -L -i -H 'Accept: text/html' https://seu-dominio.example/
curl -sS -L -i -H 'Accept: text/markdown' https://seu-dominio.example/pagina-inexistente
```

Repita a leitura para os caminhos localizados, páginas de apoio, `llms.txt`,
`robots.txt` e `sitemap.xml`. Uma validação local não comprova a resposta do CDN
após o deploy. A posição da marca nas buscas depende também de indexação e
referências externas.

Referências: [negociação Markdown](https://acceptmarkdown.com/guides),
[formato llms.txt](https://llmstxt.org/) e
[negociação HTTP no RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.1).
