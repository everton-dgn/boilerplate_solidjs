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
sem um hook local. A primeira falha marca `hasErrors`, passa pela política de
`configureServerErrors` e encerra o render sem chamar `onCompleteAll`. Falhas
síncronas também seguem esse caminho, sem relançar a exceção para o chamador. O
descarte libera o owner e as fontes assíncronas pendentes.

Esse encerramento também vale para HTML em streaming. Uma falha ocorrida
enquanto o shell é montado impede que ele seja enviado, e a resposta é um 500.
Depois do shell, os bytes já enviados não podem ser recolhidos; a conexão
termina com o conteúdo que já saiu. Markdown aguarda o render e recusa a
publicação com erro público 500 e `cache-control: private, no-store`. Uma falha
de serialização não depende do timeout do adaptador para encerrar a resposta.

Serializadores personalizados mantêm o comportamento do runtime: as falhas que
eles informam chegam ao hook, mas não encerram o render. Erros suprimidos
internamente não são observáveis. Qualquer adoção exige validar a relação entre
conteúdo, conclusão e falhas.

O patch Bun de `@solidjs/web` cobre o que o runtime publicado ainda não faz, nos
runtimes padrão e de desenvolvimento: encerrar o render na falha do serializador
padrão, como descrito acima. O runtime de observação não recebe o patch porque o
projeto não ativa `observe` no `@solidjs/vite-plugin`; ativar essa opção exige
incluir de novo `dist/server.observe.js` no patch. Sem o patch, o runtime
informa a falha ao hook e conclui o render pelo fluxo normal, inclusive chamando
`onCompleteAll`. O Markdown recusa esse resultado pela falha registrada, mas uma
falha durante a montagem do shell ainda envia o HTML com status 200. O patch
bloqueia essa saída e a conclusão normal antes de descartar o render. Com um
`onError` local, o patch também encerra o render, enquanto o runtime só
informaria o callback e concluiria normalmente. Falhas na fase de serialização
chegam ao log como `SerovalSerializationError`; a mensagem e a causa continuam
descartadas. A chave do patch inclui a versão do pacote, então cada atualização
de `@solidjs/web` exige regenerá-lo com `bun patch`. O teste
`tooling/__tests__/patched-dependencies.test.ts` falha quando a chave de um
patch não corresponde a uma versão resolvida no `bun.lock`.

O [solidjs/solid#4193](https://github.com/solidjs/solid/issues/4193) relatou
três lacunas. O [solidjs/solid#4206](https://github.com/solidjs/solid/pull/4206)
levou as falhas do serializador ao hook global, passou a conter o `onCleanup`
que lança no descarte da conclusão normal e fez o core rodar todos os cleanups
mesmo depois de um que lança; essas partes saíram do patch. O render pendente na
falha síncrona foi relatado no
[solidjs/solid#4227](https://github.com/solidjs/solid/issues/4227), com a
correção no [solidjs/solid#4229](https://github.com/solidjs/solid/pull/4229), já
incluída no pacote instalado: ela faz o render concluir, mas não o encerra na
falha. O serializador também passou a encerrar cada escrita no primeiro valor
que falha, sem enviar os irmãos seguintes dessa escrita, e os valores pendentes
antes do shell saem cada um na própria escrita
([solidjs/solid#4246](https://github.com/solidjs/solid/pull/4246)): sem o patch,
a falha deixa pendente só a chave que falhou. Essa chave que nunca assenta no
cliente, com o render concluído, está em
[solidjs/solid#4647](https://github.com/solidjs/solid/issues/4647). Remova o
restante do patch quando um pacote publicado encerrar o render na falha do
serializador padrão e passar as regressões de erro reutilizado entre
requisições, falha de server function que escapa de Loading, recuperação local,
serialização, cleanup que lança e cancelamento. A issue ou o PR fechado não
substitui a verificação dos artefatos instalados. O sinal composto de timeout e
desconexão chega ao `renderToStream`; o teste Node do adaptador verifica o
descarte de uma raiz SSR pendente no cancelamento.

O patch também faz o thenable de `renderToStream` rejeitar no abandono por
cancelamento. O runtime instalado descartava a raiz, mas mantinha essa espera
pendente, inclusive após o backend terminar
([solidjs/solid#4646](https://github.com/solidjs/solid/issues/4646)). A correção
cobre consumidores registrados antes e depois do aborto, sem chamar
`onCompleteAll` nem alterar os consumidores de streaming. A proteção de
publicação não confunde essa rejeição com término do backend:
`protectServerOperation` registra as Promises no contexto assíncrono da
publicação, e a vaga permanece ocupada até elas assentarem. Operações comuns,
fora desse contexto, preservam o comportamento anterior. `containFailures`
reconhece essa rejeição pela identidade com `signal.reason`, então o motivo
precisa chegar sem embrulho; caso contrário, o cancelamento volta ao log
`[middleware]`. As regressões ficam em `markdownContent.abort.node.test.ts`,
`containFailures.abort.node.test.ts`, `publicationScope.node.test.ts` e no
cenário HTTP de desconexão de `PublicationLoad`. Ao atualizar o Solid, confira
também esse contrato antes de remover o patch.
