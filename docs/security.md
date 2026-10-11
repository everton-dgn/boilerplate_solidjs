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
renderizado no servidor: o SSR grava o atributo, e com valor nulo ele sai como
`style=""`, que a CSP também bloqueia. O `applyTheme` grava o `color-scheme`
direto em `element.style`, pelo CSSOM, que a CSP não bloqueia.

## Nonce e entradas de renderização

O nonce tem 16 bytes de `crypto.getRandomValues` em base64 e é criado a cada
requisição. No build, [`src/entry-handler.ts`](../src/entry-handler.ts) o cria
antes da cadeia de middleware e o grava em `locals.nonce`; fora dela,
[`requestNonce`](../src/middleware/securityHeaders/index.ts) o cria no primeiro
acesso. O `securityHeaders` lê esse valor antes do render, e a contenção usa o
mesmo, para que a página de erro e a CSP coincidam. O caminho até os scripts é:

- [`src/entry-handler.ts`](../src/entry-handler.ts) passa o nonce ao
  `handleRequest` do plugin, que o grava no script de um redirect decidido
  depois do shell.
- [`src/entry-server.tsx`](../src/entry-server.tsx) passa o nonce ao
  `renderToStream`, que o grava no `HydrationScript`, nos scripts de dados e de
  streaming, no script de título e nos `modulepreload`. Ele também o grava nos
  `<link rel="stylesheet">`, que o `'self'` do `style-src` já libera.
- O `Document` grava `nonce` no script inline do tema e no script da entrada do
  cliente, que ele mesmo renderiza com o caminho literal
  `/src/entry-client.tsx`. No build, o handler do plugin troca esse caminho pelo
  asset com hash.

As entradas autorais existem porque as geradas pelo `@solidjs/vite-plugin`
chamam `renderToStream` só com o manifesto, e o `fetch` que o Nitro usa chama
`handleRequest(request)` sem opções. O plugin local `project:entry-handler`, no
`vite.config.ts`, troca no build a entrada SSR do plugin pela
`src/entry-handler.ts`; o Nitro a lê da config. O tipo publicado de
`handleRequest` não declara `nonce`, e
[`src/@types/solid-ssr-handler.d.ts`](../src/@types/solid-ssr-handler.d.ts)
acrescenta o overload. Com as entradas autorais, o plugin deixa de gerar o
`DefaultErrorBoundary` de produção e a opção `start.errorBoundary` não tem
efeito; o `Errored` raiz do `App` continua responsável pela página de erro. Uma
exceção no próprio `Document` sai síncrona do `renderToStream` e a contenção de
falhas responde o 500 em texto, com o log fixo. A árvore de `entry-client.tsx`
precisa ser a mesma de `entry-server.tsx`.

## Validação e CSS em streaming

Em desenvolvimento a CSP não é enviada, porque o Vite injeta no `<head>` o
cliente de HMR e o patch de estilos sem nonce; os demais cabeçalhos valem. A CSP
só pode ser conferida no build, com `vp run start` ou
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

- Na Vercel, arquivos estáticos (`/assets/`, `/images/` e `/favicon/`) saem do
  CDN sem passar pela função. O `vercel.json` grava neles só
  `X-Content-Type-Options` e `Cross-Origin-Resource-Policy`; a CSP e as
  políticas de frame só têm efeito em documentos, que passam pelo middleware.
- `Cross-Origin-Embedder-Policy: require-corp` bloqueia recursos de outra origem
  sem `Cross-Origin-Resource-Policy` ou CORS. Ao adicionar fontes, imagens ou
  scripts externos, confira se o provedor envia esses cabeçalhos ou revise a
  política.
