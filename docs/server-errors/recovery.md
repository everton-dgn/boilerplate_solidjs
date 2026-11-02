# Validação e recuperação de erros

[Voltar ao guia principal](../server-errors.md)

## Validação e recuperação

O [E2E de backend](../../src/tests/pages/BackendError/BackendError.e2e.test.ts)
roda no build de produção: cinco cenários (HTTP 500, exceção após leitura,
`Error` dentro do resultado, erro público e sucesso) em SSR inicial, streaming e
chamada HTTP; uma recarga por cenário de navegação, incluindo SSR sem
JavaScript; um teste de isolamento do bundle; três sinais de controle em server
functions chamadas no SSR (um `redirect()` lançado, um envelope devolvido e um
envelope lançado); e a regressão de `content-type` descrita abaixo, com um
envelope devolvido e outro lançado por `query()`. O envelope lançado chega ao
hook como controle, mas o router lança o valor dele no render e o documento vira
500, com ou sem o hook. No streaming, os casos de confidencialidade usam um id
terminado em `:gated`: o backend sintético segura `/data` até o teste ver o
fallback e liberar o gate, sem depender do atraso fixo do backend.

Quando uma `query()` lida no SSR devolve ou lança um envelope de `respond()`, o
`handleResponse` do router copia para a resposta da página só os headers que não
descrevem o corpo; `content-type`, `content-disposition`, `etag` e similares
ficam de fora, e o documento continua HTML
([solidjs/solid-router#633](https://github.com/solidjs/solid-router/issues/633)).
O E2E cobre os dois casos como regressão. Os demais headers do envelope, como
`set-cookie` ou um header próprio, ainda são copiados; lidos depois do envio do
início da resposta, são descartados com o aviso `[LATE_HEADER_WRITE]`. Headers
da página pertencem ao render, não a um envelope de dados.

O
[E2E de erros fora de server functions](../../src/tests/pages/OutsideError/OutsideError.e2e.test.ts)
cobre throw no render com e sem boundary local, throw no render depois do shell
e rejeições assíncronas no SSR, como filho direto de `<Loading>` e dentro de
elemento, além de exceções de middleware antes e depois de `next()`. Cada caso
lê o documento bruto fora do navegador e confere o fallback no navegador. Nos
casos de streaming, a falha só acontece depois que o teste observa o shell e
libera um gate no backend sintético, sem temporizador. Controles positivos
conferem que a fixture recebeu o marcador (header `x-fixture-marker` e contagem
do backend), que o erro lançado carregava esse marcador (header
`x-fixture-thrown` sem streaming e registro no backend sintético nos casos com
gate e de middleware) e que o gate foi usado. Os casos de middleware rodam em
série e exigem, por requisição, uma nova linha com a mensagem fixa
`[middleware]`.

O `webServer` do Playwright grava a saída do preview em
`test-results/server-<modo>.log`. O
[teardown global](../../tooling/testing/server-log-teardown.ts) confere que o
arquivo registrou o endereço do preview e recusa qualquer marcador privado.

Os marcadores sintéticos nascem no backend após o build. Os testes verificam o
corpo completo, headers, DOM e erros do navegador. O teste de assets procura
código e endereço exclusivos do servidor. Os testes Node cobrem HTML 500, JSON
inválido, schema inválido, falha de rede e cancelamento do corpo, além dos
contratos do wrapper.

A captura HTTP usa `route.fetch()` e entrega a resposta ao browser com
`route.fulfill()`, pois o decoder cancela o stream ao receber a exceção. Essa
captura aguarda o corpo completo e não mede cancelamento ou latência. O
streaming do documento SSR não é interceptado.

Os testes toleram em `pageerror` só a mensagem pública no idioma da página e,
nos casos que passam por uma fonte assíncrona ou por streaming, a mensagem
genérica do runtime; cada caso declara as mensagens admitidas, que dependem da
ordem entre a hidratação e a chegada do fragmento rejeitado. O status do
streaming pode permanecer 200 após o envio inicial; os testes conferem
confidencialidade independentemente dele. Fontes adiadas aninhadas e trabalho
assíncrono fora do retorno aguardado exigem integração e testes próprios.

O link global "Recarregar página" preserva a URL e faz uma navegação de
documento, independente da hidratação. Ações iniciadas depois do carregamento
precisam ser repetidas. Para retry local com query, invalide a chave antes de
`reset()`: `revalidate(getData.key); reset()`. Confirme uma nova chamada ao
backend.

Após alterar essa fronteira, execute:

```bash
vp run test:tooling
vp run test:unit
vp run test:e2e src/tests/pages/BackendError src/tests/pages/OutsideError src/tests/pages/OutdatedPage
vp run typecheck
vp run check:ci
```

O [CI](../../.github/workflows/ci.yml) executa `test:tooling` e a suíte E2E
completa; `vp run validate` e o `pre-push` rodam `test:tooling` localmente, o
que inclui as duas políticas. Os testes da política verificam as regras no
parser real e seu registro no lint completo, com casos recusados e permitidos
para cada exceção. Consulte os resultados de cada execução nos logs da validação
local e do CI.

### Página desatualizada após um deploy

Uma aba aberta antes de um deploy continua com o JS do build anterior até
carregar um documento. Ela pode chamar uma server function que o build novo não
tem. O servidor responde 404 com o header `X-Server-Function-Unknown`, sem
executar a função, e o client rejeita com `unknownFunction: true`. A recuperação
está descrita no fim desta seção. Essa recusa sai antes do `wrapInvocation` e do
hook de `configureServerErrors`, sem corpo em produção e sem linha
`[server-error]`.

O plugin do Solid também carimba as chamadas de produção que não usam GET com o
header `X-Server-Function-Build`, e o `configureServerFunctionsServer` que ele
gera recebe o mesmo id em `buildId`. Uma chamada carimbada por outro build, cuja
função manteve o id no deploy, recebe 409 sem executar a função, com
`X-Server-Function-Unknown`, o id do servidor em `X-Server-Function-Build` e
`Cache-Control: no-store`. O client rejeita com `unknownFunction: true`, como no
404, e a recuperação é a mesma; a recusa também sai antes do `wrapInvocation` e
do hook, sem corpo em produção. O carimbo é composto com o `prepareRequest` que
o app passar a `configureServerFunctionsClient`, importado de
`@solidjs/web/server-functions/client`. Uma chamada sem o header continua
aceita: o id é público no bundle, e a checagem só detecta um client de outro
build. As chamadas de `query()` usam GET e saem sem o carimbo. A exceção é
quando os argumentos passam do limite de URL do runtime: o client envia a
leitura por POST, com o carimbo, e ela passa pela checagem. Em desenvolvimento
não há id nem checagem.

Com o Nitro, o client e o servidor saem do mesmo build, e o servidor recebe o id
que o plugin guarda em memória. O plugin também grava o id e as server functions
que o client alcança em `.vite/solid-server-functions.json`, ao lado do
`manifest.json` do Vite, no diretório público. O
[módulo `moveViteMetadata`](../../tooling/moveViteMetadata/index.ts) move esse
`.vite/` para `dist/.vite/` no fim do build, então nenhum dos dois é publicado;
os testes leem os arquivos de lá.

A aba também pode pedir um chunk ou uma folha CSS com o hash do build anterior,
que o deploy novo não publica. A recuperação segue uma regra: a página só
recarrega sozinha quando o usuário já pediu para sair dela ou quando o fallback
do `Errored` raiz já a tirou da tela. Nos demais casos, a página fica como está
e o `OutdatedPageNotice` oferece a recarga. O runtime não informa se uma página
tem algo não salvo, então a recarga automática fica nos pontos em que não perde
nada que a navegação ou a página de erro já não perderiam.

| Situação                                                                               | Comportamento                                                         |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Hover ou foco num link, com chunk ausente ou leitura recusada no preload               | Marca a página, sem recarga e sem aviso.                              |
| Navegação que muda o caminho sem idioma, com a página marcada                          | Navegação de documento para o destino, preservando `replace`.         |
| A mesma navegação, com alterações registradas em `registerUnsavedChanges`              | Segue no client; o guard da própria página decide.                    |
| Query, hash, voltar, avançar ou navegação sem conexão                                  | Segue no client.                                                      |
| Clique sem preload, com o JS ou o CSS do destino ausente                               | O `Errored` raiz recarrega uma vez, já no destino.                    |
| Leitura do render ou `lazy()` recusados sem `Errored` local                            | O `Errored` raiz recarrega uma vez.                                   |
| Leitura do render ou `lazy()` recusados dentro de um `Errored` local                   | O fallback local fica, e o aviso oferece a recarga.                   |
| Envio recusado com 404 ou 409 rotulado                                                 | A rejeição volta a quem chamou, e o aviso de envio oferece a recarga. |
| Leitura fora do render (polling, `GET` direto, reconexão de `live()`)                  | Marca a página, sem aviso.                                            |
| No `Errored` raiz: recusa repetida em 30 segundos, sem `sessionStorage` ou sem conexão | A página de erro aparece, com a recarga manual.                       |

A recuperação usa três peças:

- Detecção: `installOutdatedPageDetection`, instalado pelo `entry-client`, marca
  a página como desatualizada quando o helper de preload do Vite dispara
  `vite:preloadError` e quando uma server function responde 404 ou 409 com
  `X-Server-Function-Unknown`. Uma recusa fora de computação rastreada e sem
  `GET` conta como envio e dispara o aviso de envio. O módulo também registra o
  hook de `configureClientErrors`: quando um boundary mostra fallback para uma
  falha de chunk registrada ou para um erro com `unknownFunction: true`, o hook
  dispara o aviso de fallback. O evento de preload sai também no preload por
  intenção do `intentPreload()`, antes do clique, e só existe no build. O
  listener não chama `preventDefault()`: o import resolveria `undefined`, e o
  `lazy` da rota guardaria esse módulo vazio até a recarga.
- Próxima navegação: com a página marcada, `createOutdatedPageGuard`, chamado ao
  lado do guard de idioma, troca por navegação de documento a próxima navegação
  que muda o caminho sem idioma, preservando `replace`. Query e hash seguem no
  client, e sem conexão a navegação continua no client. Voltar e avançar entre
  entradas do mesmo documento também seguem no client: os chunks dessas páginas
  já carregaram, e uma leitura recusada ali segue as regras da tabela. O router
  chama os listeners de `useBeforeLeave` na ordem de inscrição, e o guard de
  versão é inscrito no layout do `Router`, antes de qualquer rota. Como ele
  chama `preventDefault()` e troca de documento na hora, um guard de página que
  confere `!e.defaultPrevented`, como o exemplo do router, nunca chegaria a
  perguntar. Por isso, uma página com alterações não salvas registra, além do
  próprio `useBeforeLeave`, uma checagem com `registerUnsavedChanges`, importado
  de `@/primitives/createOutdatedPageGuard/index.ts`, dentro de `onSettled` e
  devolvendo a remoção como limpeza. Enquanto alguma checagem devolver `true`, o
  guard de versão deixa a navegação no client. Se o usuário confirmar a saída
  com `e.retry(true)`, a navegação também segue no client, e a página continua
  marcada para a próxima.
- `Errored` raiz: uma falha de chunk registrada pelo listener ou um erro com
  `unknownFunction: true` recarrega a página uma vez em vez de mostrar o
  `ErrorFallback`, com a tela vazia até o documento novo chegar. Quando o erro
  chega à raiz, a árvore já saiu da tela, então a recarga não perde nada que a
  página de erro já não perderia. É também o caminho do clique que chega antes
  da resposta 404 do preload. A recarga roda no `onSettled`, num `setTimeout`,
  depois de o router gravar a URL do destino. Se o documento não for trocado em
  10 segundos, por exemplo porque um `beforeunload` da página cancelou a
  recarga, o `ErrorFallback` aparece no lugar da tela vazia. O prazo cobre o
  servidor ainda frio logo depois do deploy. O fallback lê o erro sem rastrear,
  para que um segundo erro não o reconstrua e troque a recarga pendente pela
  página de erro. A trava `outdated-page-reload` no `sessionStorage` dura 30
  segundos: se a falha voltar dentro dela, o build servido também falhou e a
  página de erro aparece. Sem `sessionStorage` ou sem conexão, a página de erro
  aparece direto.

Uma leitura ou um `lazy()` recusados dentro de um `Errored` local não recarregam
a página. O limite local existe para manter o resto da tela funcionando, e uma
recarga apagaria o que estiver digitado ao lado dele. Tentar de novo também não
resolve, porque o id não existe no build novo. O `OutdatedPageNotice` mostra
"Parte da página não carregou" com o botão "Recarregar página", e a próxima
navegação já sai por documento. Um fallback local pode trocar o próprio "Tentar
de novo" por uma ação de recarga conferindo `isVersionError(error())`.

Um envio recusado não se repete sozinho: o `ctx.retry` repetiria a mesma chamada
e receberia a mesma recusa, 409 pelo carimbo ou 404 pelo id ausente. A rejeição
com `unknownFunction: true` volta a quem chamou, e o `OutdatedPageNotice` pede
para recarregar e enviar de novo, avisando que o que não foi salvo pode se
perder. Como o 404 e o 409 saem antes de ler os argumentos e de executar a
função, reenviar depois da recarga não duplica o efeito dessa tentativa. Uma
falha de rede, um timeout ou um 5xx sem o rótulo não marcam a página: o
resultado é desconhecido, e o projeto confere o estado no backend ou usa uma
chave de idempotência antes de repetir. Guardar o formulário para depois da
recarga fica com o projeto, por exemplo com um rascunho salvo automaticamente.

Limites conhecidos:

- O client guarda um único `responseHandler`. Com `serverFunctions.components`,
  o `installServerComponents` ocupa a mesma vaga e vence quem configurar por
  último; os dois precisam ser compostos à mão.
- O hook de `configureClientErrors` também é único e é a vaga natural de um
  monitor de erros. Um monitor instalado depois substitui o hook em silêncio, e
  o aviso de fallback deixa de aparecer para os erros de versão. Um `onError`
  passado a `render` ou `hydrate` tem o mesmo efeito, porque o runtime prefere o
  hook da raiz ao ambiente. Nos dois casos, o monitor precisa ser composto
  dentro de `installOutdatedPageDetection`.
- O handler separa envio de leitura pelo ponto de chamada: fora de computação
  rastreada e sem `GET`. Uma leitura direta feita depois de um `await`, dentro
  de `untrack` ou num preload de rota conta como envio e mostra o aviso de
  envio. Leituras usam `query()` ou `GET()`.
- `registerUnsavedChanges` só protege a página que se registra. Uma página que
  tem só o `useBeforeLeave` perde o rascunho na troca por documento quando a aba
  está marcada, a menos que também tenha um `beforeunload`.
- A navegação de documento também descarta o estado global em memória, como
  stores e conexões. Estado que precisa sobreviver precisa estar persistido.
- Uma falha de rede no import também marca a aba, e a próxima navegação sai por
  documento.
- A falha de um `lazy()` dentro da página, sem `Errored` local, também chega ao
  `Errored` raiz e recarrega a página atual, com o que ainda não foi salvo.
- Uma leitura `GET` cujo id sobreviveu ao deploy executa no servidor novo sem
  carimbo e sem detecção. Quando os argumentos ou a saída de uma leitura mudam,
  a função precisa aceitar também o formato do deploy anterior, ou mudar de
  nome, para que a aba antiga receba o 404.
- A recarga entrega o build que o host servir, que pode ser um rollback ou uma
  instância de outro build. O aviso diz que a página pode estar desatualizada,
  sem prometer que a recarga resolve.
- Um asset ausente em `/assets/`, como o chunk de outro build, responde 404 com
  `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` e
  `Cross-Origin-Resource-Policy: same-origin`, sem a página SSR. O
  `vite.config.ts` registra `/assets` em `publicAssets` sem fallthrough. No
  preview e no preset `node-server`, o Nitro responde o miss de GET e HEAD com o
  404 `no-store` de diretório público exclusivo, e o h3 preserva esse cabeçalho
  quando a route rule de `/assets/**` aplica o cache imutável ao erro. Na
  Vercel, o preset grava a rota 404 `no-store` logo depois de `filesystem`, e o
  miss não chega à função. A route rule leva nosniff e CORP, com os valores de
  `SECURITY_HEADERS`, ao miss e aos acertos servidos pela Vercel ou pelo
  `node-server`; no `vp run start`, o acerto sai do servidor estático do srvx
  sem esses cabeçalhos e sem `Cache-Control`, como antes. O diretório
  `public/assets` não existe de propósito: os arquivos vêm da saída do Vite. O
  teste `BuildOutput.assets.production` confere as rotas do
  `.vercel/output/config.json` e o 404 no preview, e falha se uma atualização do
  Nitro mudar esse comportamento. Ele cobre a configuração gerada, não o CDN: a
  precedência do `no-store` sobre o cache da rota de `/assets` segue a ordem das
  rotas. O autor de
  [nitrojs/nitro#4474](https://github.com/nitrojs/nitro/pull/4474) conferiu essa
  ordem num deploy próprio na Vercel; o deploy deste repositório ainda não foi
  conferido. No `vp run start`, o miss só vale para GET e HEAD em
  `/assets/<arquivo>`, e continuam no SSR, com o cache da route rule, `/assets`,
  `/assets/`, caminhos com segmento vazio e outros métodos. Na Vercel, só
  `/assets` sem barra chega à função: a rota 404 `no-store` depois de
  `filesystem` cobre o resto, com qualquer método. Nenhuma URL gerada pelo Vite
  tem esses formatos. O 404 do miss não leva a CSP, o HSTS nem as políticas de
  frame, que só valem nas respostas do middleware.
