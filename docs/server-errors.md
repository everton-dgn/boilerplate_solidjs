# Erros no servidor e chamadas de backend

[Voltar ao README](../README.md)

Toda chamada de backend deve entregar dados públicos ou um erro público novo
antes de chegar ao Solid. Essa regra vale também para fixtures e código gerado
por IA. O contrato abaixo deve ser preservado nas atualizações de dependências.

## Proteção atual

Os módulos desta proteção ficam em `src/infra/server/`. `publicErrors` pertence
a essa camada porque depende de `server-only` e da autorização de serialização
do Solid. `data/errorApi/` fica reservado à normalização de erros de domínio,
quando houver consumidores. Novos imports de erros públicos usam
`@/infra/server/publicErrors/index.ts`.

O [registro central](../src/infra/server/configureServerErrors/index.ts) usa
`configureServerFunctionsServer({ wrapInvocation })`. O
[Vite](../vite.config.ts) o carrega por `serverFunctions.serverSetup`, cobrindo
server functions chamadas diretamente no SSR e pelo transporte HTTP. O mesmo
módulo instala, em todos os modos, o hook `configureServerErrors({ onError })`
de `@solidjs/web`; a troca pelo erro público acontece só em produção.

- [requestJson](../src/infra/server/requestJson/index.ts) verifica o status
  HTTP, lê o JSON de sucesso e aplica o schema de saída dentro da proteção.
- [protectServerOperation](../src/infra/server/protectServerOperation/index.ts)
  captura lançamentos e rejeições e verifica a estrutura do resultado.
