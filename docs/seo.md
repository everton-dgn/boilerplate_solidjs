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
as leituras de `seo` pelas mensagens. É dado de UI: o Markdown não o lê, porque
sai do HTML renderizado.

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

```tsx
import type { RouteDefinition } from '@solidjs/router'

export const route = {
  info: {
    seo: {
      title: 'Sobre nós',
      description: 'Conheça nossa equipe.',
      type: 'article',
      image: {
        path: '/images/equipe.png',
        width: 1200,
        height: 800,
        alt: 'Foto da equipe'
      }
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
inclui a página; sem seção herdada, ela entra na seção padrão `Pages`.
`{ section: 'Guias' }` cria ou reutiliza uma seção com esse nome, na ordem em
que aparece no manifesto; `{ optional: true }` move a página para a seção
`Optional`, que o formato reserva ao conteúdo que o modelo pode pular, e uma
seção declarada com esse nome se funde a ela. A configuração é herdada pela
cadeia de rotas: um layout com `llms: { section: 'Docs' }` inclui suas filhas
nessa seção, uma filha pode sair com `llms: false` ou sobrescrever só o campo
que declara, e `llms: true` numa filha reativa a inclusão preservando seção e
marcação opcional herdadas. `noindex: true` exclui a página do sitemap e do
llms.txt, mesmo com a flag. O filtro considera a configuração efetiva da página,
incluindo herança e a rota de índice filha. O resolvedor fica colocalizado em
`src/routes/(seo)/llms.txt/helpers/resolveRouteLlms/`. A publicação de Markdown
é controlada separadamente por `route.info.markdown`.

## Sitemap e rotas dinâmicas

O `llms.txt` coleta do manifesto só páginas sem parâmetros, com `llms`
habilitado e sem `noindex`, no idioma base. Se a folha declara `markdown: true`
ou `'dynamic'`, o link aponta para o `.md` (`/en/about.md`); nas demais, para o
HTML. Rotas com parâmetro ficam fora mesmo com `llms`, e as fontes de
`route.info.sitemap` não alimentam esse índice. No sitemap, uma rota com
parâmetro entra pelas entradas de `route.info.sitemap`: uma função, síncrona ou
assíncrona, que devolve `{ path, lastmod? }` com caminhos absolutos do site,
enumerados a partir da fonte de dados. O módulo da rota entra no bundle do
cliente, então banco e SDK ficam numa server function chamada pela fonte,
conforme o [contrato de erros no servidor](server-errors.md). A fonte recebe um
`AbortSignal` que aborta no prazo das fontes, na desconexão do cliente e ao fim
da leitura, inclusive quando outra fonte falha; repasse-o à leitura para
cancelá-la, em vez de só deixar de esperá-la. Uma fonte que ignore o sinal
continua rodando, mas a resposta não a espera além do prazo. A fonte roda a cada
request do sitemap (o CDN reutiliza a resposta por uma hora) e é ignorada sob
`noindex`, próprio ou herdado; numa página sem parâmetro ela não tem efeito. As
entradas são validadas na fronteira: caminho que não começa com `/`, com host,
esquema, query, fragmento ou espaço falha; barras finais e repetidas são
normalizadas; entradas que resultam na mesma URL publicada mantêm a primeira
ocorrência (a página estática antes da fonte). A comparação usa a URL localizada
que vai para o XML, então `/a/../b` e `/b`, `/café` e `/caf%C3%A9` ou
`/pt/blog/x` e `/blog/x` contam como a mesma página. `lastmod` fora do W3C
Datetime é omitido. Falha de qualquer fonte, entrada inválida, prazo estourado
ou sitemap acima dos limites do protocolo (de URLs e de bytes, em
`sitemap.xml/constants.ts`) respondem 503 sem corpo e com `no-store`, e o
servidor registra a linha fixa `[sitemap]` descrita em
[erros no servidor](server-errors.md#log-de-falhas). O crawler tenta de novo, e
o CDN não guarda um sitemap parcial por uma hora. A resposta de sucesso traz
`stale-if-error=86400`: depois que a cópia em cache expira, se a função
responder com erro, o CDN da Vercel serve a última cópia boa por até um dia, sem
guardar o erro. A documentação da Vercel cita como exemplos o 500, falha de rede
e de DNS; que o 503 desta rota também acione a cópia antiga é uma hipótese ainda
não medida. Títulos carregados em runtime ainda podem usar `useHead`, mas essas
alterações não são lidas pelo gerador.

Os limites são conferidos uma única vez, depois de gerar uma URL por idioma, com
alternates e `x-default`: a quantidade de caminhos aceita é o limite de URLs
dividido pelo número de idiomas. Veja a
[integração dos índices com i18n](i18n.md#índices-de-seo).

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
índice; para isso, use `noindex` em `route.info.seo`. O texto do robots é
montado uma vez, ao carregar o módulo, porque os grupos e a URL do site são
fixos no build. Em produção o processo guarda em memória a resposta do llms.txt
e a leitura do manifesto do sitemap, porque o manifesto também é fixo no build;
as fontes do sitemap rodam a cada request. O llms.txt é montado dentro do
contexto Paraglide do idioma base (`baseLocale` do runtime), inclusive a
descrição do site e os metadados das páginas, para que nem a requisição que
preenche a memória nem um contexto de outro idioma mudem o texto. A nota que
lista os idiomas e declara o idioma do índice é texto fixo: ao mudar os idiomas
ou o idioma base em `project.inlang/settings.json`, reescreva-a. Os três
arquivos saem com `public, max-age=0, s-maxage=3600, stale-if-error=86400` em
produção (o CDN reutiliza por uma hora; a Vercel só cacheia resposta de função
com `s-maxage` e consome `s-maxage` e `stale-if-error` sem repassá-los ao
navegador) e com `no-store` em desenvolvimento. Com `stale-if-error`, um erro da
função depois que a cópia expira não derruba o arquivo por até um dia. As URLs
absolutas dos três arquivos partem da origem de `VITE_SITE_URL`; um site servido
em um subcaminho não é suportado por essa geração. A página 404 declara
`robots: noindex`. A imagem social fica em `public/images/og.png`, com cache
imutável de um ano configurado em `vercel.json` para `/images/`. Como esse cache
não revalida, publique uma imagem nova com outro nome (por exemplo,
`og-2026-10.png`) e atualize `SITE.image.path`: sobrescrever `og.png` deixa
navegadores e caches intermediários com a versão antiga por até um ano. O logo
do JSON-LD reutiliza `public/favicon/apple-touch-icon.png`.

## Leitura por agentes

O Markdown é derivado do HTML renderizado. Com `route.info.markdown: true` na
folha da rota, o build gera um arquivo `.md` por idioma; com `'dynamic'`, a
conversão acontece a cada requisição, para páginas cujo conteúdo depende dela.
Rotas com parâmetro ficam sempre na requisição, porque o build não conhece seus
valores. A elegibilidade usa o SEO efetivo, inclusive a herança e um
`noindex: false` explícito no filho. `llms` continua independente: decide a
inclusão no índice. Login e conteúdo por visitante não devem optar pela
publicação. O opt-in é um compromisso de conteúdo público, não um mecanismo de
autorização.

`/pt/index.md` representa a home e `/pt/about.md` representa a página sobre. Uma
página cujo último segmento é `index` acrescenta `/index.md`: `/pt/index` usa
`/pt/index/index.md`, e `/pt/docs/index` usa `/pt/docs/index/index.md`. Essa
regra também cobre segmentos repetidos: `/pt/index/index` usa
`/pt/index/index/index.md`. O middleware remove o `.md` e um `/index` final e
responde 404 a qualquer URL `.md` que não seja a forma canônica da página:
`/pt/docs/index.md` não é alias de `/pt/docs`, e `/pt.md`, sem prefixo de
idioma, segue o redirect dos caminhos sem idioma em vez de publicar a home. O
middleware usa o matching nativo também para parâmetros, sem produtor,
`SitePage` obrigatório, `getPaths` ou manifesto de artefatos. A enumeração
finita do sitemap e do llms.txt continua separada; o llms enumera as rotas
estáticas conhecidas. O alternate de SEO acompanha a rota atual também na
navegação cliente.

HTML é a única fonte autoral. Objetos usados pelos componentes, como
`SiteArticle`, podem permanecer como dados da UI; não há serializador manual nem
conteúdo adicional exclusivo do Markdown. Traduções permanecem em getters ou
chamadas no componente, no contexto do idioma da requisição.

O adaptador escolhe `event.renderMode = 'async'` apenas para solicitações de
Markdown e aguarda o SSR. A entrada repassa o sinal da requisição ao
`renderToStream`. Antes da conversão, o adaptador exige `hasCompleted === true`
e `hasErrors === false` no estado seguro guardado em
`event.locals.ssrRenderState`. Ausência, conclusão incompleta ou erro descarta o
HTML e devolve erro público 500 com `private, no-store`. O estado cobre erros
observados pelo render; não atesta dados de hidratação silenciosamente
descartados pelo serializador. Markdown usa o HTML assentado, sem esses dados. O
hook global marca o estado e recebe cada erro uma vez por tipo em cada
requisição; a conclusão continua exigida à parte. HTML normal mantém streaming.
O contrato e o critério para remover o patch estão em
[erros no servidor](server-errors.md#integridade-do-ssr-para-markdown).

O prerender do build passa pelo mesmo adaptador. O módulo
`tooling/markdownPrerender/` pede ao middleware a lista das páginas estáticas
(`/_markdown/static.json`, respondida só com o header `x-nitro-prerender`),
prerenderiza cada `.md` e não grava a lista. Qualquer cliente pode enviar esse
header: ele não autentica nada. Por isso a lista só pode conter páginas
públicas, as mesmas que o build publica em `.md`; num redirect, o header só
troca a resposta por 500 público. Uma página que falhe ou não seja gravada, ou
uma lista inválida ou que não passe pelo prerender, interrompe o build. O Nitro
só falha por rota com erro registrado; uma rejeição no fetch ou na gravação
deixaria o arquivo de fora sem falhar, e por isso o módulo confere no fim que
cada `.md` da lista foi gravado. O resultado fica em `.vercel/output/static`.

Na Vercel, um `index.md` estático também pode atender à URL do diretório. Depois
que o preset do Nitro gera o `config.json`, o módulo antecipa suas regras da
fase de filesystem, restringindo as cópias às páginas com `index.md`, com e sem
barra final. Headers com `continue: true`, redirects e proxies anteriores
continuam na mesma ordem. As regras preservam destinos, capturas e condições
nativos, inclusive ISR, `functionRules` e skew protection. O módulo não define
um destino SSR próprio nem altera `vercel.config`; um artefato sem regras de
filesystem interrompe o build. Uma regra inicial sem destino nem status que
encerre o roteamento numa página protegida também interrompe o build. Os headers
de `routeRules` do Nitro saem com `continue: true` e não encerram o roteamento;
uma regra própria em `vercel.config.routes` que atinja essas páginas precisa do
mesmo `continue: true`. O módulo não força a continuação, pois isso mudaria a
prioridade de headers e redirects. Assim, `/pt` continua negociando HTML ou
Markdown, enquanto `/pt/index.md` mantém o arquivo estático. Os testes de
tooling exercitam o preset real sem configuração prévia e com regras adicionais.
O E2E de produção confere a precedência no artefato final, inclusive depois de
`vercel build`.

`@mdream/js` recebe o caminho do documento sobre a origem pública
(`VITE_SITE_URL`) para resolver links relativos; no prerender, a requisição é
local. Seus seletores isolam o conteúdo principal e removem navegação,
controles, formulários, diálogos, regiões `aria-live`, widgets ARIA, conteúdo de
fallback de mídia, scripts, templates, SVG, `aria-hidden="true"` e
`data-md-exclude`. O próprio conversor descarta `hidden`, exceto
`hidden="until-found"`, que é conteúdo pesquisável. O plugin de `convertHtml`
troca por `#` o destino que começa com `javascript:`, `vbscript:` ou `data:`,
sem remover o link: sem ele, o mdream emitiria um título interno como HTML bruto
no início da linha. Com espaço ou controle antes do esquema, o mdream resolve o
valor pela origem pública. Em `details`, `summary`, `dl`, `dt`, `dd` e
`address`, o próprio mdream emite o link como HTML e descarta esses destinos. O
plugin também descarta, como `data-md-exclude`, imagens sem texto em `alt` nem
`title` quando todos os ancestrais são contêineres comuns: seções, parágrafos,
títulos, listas, tabelas, citações, figuras, `span` e as ênfases `strong`, `b`,
`em`, `i`, `del` e `s`. As ênfases dependem do patch descrito abaixo, que tira o
espaço de dentro do delimitador. Em links, `mark`, legendas e outros elementos
com sintaxe ou HTML próprio, a imagem fica, porque a remoção poderia esvaziar o
link ou levar HTML bruto ao início da linha. Imagens não usam `aria-label` nem
`aria-labelledby`, que o `jsx-a11y/alt-text` aceita; use `alt=""` somente em
imagens decorativas. Rodapés contextuais dentro de main permanecem. CSS
calculado e conteúdo criado exclusivamente no navegador não são interpretados.
Use marcação semântica para conteúdo que não deve aparecer.

