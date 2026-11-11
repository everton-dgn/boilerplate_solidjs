# Índices editoriais, endpoints e cache

[Voltar ao guia principal](../seo.md)

## Seleção para llms.txt

O `llms.txt` coleta os mesmos metadados pelo manifesto, sem renderizar páginas
nem executar preloads, e publica só as páginas que declaram `route.info.llms`. O
arquivo é um índice curado para modelos de linguagem. O formato não define um
teto de tamanho. Este projeto publica o índice como arquivo no build e aplica um
orçamento operacional de 1 MiB em `tooling/markdownPrerender/constants.ts`.
Excedê-lo interrompe o build, sem truncar o conteúdo. Em sites grandes, meça os
textos reais, selecione as páginas que explicam o produto e agrupe-as.
`llms: true` inclui a página; sem seção herdada, ela entra na seção padrão
`Pages`. `{ section: 'Guias' }` cria ou reutiliza uma seção com esse nome, na
ordem em que aparece no manifesto; `{ optional: true }` move a página para a
seção `Optional`, que o formato reserva ao conteúdo que o modelo pode pular, e
uma seção declarada com esse nome se funde a ela. A configuração é herdada pela
cadeia de rotas: um layout com `llms: { section: 'Docs' }` inclui suas filhas
nessa seção, uma filha pode sair com `llms: false` ou sobrescrever só o campo
que declara, e `llms: true` numa filha reativa a inclusão preservando seção e
marcação opcional herdadas. `noindex: true` exclui a página do sitemap e do
llms.txt, mesmo com a flag. O filtro considera a configuração efetiva da página,
incluindo herança e a rota de índice filha. O resolvedor fica colocalizado em
`src/routes/(seo)/llms.txt/helpers/resolveRouteLlms/`. O índice sai no idioma
base. Rotas com parâmetro ficam fora mesmo com `llms`, e as fontes de
`route.info.sitemap` não alimentam esse índice. A publicação de Markdown é
controlada separadamente por `route.info.markdown`; quando a folha declara
`markdown: true` ou `'dynamic'`, o link do índice aponta para o `.md`
(`/en/about.md`), e nas demais, para o HTML.

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
guarda em memória a resposta do robots. O llms.txt e as partes estáticas do
sitemap são arquivos do build, e o sitemap dinâmico reutiliza o manifesto. As
fontes dinâmicas são consultadas conforme o endpoint: o índice lista partes e
cada parte lê seu próprio lote. O llms.txt é montado dentro do contexto
Paraglide do idioma base (`baseLocale` do runtime), inclusive a descrição do
site e os metadados das páginas, para que o contexto de outro idioma não mude o
texto. A nota sobre o idioma do índice deriva do mesmo `baseLocale`, com o nome
do idioma em inglês, o idioma das notas. A lista de idiomas da mesma nota sai de
`locales`, com o idioma base primeiro, o nome em inglês e o caminho de cada
idioma: ela acompanha `project.inlang/settings.json` sem edição manual.
Respostas de sucesso do robots e do sitemap dinâmico saem com
`public, max-age=0, s-maxage=3600, stale-if-error=86400` em produção (o CDN
reutiliza por uma hora; a Vercel só cacheia resposta de função com `s-maxage` e
consome `s-maxage` e `stale-if-error` sem repassá-los ao navegador) e com
`no-store` em desenvolvimento. Com `stale-if-error`, um erro da função depois
que a cópia expira pode aproveitar uma cópia anterior, conforme o contrato da
hospedagem. Os arquivos estáticos usam a política de cache da plataforma; não
recebem a CSP nem o cache do middleware. As URLs absolutas dos três arquivos
partem da origem de `VITE_SITE_URL`; um site servido em um subcaminho não é
suportado por essa geração. A página 404 declara `robots: noindex`. A imagem
social fica em `public/images/og.png`, com cache imutável de um ano configurado
no `publicAssets` de `/images/` no `vite.config.ts`. Como esse cache não
revalida, publique uma imagem nova com outro nome (por exemplo,
`og-2026-10.png`) e atualize `SITE.image.path`: sobrescrever `og.png` deixa
navegadores e caches intermediários com a versão antiga por até um ano. O logo
do JSON-LD reutiliza `public/favicon/apple-touch-icon.png`.
