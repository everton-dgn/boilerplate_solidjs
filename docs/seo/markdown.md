# Markdown e leitura por agentes

[Voltar ao guia principal](../seo.md)

## Leitura por agentes

O Markdown é derivado do HTML renderizado. Com `route.info.markdown: true` na
folha da rota, o build gera um arquivo `.md` por idioma; com `'dynamic'`, a
conversão acontece a cada requisição, para páginas cujo conteúdo depende dela.
Rotas com parâmetro ficam sempre na requisição, porque o build não conhece seus
valores. A elegibilidade usa o SEO efetivo, inclusive a herança e um
`noindex: false` explícito no filho. `llms` continua independente: decide a
inclusão no índice. Login e conteúdo por visitante não devem optar pela
publicação. O opt-in só declara que o conteúdo é público e não controla acesso.

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
Markdown, aguarda o SSR e só converte o HTML quando o estado de integridade do
render indica conclusão sem erros; o HTML normal mantém streaming. O estado
cobre erros observados pelo render; não atesta dados de hidratação
silenciosamente descartados pelo serializador, e o Markdown usa o HTML
assentado, sem esses dados. O contrato completo, a resposta de recusa e o
critério para remover o patch estão em
[erros no servidor](../server-errors/ssr-integrity.md#integridade-do-ssr-para-markdown).

O prerender do build passa pelo mesmo adaptador. O módulo
`tooling/markdownPrerender/` pede ao middleware a lista das páginas estáticas
(`/_markdown/static.json`), prerenderiza cada `.md` e publica a lista como
arquivo estático, junto com o `llms.txt`. O middleware só monta a lista no
worker do prerender, que recebe a fase pelo ambiente do processo e pelo header
`x-nitro-prerender`. Em produção, qualquer cliente lê o arquivo publicado, e o
header sozinho não reconstrói o inventário: ele não autentica nada. Por isso a
lista só pode conter páginas públicas, as mesmas que o build publica em `.md`;
num redirect, o header só troca a resposta por 500 público. Uma página que falhe
ou não seja gravada, ou uma lista inválida ou que não passe pelo prerender,
interrompe o build. O Nitro só falha por rota com erro registrado; uma rejeição
no fetch ou na gravação deixaria o arquivo de fora sem falhar, e por isso o
módulo confere no fim que cada `.md` da lista foi gravado. A validação confere
também status, MIME, `fileName` real, UTF-8 e conteúdo. Um redirect ou um
documento HTML gravado como `.md.html` não satisfaz a publicação esperada. Uma
página curta ou um exemplo legítimo de HTML dentro do Markdown continuam
válidos; não há mínimo universal de caracteres nem proibição de tags isoladas. O
resultado fica em `.vercel/output/static`.

### Agregado llms-full.txt

O leitor do índice fica em `tooling/markdownPrerender/helpers/readLlmsIndex/`,
junto do gerador que o consome. Seus testes usam o runner Node de tooling.

O build gera `/llms-full.txt` a partir dos Markdown estáticos aprovados,
selecionados pelos links editoriais do `/llms.txt`, inclusive os casos de uso de
`LLMS_USE_CASES`. Inclui somente documentos no idioma base e deduplica um mesmo
documento referenciado em mais de uma seção. A ordem é determinística e o
cabeçalho declara o idioma e a cobertura. Links HTML e conteúdo dinâmico ficam
fora dessa cobertura; o agregado não consulta URLs arbitrárias nem congela o
banco de dados. URLs com query também ficam fora, pois podem representar uma
leitura diferente do arquivo estático. Fragmentos selecionam o mesmo documento e
não causam a repetição de seu corpo.

Os corpos completos são lidos e escritos incrementalmente, com validação de
caminhos e symlinks. A publicação usa um arquivo temporário promovido somente
depois da conclusão. O orçamento inicial é 10 MiB, configurável em
`tooling/markdownPrerender/constants.ts`; excesso interrompe o build sem truncar
o conteúdo. O arquivo preserva os links do documento e associa fragmentos não
vazios, como `#equipe`, à página de origem, para que a leitura conjunta não
transforme uma âncora de uma página em âncora de outra. O destino neutro `#`
permanece neutro, inclusive quando o conversor o usa para remover uma URL
insegura.

Quando não há documentos selecionados, o build omite o agregado e o anúncio. Um
`llms-full.txt` preexistente na saída estática interrompe o build, mesmo nessa
situação, para impedir a publicação de conteúdo residual. Quando existe, o
índice o anuncia sem selecioná-lo como entrada de si mesmo. O nome é mutável e
não recebe cache `immutable`. Não há um segundo gerador runtime: o servidor de
desenvolvimento não serve esse arquivo, mesmo quando o índice o anuncia. Use o
build e o preview para verificar o destino. O tamanho de um arquivo estático não
deve ser confundido com o limite de resposta de função.

### Artefatos e roteamento da plataforma

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
curingas. Além do peso, só `charset=utf-8` e, em `text/markdown`, o parâmetro
`variant` do RFC 7763 com `GFM` ou `CommonMark` (variantes registradas pelo
RFC 7764) são aceitos; outro parâmetro descarta a faixa. O cabeçalho é lido numa
varredura linear, então um `Accept` longo não custa tempo quadrático. Nenhum
formato aceitável na página publicada resulta em 406. Query strings permanecem
no SSR. HEAD renderiza a mesma representação e remove o corpo. APIs, assets, RPC
e métodos de escrita ficam fora da negociação. Num caminho de página sem handler
de API para o método, POST, PUT, PATCH, DELETE e OPTIONS recebem 405 com
`Allow: GET, HEAD`: sem essa resposta, o handler do plugin renderizaria a página
com status 200 no idioma base, fora do contexto de idioma. Os formulários do
router enviam ao endpoint das server functions, que não passa por essa
restrição.

A localização preserva URL > cookie > Accept-Language. Redirects seguros para
uma página elegível da mesma origem preservam a intenção `.md`; o middleware não
segue redirects. Erros não viram documentos de sucesso. Um 404 HTML negociado
mantém status 404, idioma e `noindex`; páginas sem opt-in não publicam seu
conteúdo de sucesso pelo alias Markdown. Um `X-Robots-Tag` com `noindex` ou
`none` na resposta da página também recusa a publicação;
`max-image-preview: none` só limita a prévia de imagens e não conta.

As respostas convertidas na requisição recebem `text/markdown; charset=utf-8`,
`private, no-store`, `Vary: Accept` adicional ao Vary existente e CSP com
`script-src 'none'`. Uma conversão com sucesso também acrescenta
`Link: </llms.txt>; rel="describedby"`, preservando os valores de `Link`
recebidos do render. GET e HEAD mantêm os mesmos metadados. Os arquivos do build
são servidos pela camada estática, sem passar pela função: o `vercel.json`
define o `Content-Type`, as `routeRules` do Nitro definem `nosniff` e
`Cross-Origin-Resource-Policy` ([segurança](../security.md)), e o cache segue o
padrão da Vercel para estáticos. Eles não gravam cookie de idioma nem
`Content-Language`; o idioma vem da URL. O preview local (`vp run start`) não
aplica o `vercel.json` e serve `.md` como `application/octet-stream`.

O módulo de build acrescenta ao `config.json` da Vercel uma regra de descoberta
para a extensão `.md` e, quando gerado, para `/llms-full.txt`. A regra tem
`continue: true` e acrescenta somente `Link`, sem gerar uma regra por documento.
Ela também pode alcançar um erro respondido pela função: o cabeçalho descreve o
site e não comprova existência, elegibilidade ou sucesso da URL. Status,
`no-store` e `noindex` da resposta continuam valendo. O tipo do agregado é
configurado como override do arquivo existente, sem mudar o MIME de um 404
quando o agregado não foi gerado. O preview Nitro não aplica essa configuração;
os testes do artefato Vercel e os testes HTTP locais são provas distintas.

Os limites ficam em `src/middleware/markdownContent/constants.ts`: prazo total
de 15 segundos, HTML de até 2 MiB antes da conversão síncrona e Markdown de até
2 MiB. A leitura verifica cada chunk e cancela o leitor ao exceder o teto;
`Content-Length` não substitui essa contagem. O chunk corrente já foi alocado
pelo produtor. A conversão só publica depois de validar o tamanho final. Timeout
e desconexão abortam o sinal do render, mas código síncrono e serviços que
ignoram `AbortSignal` não são preemptados. O SSR assíncrono pode ter montado o
HTML inteiro antes da leitura, e a conversão mantém buffers intermediários; o
limite não equivale a um teto total de memória do processo. As reservas de saída
cobrem os corpos possuídos pela aplicação, não buffers do socket, CDN ou
adapter. O [piloto HTTP](../testing.md#carga-da-publicação) mede esses efeitos
no Node local. A hospedagem precisa de verificação própria.

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
