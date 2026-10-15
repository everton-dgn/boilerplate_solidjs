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

Cada página mantém seus metadados em `seo.ts`, ao lado de `index.tsx`, e importa
o objeto `seo` para `route.info.seo`. O contrato aceita `title`, `description`,
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
catálogos ficam em `i18n/{pt,en,es}.json` ao lado desses arquivos. Quando HTML e
Markdown compartilham conteúdo público, o mesmo `seo.ts` também exporta
`content` com `satisfies SitePage`, e os getters de `seo` podem ler esse objeto.

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
incluindo herança e a rota de índice filha. O resolvedor fica colocalizado em
`src/routes/(seo)/llms.txt/helpers/resolveRouteLlms/`. A publicação de Markdown
é controlada separadamente por `route.info.markdown`.

## Sitemap e rotas dinâmicas

O `llms.txt` coleta páginas sem parâmetros e acrescenta os snapshots Markdown de
caminhos dinâmicos enumerados no build que tenham `llms` habilitado. No sitemap,
uma rota com parâmetro entra pelas entradas de `route.info.sitemap`: uma função,
síncrona ou assíncrona, que devolve `{ path, lastmod? }` com caminhos absolutos
do site, enumerados a partir da fonte de dados. O módulo da rota entra no bundle
do cliente, então banco e SDK ficam numa server function chamada pela fonte,
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

O Markdown é um arquivo público gerado no build. Cada página que deseja publicar
essa representação declara `route.info.markdown` na própria folha da árvore:

```tsx
export const route = {
  info: {
    markdown: true,
    llms: true
  }
} satisfies RouteDefinition
```

As chaves são independentes: `markdown` publica o arquivo e `llms` decide sua
presença no índice. `llms: false` não impede acesso a um `.md` já publicado. Sem
`markdown: true` explícito, a página não gera arquivo. `false` também desativa a
publicação, mesmo quando existe um produtor na pasta. A configuração não é
herdada; declará-la num layout com filhas ou numa página com `noindex` efetivo
faz o build falhar. `noindex` é uma restrição editorial e não autentica
usuários. Login, área privada e conteúdo por visitante devem ficar sem
`markdown`.

Por padrão, o build usa o objeto público `content` exportado por `seo.ts`, com
`satisfies SitePage`. Esse mesmo objeto pode alimentar o HTML da página. Os
metadados `seo` sozinhos não bastam: `content` contém o corpo público completo,
com introdução, seções e links. Sobre, contato e privacidade usam esse caminho,
sem um arquivo produtor adicional.

Quando precisar de uma fonte própria, acrescente `markdown.ts` ao lado do
arquivo que declara `route`. Esse produtor tem prioridade sobre `content`, e uma
falha nele interrompe o build sem recorrer a `seo.ts`. Reexportações de `route`
são seguidas até a declaração original, inclusive nas fixtures; o caminho não
depende da URL pública nem dos chunks produzidos por Vite e Nitro. Se a
publicação estiver habilitada e não houver produtor nem conteúdo público válido,
o build falha. Use uma pasta por página: arquivos soltos no mesmo diretório
teriam a mesma fonte colocalizada. Reexportações de páginas publicadas precisam
ser nomeadas, como `export { route } from './page/index.tsx'`; namespace e
`export *` intermediário não fazem parte desta convenção. Páginas sem
`markdown: true` não passam pela descoberta de produtores.

O contrato `MarkdownSource`, em `src/@types/markdown.ts`, define o produtor
exclusivo do build. Esse módulo exporta `markdown`, com uma função
`render({ path, locale, signal })` que devolve `SitePage`, inclusive por
Promise. A home exibe apenas a apresentação inicial; os links públicos ficam na
topbar e usam os mesmos rótulos traduzidos do conteúdo. Seu Markdown inclui
também as seções descritivas de `seo.ts`, sem exigir que elas apareçam no HTML.
A home mantém o exemplo abaixo de produtor explícito, compartilhando o objeto
`content` de `seo.ts` com o HTML. Textos e links localizados usam getters nas
duas formas de publicação. `seo.ts` e o `markdown.ts` opcional ficam ao lado de
`index.tsx`. Seus catálogos permanecem em `i18n/{pt,en,es}.json` na pasta da
rota; os links comuns continuam em `src/constants/siteLinks/`.

```ts
import type { MarkdownSource } from '@/@types/markdown.ts'

import { content } from './seo.ts'

export const markdown = { render: () => content } satisfies MarkdownSource
```

O build avalia os produtores num runner isolado, seleciona os metadados das
rotas sem renderizar componentes nem executar preloads e gera uma cópia por
idioma. O serializador recebe texto simples estruturado, escapa a sintaxe de
Markdown e HTML e valida os destinos dos links. Não converte HTML nem interpreta
Markdown ou MDX fornecido pelo CMS. Uma string confidencial continua sendo uma
string válida: o produtor precisa selecionar somente conteúdo publicável. O nome
`src/**/markdown.ts` fica reservado aos produtores. Para um endpoint chamado
`/markdown`, use uma pasta com `index.ts`. Importar um produtor no app causa
erro de build; compartilhe com o HTML a fonte pública, sem importar o produtor.

