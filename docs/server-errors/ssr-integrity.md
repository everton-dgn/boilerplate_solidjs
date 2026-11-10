# Integridade do SSR na publicação de Markdown

[Voltar ao guia principal](../server-errors.md)

## Integridade do SSR para Markdown

A entrada cria o estado com `createRenderIntegrity()`, de
[renderIntegrity](../../src/infra/server/renderIntegrity/index.ts), e o grava em
`event.locals.ssrRenderState` antes de chamar `renderToStream`. O estado é
somente leitura: o hook de `configureServerErrors` marca `hasErrors` por
`markRenderFailure` quando recebe uma falha com `kind: "render"`, e
`onCompleteAll` marca `hasCompleted` pela função `complete` da mesma fábrica. Um
estado criado fora dela não é marcado. Sinais de controle também marcam: um
`redirect()` ou `respond()` lançado no render e capturado por um `<Errored>`
aninhado vira fallback com HTML 200. Desde o
[solidjs/solid#4130](https://github.com/solidjs/solid/pull/4130), o hook recebe
cada erro uma vez por tipo em cada requisição. Uma falha de server function
contida por um boundary chega primeiro como `server-function` e depois como
`render`, e só o segundo aviso marca o estado. O callback sozinho não comprova
integridade: ele também pode ocorrer após falha de fragmento. O adaptador exige
conclusão e ausência estrita de erros observados pelo render depois de aguardar
o SSR, antes de publicar HTML convertido. Estado ausente ou inválido resulta em
erro público 500 sem cache. Redirects e respostas que não são páginas elegíveis
preservam seu fluxo anterior. As páginas estáticas passam por esse mesmo
adaptador no prerender do build, e uma recusa ali interrompe o build.

Como o hook é a fonte desse sinal, ele fica instalado também em desenvolvimento,
onde marca o estado sem trocar o erro, como descrito em
[Log de falhas](logging.md#log-de-falhas). A entrada continua sem um `onError`
local: ele teria precedência sobre o hook global, desviaria a sanitização e o
log e deixaria o estado sem marcação, e o Markdown publicaria com
`hasErrors: false`. O registro do hook chama `observeRenderFailures()`; até lá a
fábrica cria o estado com `hasErrors` indefinido, e o Markdown recusa a página.
Sem o `serverFunctions.serverSetup` do Vite, que carrega o registro, todo `.md`
responde 500 e o prerender interrompe o build.

O hook encontra o estado pelo evento que o runtime associa à falha. As falhas do
serializador, o `onCleanup` que lança e o fallback de `<Errored>` chegam sem o
evento, e o runtime o lê do `AsyncLocalStorage`. Uma falha informada fora desse
contexto não marcaria o estado, e o Markdown publicaria o HTML. Os testes de
serialização cobrem esses três casos com o contexto presente.

O serializador padrão informa falhas de parse e de emissão ao hook, inclusive
sem um hook local. Antes do primeiro envio, a primeira falha marca `hasErrors`,
passa pela política de `configureServerErrors` e encerra o render sem chamar
`onCompleteAll`. Falhas síncronas também seguem esse caminho, sem relançar a
exceção para o chamador. O descarte libera o owner e as fontes assíncronas
pendentes.

No HTML em streaming, uma falha ocorrida enquanto o shell é montado impede que
ele seja enviado, e a resposta é um 500. Depois do shell, os bytes já enviados
não podem ser recolhidos: a falha chega ao hook, o render continua e o cliente
recebe a chave rejeitada com um erro que só nomeia a chave e a falha de
serialização. Na hidratação, a leitura dessa chave cai no `<Errored>` mais
próximo; a mensagem original fica no servidor. Markdown aguarda o render, então
toda falha ocorre antes do envio, e a publicação é recusada com erro público 500
e `cache-control: private, no-store`. Uma falha de serialização não depende do
timeout do adaptador para encerrar a resposta.

Serializadores personalizados mantêm o comportamento do runtime: as falhas que
eles informam chegam ao hook, mas não encerram o render. Erros suprimidos
internamente não são observáveis. Qualquer adoção exige validar a relação entre
conteúdo, conclusão e falhas.

O patch Bun de `@solidjs/web` cobre o que o runtime publicado ainda não faz, nos
runtimes padrão e de desenvolvimento: encerrar o render quando o serializador
padrão falha de forma síncrona, durante a escrita de um valor, antes do primeiro
envio. O runtime publicado já encerra quando a falha chega depois da escrita,
como na rejeição de um valor assíncrono
([solidjs/solid#4647](https://github.com/solidjs/solid/issues/4647)). Numa falha
síncrona, ele só informa o hook e conclui o render pelo fluxo normal, inclusive
chamando `onCompleteAll`. O Markdown recusaria esse resultado pela falha
registrada, mas uma falha durante a montagem do shell enviaria o HTML com
status 200. O patch retira essa exceção da condição que encerra o render. O
runtime de observação não recebe o patch porque o projeto não ativa `observe` no
`@solidjs/vite-plugin`; ativar essa opção exige incluir também
`dist/server.observe.js`. Falhas na fase de serialização chegam ao log como
`SerovalSerializationError`; a mensagem e a causa continuam descartadas. A chave
do patch inclui a versão do pacote, então cada atualização de `@solidjs/web`
exige regenerá-lo com `bun patch`. O teste
`tooling/__tests__/patched-dependencies.test.ts` falha quando a chave de um
patch não corresponde a uma versão resolvida no `bun.lock`.

O patch cobre também uma queda do processo. O `pipe` grava o shell e chama
`buffer.flush()` na linha seguinte. Com um shell de 16.384 caracteres ou mais,
essa primeira escrita já chega ao destino, que pode abandonar o render ali
mesmo: o `createSSRResponse` faz isso quando a página declarou `Location`, e o
mesmo acontece quando a escrita lança ou quando o sinal do render é abortado
dentro dela. O `abandon` troca o buffer por um objeto sem `flush`, a chamada
seguinte lança `TypeError` numa microtask que ninguém aguarda, e a rejeição sem
tratamento encerra o processo do Node. O patch dá um `flush` vazio a esse
buffer, e o render abandonado termina como já terminava com um shell menor. A
regressão fica em `renderIntegrity.redirect.node.test.ts`, e o acompanhamento em
[solidjs/solid#4745](https://github.com/solidjs/solid/issues/4745). Remova esse
trecho quando um pacote publicado passar nesse teste sem ele.

O [solidjs/solid#4193](https://github.com/solidjs/solid/issues/4193) relatou
três lacunas. O [solidjs/solid#4206](https://github.com/solidjs/solid/pull/4206)
levou as falhas do serializador ao hook global, passou a conter o `onCleanup`
que lança no descarte da conclusão normal e fez o core rodar todos os cleanups
mesmo depois de um que lança. O
[solidjs/solid#4229](https://github.com/solidjs/solid/pull/4229) fez o render
concluir na falha síncrona, e o
[solidjs/solid#4246](https://github.com/solidjs/solid/pull/4246) encerra cada
escrita no primeiro valor que falha. O #4647 encerra o render na falha
assíncrona antes do envio e rejeita no cliente a chave que falha depois dele.
Essas partes saíram do patch. O restante é acompanhado no
[solidjs/solid#4709](https://github.com/solidjs/solid/issues/4709). Remova-o
quando um pacote publicado encerrar o render também na falha síncrona e passar
as regressões de erro reutilizado entre requisições, falha de server function
que escapa de Loading, recuperação local, serialização, cleanup que lança e
cancelamento. A issue ou o PR fechado não substitui a verificação dos artefatos
instalados. O sinal composto de timeout e desconexão chega ao `renderToStream`;
o teste Node do adaptador verifica o descarte de uma raiz SSR pendente no
cancelamento.

No abandono por cancelamento, o thenable de `renderToStream` rejeita com
`signal.reason`, inclusive para consumidores registrados depois do aborto, sem
chamar `onCompleteAll`
([solidjs/solid#4646](https://github.com/solidjs/solid/issues/4646)). Antes
dessa correção, o runtime descartava a raiz e mantinha a espera pendente, e o
patch cobria a rejeição. A proteção de publicação não confunde essa rejeição com
término do backend: `protectServerOperation` registra as Promises no contexto
assíncrono da publicação, e a vaga permanece ocupada até elas assentarem.
Operações comuns, fora desse contexto, preservam o comportamento anterior.
`containFailures` reconhece essa rejeição pela identidade com `signal.reason`,
então o motivo precisa chegar sem embrulho; caso contrário, o cancelamento volta
ao log `[middleware]`. As regressões ficam em
`markdownContent.abort.node.test.ts`, `containFailures.abort.node.test.ts`,
`publicationScope.node.test.ts` e no cenário HTTP de desconexão de
`PublicationLoad`. Ao atualizar o Solid, confira também esse contrato.
