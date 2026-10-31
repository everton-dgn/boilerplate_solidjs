# Cabeçalhos de segurança e CSP

[Voltar ao README](../README.md)

## Política de conteúdo

Os cabeçalhos de segurança saem do middleware, não do `vercel.json`. O
`securityHeaders` grava em toda resposta da cadeia `Strict-Transport-Security`,
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `Cross-Origin-Opener-Policy`,
`Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy` e a
`Content-Security-Policy`. Os valores ficam em
[`securityHeaders/constants.ts`](../src/middleware/securityHeaders/constants.ts).
A contenção de falhas grava os mesmos cabeçalhos no 500, na página de erro e no
controle lançado.

A CSP usa `script-src 'nonce-<valor>' 'strict-dynamic'`, sem `'unsafe-inline'`
para scripts. As demais diretivas são `default-src 'self'`, `style-src 'self'`,
`object-src 'none'`, `base-uri 'self'`, `form-action 'self'` e
`frame-ancestors 'none'`. O app não usa WebAssembly nem `eval`, então a política
não inclui `'wasm-unsafe-eval'`. Só respostas `text/html` levam o nonce; texto,
XML, JSON e redirects saem com `script-src 'none'`. Assim `/sitemap.xml`,
`/robots.txt` e `/llms.txt`, que têm `s-maxage`, não guardam o nonce de uma
requisição no cache compartilhado.

O `style-src` também fica sem `'unsafe-inline'`. No build os estilos chegam só
por `<link>` da mesma origem, e um `<style>` ou um atributo `style` no HTML é
bloqueado. Por isso o `Document` aplica o tema do cookie só pela classe `light`
ou `dark` do `<html>`, e o `color-scheme` vem das regras `.light`/`.dark` de
[`colors.css`](../src/theme/tokens/colors.css). Não use a prop `style` em JSX
renderizado no servidor: o SSR grava o atributo para qualquer valor não nulo, e
a CSP o bloqueia. O `applyTheme` grava o `color-scheme` direto em
`element.style`, pelo CSSOM, que a CSP não bloqueia.

## Nonce e entradas de renderização

O nonce tem 16 bytes de `crypto.getRandomValues` em base64 e é criado a cada
requisição por [`requestNonce`](../src/middleware/securityHeaders/index.ts), no
primeiro acesso a `event.nonce`. Esse campo pertence ao contrato nativo do
plugin do Solid. O `securityHeaders` o preenche antes do render, e a contenção
também o cria quando uma falha ocorre antes desse middleware, para que a página
de erro e a CSP coincidam. Um nonce fornecido pelo host é preservado; quando ele
separa scripts e estilos, a CSP e o `Document` usam o campo `script`. O caminho
até os scripts é:

- O handler nativo do plugin lê `event.nonce` e o grava no script de um redirect
  decidido depois do shell.
- [`src/entry-server.tsx`](../src/entry-server.tsx) passa o nonce ao
  `renderToStream`, que o grava no `HydrationScript`, nos scripts de dados e de
  streaming, no script de título e nos `modulepreload`. Ele também o grava nos
  `<link rel="stylesheet">`, que o `'self'` do `style-src` já libera.
- O `Document` grava `nonce` no script inline do tema e no script da entrada do
  cliente, que ele mesmo renderiza com o caminho literal
  `/src/entry-client.tsx`. No build, o handler do plugin troca esse caminho pelo
  asset com hash.

O Nitro usa a entrada SSR nativa do `@solidjs/vite-plugin`, sem substituição
local. As entradas autorais de renderização permanecem porque `entry-server.tsx`
cria o estado de integridade do render e o conclui pelo `onCompleteAll`, que a
entrada gerada pelo plugin não passa ao `renderToStream`; sem esse estado
concluído, todo `.md` responde 500 e o prerender interrompe o build. O plugin
exige o par cliente/servidor quando uma dessas entradas existe, e
`entry-client.tsx` confere o idioma e instala a guarda de histórico antes de
`hydrate()`, código que só poderia ir para `start.clientSetup` se as duas
entradas fossem geradas. Ambas usam a mesma árvore de `Document` e `App`. Com as
entradas autorais, o plugin deixa de gerar o `DefaultErrorBoundary` de produção
e a opção `start.productionErrorBoundary` não tem efeito; o `Errored` raiz do
`App` continua responsável pela página de erro. Uma exceção no próprio
`Document` sai síncrona do `renderToStream` e a contenção de falhas responde o
500 em texto, com o log fixo.

## Validação e CSS em streaming

Em desenvolvimento a CSP não é enviada: o HMR usa estilos inline, enquanto a
política de produção permite apenas folhas externas. Os demais cabeçalhos valem.
A CSP deve ser conferida no build, com `vp run start` ou
`vp run test:e2e:production`. Todo script novo no `Document` precisa de
`nonce={nonce}`.

Componentes `lazy()` com CSS própria podem aparecer em um fragmento depois que o
dado assíncrono de um `Loading` resolve. O runtime anuncia a folha com
`data-dfc` e libera o fragmento por um listener instalado por script com nonce,
sem handlers inline. O template do conteúdo precede os links, inclusive quando a
CSS já está em cache. A fixture `/fragment-css` verifica a ordem no HTML, a
renderização com estilos e a ausência de violações de CSP com a folha nova ou
armazenada no cache do navegador, sem modificar o HTML da aplicação.

## Limites conhecidos

- Na Vercel, arquivos estáticos (`/assets/`, `/images/`, `/favicon/` e os `.md`
  gerados no build) saem do CDN sem passar pela função. O `vercel.json` grava
  neles só `X-Content-Type-Options` e `Cross-Origin-Resource-Policy`, além do
  cache imutável em `/images/` e do `Content-Type` dos `.md`; a CSP e as
  políticas de frame só têm efeito nas respostas que passam pelo middleware.
  Pelo mesmo motivo, um arquivo que não deve ser público precisa sair de
  `.vercel/output/static`: o middleware não consegue bloqueá-lo. O build move
  para `dist/.vite/` o diretório `.vite/`, com o manifesto do Vite e o das
  server functions, que listam caminhos do código-fonte
  ([`moveViteMetadata`](../tooling/moveViteMetadata/index.ts)).
- `Cross-Origin-Embedder-Policy: require-corp` bloqueia recursos de outra origem
  sem `Cross-Origin-Resource-Policy` ou CORS. Ao adicionar fontes, imagens ou
  scripts externos, confira se o provedor envia esses cabeçalhos ou revise a
  política.