O patch Bun de `@mdream/js` corrige a conversão de espaços, títulos em listas e
nomes de links com esses filtros. Uma ênfase cujo início foi removido, como um
ícone SVG, ficava com o espaço dentro do delimitador (`** Warning:**`), e uma
linha só de `===` ou `--` depois de uma quebra virava sublinhado de título. Um
título vazio num item de lista virava `\###`, colado ao bloco seguinte. Um link
com `aria-label` cujo único conteúdo é removido, como um ícone com
`aria-hidden="true"`, saía sem texto (`[](/cart)`). A correção também preserva
separadores entre palavras em wrappers inline, inclusive antes de um espaço
inseparável. Títulos em listas ficam separados do texto seguinte, com os
marcadores literais escapados na coluna do conteúdo; wrappers de ênfase e
legendas mantêm seus delimitadores juntos. Links preservam o texto visível
dentro de blocos e usam o nome acessível após ícones removidos, sem perder o
espaço final nem mover para fora o espaço entre dois ícones. O patch altera só o
`dist` do pacote e corresponde aos PRs
[harlan-zw/mdream#385](https://github.com/harlan-zw/mdream/pull/385) (espaços e
sublinhado de título), [#386](https://github.com/harlan-zw/mdream/pull/386)
(títulos em listas) e [#390](https://github.com/harlan-zw/mdream/pull/390)
(nomes de links). Remova-o quando uma versão publicada cobrir esses
comportamentos e os testes de regressão de `convertHtml` passarem sem ele.

GET com `Accept: text/markdown` recebe Markdown diretamente, sem redirect para
arquivo. A negociação respeita pesos e especificidade, com HTML em empate. O
acesso explícito a `.md` exige somente que Markdown seja aceitável, mesmo quando
HTML tenha peso maior; uma exclusão exata `text/markdown;q=0` prevalece sobre
curingas. Além do peso, só `charset=utf-8` e, em `text/markdown`, as variantes
`GFM` e `CommonMark` do RFC 7763 são aceitos; outro parâmetro descarta a faixa.
O cabeçalho é lido numa varredura linear, então um `Accept` longo não custa
tempo quadrático. Nenhum formato aceitável na página publicada resulta em 406.
Query strings permanecem no SSR. HEAD renderiza a mesma representação e remove o
corpo. APIs, assets, RPC e métodos de escrita ficam fora da negociação. Num
caminho de página sem handler de API para o método, POST, PUT, PATCH, DELETE e
OPTIONS recebem 405 com `Allow: GET, HEAD`: sem essa resposta, o handler do
plugin renderizaria a página com status 200 no idioma base, fora do contexto de
idioma. Os formulários do router enviam ao endpoint das server functions, que
não passa por essa restrição.

A localização preserva URL > cookie > Accept-Language. Redirects seguros para
uma página elegível da mesma origem preservam a intenção `.md`; o middleware não
segue redirects. Erros não viram documentos de sucesso. Um 404 HTML negociado
mantém status 404, idioma e `noindex`; páginas sem opt-in não publicam seu
conteúdo de sucesso pelo alias Markdown. Um `X-Robots-Tag` com `noindex` ou
`none` na resposta da página também recusa a publicação;
`max-image-preview: none` só limita a prévia de imagens e não conta.

As respostas convertidas na requisição recebem `text/markdown; charset=utf-8`,
`private, no-store`, `Vary: Accept` adicional ao Vary existente e CSP com
`script-src 'none'`. Os arquivos do build são servidos pela camada estática, sem
passar pela função: o `vercel.json` define `Content-Type`, `nosniff` e
`Cross-Origin-Resource-Policy`, e o cache segue o padrão da Vercel para
estáticos. Eles não gravam cookie de idioma nem `Content-Language`; o idioma vem
da URL. O preview local (`vp run start`) não aplica o `vercel.json` e serve
`.md` como `application/octet-stream`.

Os limites ficam em `src/middleware/markdownContent/constants.ts`: espera de SSR
cancelável e tamanho máximo do HTML antes da conversão síncrona. Timeout e
desconexão abortam o sinal do render; o limite de bytes reduz o trabalho do
conversor, mas não limita o HTML que o SSR já acumulou internamente. Código
síncrono e serviços que ignoram AbortSignal não são preemptados.

As páginas sobre o projeto e de contato usam os dados públicos do repositório. O
aviso de privacidade descreve as preferências e os limites observáveis na
demonstração. O `contactPoint` usa `contato@example.com` e `0000000000` como
placeholders, com `contactType: demo` e uma descrição que informa que esses
valores não são canais de contato do mantenedor. O `address` é um
`PostalAddress` com rua, cidade, estado, CEP e país de exemplo, identificado
como fictício pela descrição. Os dois objetos ficam em
`src/primitives/createSeo/buildStructuredData/index.ts`. Substitua esses dados
ao adaptar o boilerplate para outro produto. Revise o aviso quando adicionar
serviços ou coleta de dados.

Valide com `vp run check:ci`, `vp run typecheck:node`, `vp run test:tooling` e
os testes Node de `src/middleware/` e de SEO. Execute
`vp run test:e2e:production` para conferir a árvore real e `vp run test:e2e`
para exercitar também as fixtures e falhas do servidor. As suítes
`AgentReadiness` cobrem conteúdo do HTML inicial, idiomas, negociação, HEAD, 404
e navegação em larguras de celular e desktop.

A home mantém pelo menos 500 caracteres de conteúdo visível nos três idiomas,
também no HTML inicial. Esse limite atende ao critério de conteúdo do Is
Agentic; não é uma garantia de posição nas buscas. O texto descreve os recursos
reais do projeto, e o README aponta para a demonstração pública. Conforme o
[guia de SEO do Google](https://developers.google.com/search/docs/fundamentals/seo-starter-guide),
o efeito de mudanças na busca depende de rastreamento e pode levar tempo.

Após publicar, confira status final, cabeçalhos e corpo, seguindo redirects:

```sh
curl -sS -i https://seu-dominio.example/pt/index.md
curl -sS -L -i -H 'Accept: text/markdown' https://seu-dominio.example/pt/
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