- [publicErrors](../src/infra/server/publicErrors/index.ts) cria um erro novo
  com a mensagem pública do catálogo colocalizado, no idioma da requisição, como
  descrito em [Idioma da mensagem pública](#idioma-da-mensagem-pública).
- [logServerFailure](../src/infra/server/logServerFailure/index.ts) é o único
  ponto de log: grava a mensagem fixa da origem e, para um `Error`, só a classe
  e os frames filtrados descritos em
  [Log de falhas](server-errors/logging.md#log-de-falhas).
- Os módulos importam `server-only`; o plugin impede que entrem no bundle
  cliente. O alias de testes existe somente no projeto Node.

Em produção o runtime do Solid já troca todo erro lançado por
`Error("Internal Server Error")`, em SSR, streaming e HTTP, inclusive fora de
server functions. Ele não barra um `Error` devolvido como dado: esse caso,
medido nos três canais, só é recusado pela verificação estrutural do wrapper.
Por isso o `wrapInvocation` continua registrado. Um fallback genérico e HTML
escapado não removem dados do payload já enviado.

`ResponseEnvelope` também é uma `Response`. O wrapper verifica o valor do
envelope antes de aceitar uma resposta sem corpo como controle, inclusive nos
status 204, 205 e 304. Depois reconstrói a resposta com os dados verificados.
`respond(dados)` tem o tipo dos dados para quem chama a server function; a
fronteira usa `isResponseEnvelope()` para reconhecer seu envelope em runtime.
Chamadas diretas no SSR recebem os dados desembrulhados pelo Solid.

O hook `onError` é aditivo. Em produção, ele troca qualquer falha que chega ao
runtime, inclusive de render e de rejeições fora de server functions, por um
`createPublicError()` novo. Nos dois modos, registra o log `[server-error]`
quando o erro não era público. Sinais de controle (`Response` sem corpo,
envelopes e `NotReadyError`) seguem a política padrão do runtime.
`Response.error()` também não tem corpo, mas o status 0 não sai como HTTP, então
ela vira falha pública. O caso do envelope lançado por uma query no SSR está em
[Validação e recuperação](server-errors/recovery.md#validação-e-recuperação). O
retorno do hook vai ao cliente sem nova sanitização, então ele nunca devolve o
objeto recebido, nem um erro público, que pode ter ganhado campos depois de
criado. O hook é síncrono e não lança, nem quando o log falha: uma falha dele
faria o runtime registrar o erro do hook.

Limites do hook:

- A rejeição de uma fonte assíncrona é serializada com a política padrão antes
  de qualquer hook. O mesmo corpo leva "Internal Server Error" para a fonte e a
  mensagem pública para o boundary.
- Em desenvolvimento o hook não troca o erro, como descrito em
  [Log de falhas](server-errors/logging.md#log-de-falhas): o navegador recebe o
  erro que o runtime recebeu, que numa server function já é o erro público do
  wrapper.
- Valores primitivos lançados não têm veredito por objeto; o hook roda e
  registra o log a cada vez que o runtime os encontra.

O handler nativo do plugin contém exceções que escapam dos middlewares, chama o
hook com `kind: "request"` e responde com 500 sem corpo. Ele também aceita uma
`Response` ou um envelope lançado com corpo, portanto essa contenção não
substitui a política de dados públicos nem a página de erro do app. O export
padrão de [`src/middleware/index.ts`](../src/middleware/index.ts) é
`createMiddleware()`, que adapta o evento do plugin à cadeia de `Request` do
`filesystem-routing` e de `composeMiddleware`, entregando essa cadeia a
`containFailures`. A contenção, em
[`src/middleware/containFailures/index.ts`](../src/middleware/containFailures/index.ts),
compõe a cadeia inteira dentro de si, e uma exceção nos middlewares, nas rotas
de API ou no handler de páginas vira 500 com os headers de segurança e o log
`[middleware]`. Só uma `Response` sem corpo e com status diferente de 0 passa
como controle, e sai com os mesmos headers; uma `Response` com corpo lançada
vira 500, porque pode carregar dados upstream. O middleware, o hook e o wrapper
usam a mesma classificação,
[`isControlResponse`](../src/infra/server/isControlResponse/index.ts). Os
headers de um `Response.redirect()` devolvido são imutáveis, então vão numa
cópia sem corpo; o retorno cru de `fetch()`, com headers imutáveis e corpo
upstream, não é copiado e vira 500. Em desenvolvimento o erro original segue
para o Vite. O build E2E monta a entrada com a mesma fábrica e passa as falhas
injetadas em `createMiddleware(extra)`, que as põe antes da cadeia e dentro da
mesma contenção. Como o E2E não chama o export padrão, um teste unitário exige
que ele contenha falhas, e a suíte `test:e2e:production` confere os headers do
middleware na entrada real.

As respostas da contenção não voltam pelo `securityHeaders`, então a própria
contenção grava os cabeçalhos de segurança e a Content-Security-Policy com o
nonce da requisição, lido por
[`requestNonce`](../src/middleware/securityHeaders/index.ts), que usa o campo
nativo `event.nonce`. Uma falha anterior ao `securityHeaders` pode encontrar a
requisição sem nonce; a contenção o cria antes de renderizar a página de erro,
para que os scripts dela, o handler do plugin e a CSP usem o mesmo valor. Sem
evento de requisição, o 500 em texto sai com `script-src 'none'`. O desenho da
CSP está no guia de [cabeçalhos de segurança](security.md).

Numa navegação, o 500 mostra a página de erro do app. Navegação é um `GET` ou
`HEAD` num caminho de página cujo `Accept` permita HTML ou Markdown, incluindo
curingas e a ausência do header, conforme `isPageRequest` em
[`requestClassification`](../src/middleware/requestClassification/index.ts); um
cliente que peça só Markdown também recebe a página de erro em HTML. Esse
critério é mais amplo que o do servidor de desenvolvimento do plugin, que só
considera HTML, `*/*` ou a falta de `accept`. `containFailures` grava um
`createPublicError()` em `locals.serverFailure` e chama o render da página. O
`ServerFailureGate` de [`App.tsx`](../src/App.tsx) lança esse erro antes do
Router, o `Errored` raiz mostra o `ErrorFallback` e o cliente hidrata o fallback
pelo erro serializado. Como o erro já é público, o hook não registra outro log.
O status é forçado para 500 na resposta. Se o render devolver algo que não seja
HTML, como o redirect de idioma de um caminho sem prefixo, a resposta é o 500 em
texto.

O render recebido pelo middleware é o dispatcher do plugin, que atende o
endpoint de server functions (`/_server`) antes da página. Por isso esse
endpoint e as rotas de API reconhecidas pelo `createAPIMatcher` do
`filesystem-routing` nunca recebem a página de erro, mesmo com `accept` de HTML:
chamar o render ali executaria a função sem os middlewares que falharam. Esses
caminhos e os outros métodos recebem a mensagem pública em texto. O plugin
aceita um único render por requisição: se a cadeia falhar depois de já ter
renderizado a página, a resposta também é o 500 em texto. Se o render de erro
falhar, a resposta é o 500 em texto e o log ganha a linha `[error-page]`, com a
classe e os frames do erro do render descritos em
[Log de falhas](server-errors/logging.md#log-de-falhas). A contenção lê o
endpoint do export `endpoint` de `virtual:solid-server-function-handler`, o
mesmo valor que o dispatcher do plugin usa, com `serverFunctions.endpoint` e o
`base` do Vite já aplicados; mudar essas opções não exige editar o middleware.
No projeto Node do Vitest, um alias troca esse módulo por um stub com o valor
padrão.

O cancelamento da própria requisição não é falha. Quando o valor capturado é o
`signal.reason` da requisição, com o sinal abortado, a contenção responde o 500
em texto, sem log e sem chamar o render. Esse caso cobre a desconexão do cliente
e o prazo da publicação, que chegam pelo mesmo sinal, porque o render em modo
`async` rejeita com esse motivo ao ser abandonado. A comparação é por
identidade: qualquer outro valor lançado com o sinal abortado continua
registrado como falha, inclusive um `AbortError` de outro sinal ou um erro que
traga o motivo em `cause`. Na página de erro, o critério usa o sinal de
`event.request`, que é o que o render lê: o cancelamento não acrescenta a linha
`[error-page]`, e a falha original já foi registrada antes do render. Um erro
distinto desse render mantém a linha. Em desenvolvimento o valor é relançado,
como qualquer outro. Um motivo primitivo não tem identidade própria e se
confunde com o mesmo valor lançado. O patch preserva também motivos como `null`,
`false`, zero, string vazia e `NaN`; o middleware usa `Object.is` para comparar
o motivo sem perder esses valores.

A contenção só alcança a janela da cadeia de middleware. A criação do evento, o
commit da resposta e falhas do corpo depois que a `Response` sai ficam fora
dela. O comportamento foi medido no preview do Nitro; o runtime da Vercel não
foi medido localmente.

## Idioma da mensagem pública

A mensagem de `createPublicError()` e dos 500 em texto vem do ID
`publicErrors_message`, em `src/infra/server/publicErrors/i18n/`, com os três
idiomas. `publicErrorMessage()` lê o idioma na hora da chamada, pelo contexto
que o `paraglideMiddleware` abre em `localizeRequest`: páginas usam URL, cookie,
`Accept-Language` e idioma base, e server functions chamadas por HTTP usam antes
o `Referer` de mesma origem. O render, as server functions chamadas no SSR, o
hook de `configureServerErrors` e a contenção da cadeia interna rodam dentro
desse contexto.

Fora dele, a mensagem sai no idioma base. Isso vale para as contenções externas,
que tratam falhas do próprio `localizeRequest` e do adaptador Markdown antes do
render, e para caminhos que não passam pela localização, como `robots.txt`. Numa
navegação tratada por essas contenções, o erro público nasce antes do render e
leva o idioma base no payload serializado, enquanto a página de erro renderiza
no idioma da requisição. O adaptador Markdown também roda fora do contexto e,
por isso, resolve o idioma do seu 500 pela requisição original, na mesma ordem
do `localizeRequest`.

O hook é síncrono e não pode lançar: se a resolução do idioma falhar, a mensagem
sai no idioma base. O texto vem só do catálogo, sem nada do erro original. Os
testes Node e E2E conferem o texto esperado no idioma de cada caso.

## Log de falhas

Veja [log de falhas](server-errors/logging.md#log-de-falhas).

## Como adicionar uma chamada

Veja
[como adicionar uma chamada](server-errors/backend.md#como-adicionar-uma-chamada).

## O que o lint cobre

Veja [o que o lint cobre](server-errors/backend.md#o-que-o-lint-cobre).

## Consumo em páginas

Veja [consumo em páginas](server-errors/backend.md#consumo-em-páginas).

## Validação e recuperação

Veja
[validação e recuperação](server-errors/recovery.md#validação-e-recuperação).

### Página desatualizada após um deploy

Veja
[página desatualizada após um deploy](server-errors/recovery.md#página-desatualizada-após-um-deploy).

## Atualizar o Solid

Veja [atualizar o Solid](server-errors/solid-upgrades.md#atualizar-o-solid).

## Integridade do SSR para Markdown

Veja
[integridade do SSR para Markdown](server-errors/ssr-integrity.md#integridade-do-ssr-para-markdown).