Para rotas com parâmetros, use `markdown.ts` com `getPaths({ locale, signal })`,
que lista os caminhos públicos sem prefixo de idioma, como `/blog/meu-post`. A
fonte pode consultar um CMS no build e usar o `signal` em operações canceláveis.
`render` recebe o caminho enumerado e o idioma. Cada caminho precisa pertencer à
mesma folha da árvore, respeitando os filtros do router. O gerador recusa
caminhos inválidos, duplicatas, colisões com páginas, endpoints e arquivos de
`public/`, conteúdo inválido e limites de quantidade, tempo e tamanho definidos
em `tooling/markdown/constants.ts`. Falhas interrompem o build inteiro. Os
cabeçalhos são regras exatas por arquivo somente na configuração do host, sem
replicar essas regras no runtime do Nitro. O limite local de artefatos não
substitui os limites da plataforma de publicação, que devem ser conferidos antes
de aumentar o volume de conteúdo.

Um novo artigo, uma tradução ou uma alteração no CMS exige outro build para
atualizar os arquivos. Se o HTML consulta dados mais recentes em runtime, ele
pode divergir do snapshot; use a mesma versão publicada da fonte quando precisar
de paridade. O timeout cancela o sinal e interrompe a espera, mas não preempta
código síncrono nem garante o encerramento de um SDK que ignore cancelamento.

A home publica `/pt/index.md`, `/en/index.md` e `/es/index.md`. As outras
páginas usam caminhos como `/pt/about.md`. O HTML inicial anuncia o arquivo com
`<link rel="alternate" type="text/markdown">`, e o `llms.txt` prefere o `.md`
quando a página selecionada possui esse artefato. O build grava os arquivos em
`.markdown/public/`, e o Nitro os inclui nos estáticos da Vercel. O manifesto do
servidor contém caminhos e metadados do índice, sem o corpo dos documentos. O
mapa completo é eliminado do bundle do cliente: a descoberta pelo `alternate`
acontece no SSR, e o índice público continua disponível em `/llms.txt`. A
hidratação preserva o link recebido; a navegação dentro do documento o remove
quando o caminho muda, para não anunciar um arquivo de outra página.

Na Vercel, um arquivo chamado `index.md` também pode resolver a URL do seu
diretório. Por isso, o build insere rewrites exatos desses diretórios para a
função SSR antes de `handle: filesystem`, com e sem barra final. Isso mantém
`/pt` como página HTML e reserva `/pt/index.md` ao documento Markdown. A regra
também cobre um caminho dinâmico que gere, por exemplo, `/pt/blog/index.md`. O
destino vem do fallback do Nitro; se a configuração não tiver um fallback
incondicional reconhecido, o build falha. Os demais arquivos seguem a resolução
estática normal.

GET e HEAD da página com `Accept: text/markdown` recebem 307 para o `.md`
localizado. A negociação considera pesos `q` e especificidade, com preferência
por HTML em empate. Ausência de `Accept` e `*/*` usam HTML; `q=0` exclui o tipo.
Se nenhum formato for aceitável numa página com artefato, a resposta é 406. A
negociação preserva `Vary` e acrescenta `Accept`; os redirects e o 406 usam
`private, no-store`. Query strings não alteram o snapshot nem seguem para o
arquivo. Páginas sem artefato conservam o fluxo normal, inclusive erros e 404.
URLs de página sem idioma passam primeiro pela localização existente. Um `.md`
ausente responde 404 em texto simples, sem cache e sem passar pelo SSR.

O acesso direto ao `.md` é servido como estático, sem renderizar a página ou
executar o produtor. O arquivo usa `text/markdown; charset=utf-8`, idioma da
URL, `nosniff`, `Cross-Origin-Resource-Policy: same-origin` e
`public, max-age=0, must-revalidate`. Cookies e `Accept-Language` não mudam seu
conteúdo. HEAD mantém os cabeçalhos e não envia corpo. O middleware não aplica
CSP de HTML aos arquivos servidos diretamente pelo host.

Em desenvolvimento, a geração acontece ao iniciar o servidor e após mudanças nas
fontes. Criar `markdown.ts` passa a usar o produtor; removê-lo volta ao
`content` de `seo.ts`, sem reiniciar o servidor. Essa atualização também
acompanha a página original quando uma fixture reexporta a rota. Os dois
caminhos são observados: após um erro de regeneração por falta de fonte, criar
`seo.ts` com conteúdo válido recupera a geração. A requisição lê o resultado já
gerado; falhas de regeneração são mostradas no servidor e na interface. O
preview lê os arquivos do último build e aplica os cabeçalhos estáticos
configurados para a Vercel, incluindo ETag e revalidação condicional. Esse
adapter local não comprova o comportamento do CDN após publicação. A regressão
também inspeciona a ordem das regras no artefato final; o deploy reutiliza esse
mesmo build depois da aprovação dos testes.

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
`AgentReadiness` cobrem conteúdo sem JavaScript, idiomas, negociação, HEAD, 404
e navegação em larguras de celular e desktop.

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
