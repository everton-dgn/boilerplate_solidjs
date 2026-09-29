# Erros no servidor e chamadas de backend

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
[Vite](../vite.config.ts) o carrega por `serverFunctions.configure`, cobrindo
server functions chamadas diretamente no SSR e pelo transporte HTTP. O mesmo
módulo instala, só nos builds de produção, o hook
`configureServerErrors({ onError })` de `@solidjs/web`.

- [requestJson](../src/infra/server/requestJson/index.ts) verifica o status
  HTTP, lê o JSON de sucesso e aplica o schema de saída dentro da proteção.
- [protectServerOperation](../src/infra/server/protectServerOperation/index.ts)
  captura lançamentos e rejeições e verifica a estrutura do resultado.
- [publicErrors](../src/infra/server/publicErrors/index.ts) cria um erro novo
  com a mensagem fixa "Não foi possível concluir a solicitação.".
- [logServerFailure](../src/infra/server/logServerFailure/index.ts) é o único
  ponto de log: uma mensagem fixa por origem, sem receber o erro.
- Os módulos importam `server-only`; o plugin impede que entrem no bundle
  cliente. O alias de testes existe somente no projeto Node.

Em produção o runtime do Solid já troca todo erro lançado por
`Error("Internal Server Error")`, em SSR, streaming e HTTP, inclusive fora de
server functions. Ele não barra um `Error` devolvido como dado: esse caso,
medido nos três canais, só é recusado pela verificação estrutural do wrapper.
Por isso o `wrapInvocation` continua registrado. Um fallback genérico e HTML
escapado não removem dados do payload já enviado.

O hook `onError` é aditivo. Ele troca qualquer falha que chega ao runtime,
inclusive de render e de rejeições fora de server functions, por um
`createPublicError()` novo e registra o log fixo `[server-error]` quando o erro
não era público. Sinais de controle (`Response` sem corpo, envelopes e
`NotReadyError`) seguem a política padrão do runtime. `Response.error()` também
não tem corpo, mas o status 0 não sai como HTTP, então ela vira falha pública.
Um envelope lançado por uma query durante o SSR chega primeiro ao hook como
controle; depois o router lança o valor do envelope no render, e esse valor é
tratado como falha de render, com ou sem o hook. O retorno do hook vai ao
cliente sem nova sanitização, então ele nunca devolve o objeto recebido, nem um
erro público, que pode ter ganhado campos depois de criado. O hook é síncrono e
não lança, nem quando o log falha: uma falha dele faria o runtime registrar o
erro do hook.

Limites do hook:

- A rejeição de uma fonte assíncrona é serializada com a política padrão antes
  de qualquer hook. O mesmo corpo leva "Internal Server Error" para a fonte e a
  mensagem pública para o boundary.
- Em desenvolvimento o hook não é instalado, para que o runtime mostre o erro
  original.
- Valores primitivos lançados não têm veredito por objeto; o hook roda e
  registra o log a cada vez que o runtime os encontra.

Exceções de middleware não passam pelo hook nem pelo wrapper. Sem tratamento, o
host responde com um corpo genérico, mas registra a mensagem, o `cause`, as
propriedades e a stack do erro original. Por isso o export padrão de
[`src/middleware/index.ts`](../src/middleware/index.ts) é `createMiddleware()`,
que devolve `containFailures(requestMiddleware)`: ele compõe a cadeia inteira
dentro de si, e uma exceção nos middlewares, nas rotas de API ou no handler de
páginas vira 500 com os headers de segurança, o `server-timing` e o log fixo
`[middleware]`. Só uma `Response` sem corpo e com status diferente de 0 passa
como controle, e sai com os mesmos headers; uma `Response` com corpo lançada
vira 500, porque pode carregar dados upstream. O middleware, o hook e o wrapper
usam a mesma classificação,
[`isControlResponse`](../src/infra/server/isControlResponse/index.ts). Os
headers de um `Response.redirect()` devolvido são imutáveis, então vão numa
cópia sem corpo; o retorno cru de `fetch()`, com headers imutáveis e corpo
upstream, não é copiado e vira 500. O `server-timing` acrescenta a métrica `app`
às que o runtime já gravou, como a do traceparent. Em desenvolvimento o erro
original segue para o Vite. O build E2E monta a entrada com a mesma fábrica e
passa as falhas injetadas em `createMiddleware(extra)`, que as põe antes da
cadeia e dentro da mesma contenção. Como o E2E não chama o export padrão, um
teste unitário exige que ele contenha falhas, e a suíte `test:e2e:production`
confere os headers do middleware na entrada real.

Numa navegação (`GET` ou `HEAD` com `accept` de HTML), o 500 mostra a página de
erro do app: `containFailures` grava um `createPublicError()` em
`locals.serverFailure` e chama o render da página. O `ServerFailureGate` de
[`App.tsx`](../src/App.tsx) lança esse erro antes do Router, o `Errored` raiz
mostra o `ErrorFallback` e o cliente hidrata o fallback pelo erro serializado.
Como o erro já é público, o hook não registra outro log. O status é forçado para
500 na resposta.

O render recebido pelo middleware é o dispatcher do plugin, que atende o
endpoint de server functions (`/_server`) antes da página. Por isso esse
endpoint e as rotas de API reconhecidas pelo `createAPIMatcher` do
`filesystem-routing` nunca recebem a página de erro, mesmo com `accept` de HTML:
chamar o render ali executaria a função sem os middlewares que falharam. Esses
caminhos e os outros métodos recebem a mensagem pública em texto. O plugin
aceita um único render por requisição: se a cadeia falhar depois de já ter
renderizado a página, a resposta também é o 500 em texto. Se o render de erro
falhar, a resposta é o 500 em texto e o log ganha a linha fixa `[error-page]`. O
endpoint fica numa constante do middleware; ao configurar
`serverFunctions.endpoint` no Vite, atualize os dois.

A contenção só alcança a janela da cadeia de middleware. A criação do evento, o
commit da resposta e falhas do corpo depois que a `Response` sai ficam fora
dela. O comportamento foi medido no preview do Nitro; o runtime da Vercel não
foi medido localmente.

## Como adicionar uma chamada

Use `requestJson` dentro de uma server function, com um schema que selecione os
campos públicos. A
[fixture readBackend](../src/tests/fixtures/e2e/backend-error/readBackend/index.ts)
é a chamada de referência e, como as demais fixtures que usam o transporte, só
entra no build E2E:

```ts
import * as v from 'valibot'

import { requestJson } from '@/infra/server/requestJson/index.ts'

type BackendData = { message: string }

export async function readBackend(id: string): Promise<BackendData> {
  'use server'
  return requestJson({
    url: `http://127.0.0.1:4318/data?id=${encodeURIComponent(id)}`,
    schema: v.object({ message: v.string() })
  })
}
```

O endereço é do backend de testes. Na integração real, resolva o endereço no
servidor e defina a saída pública. `v.object` remove campos extras; schemas
permissivos não substituem essa seleção. O status HTTP 500 não rejeita o
`fetch`: `requestJson` verifica `response.ok` e cancela o corpo de falha sem
lê-lo. Rede, JSON inválido e falha de schema também são protegidos. O transporte
aplica um timeout de 10 s (combinado com `init.signal`, quando informado) e
recusa corpos acima de 1 MB, cancelando o stream antes de lê-lo inteiro.

Para SDK ou banco, crie um adapter em `infra/server` com `server-only` e envolva
a operação inteira em `protectServerOperation({ run })`, incluindo leitura,
validação e montagem da saída. Acrescente o pacote às restrições de import do
lint, com exceção apenas para o adapter e teste da proteção.

As fontes do sitemap (`route.info.sitemap`) seguem a mesma regra: a função
declarada na rota chama uma server function, que faz a leitura protegida e
devolve só `path` e `lastmod`. A rota do sitemap responde 503 sem corpo a
qualquer falha; ela não registra o erro original.

Nunca copie `error.message`, `cause`, propriedades, corpo upstream ou issues do
validador para a saída. Para uma falha pública, use `createPublicError()`.
Somente `publicErrors` pode usar `markSafeError`, que autoriza a serialização do
erro inteiro. O wrapper sempre cria outro erro, mesmo se o anterior era público,
para descartar campos adicionados depois. Novas mensagens de domínio exigem
extensão explícita desse contrato e testes.

O resultado admite valores simples, arrays comuns e objetos planos resolvidos.
Arrays precisam ter `Array.prototype` como protótipo direto; subclasses são
recusadas antes que a serialização herdada possa alterar a saída verificada.
`Error`, classes, ciclos, getters, setters e promises aninhadas também são
recusados, inclusive sob chaves `Symbol` e em propriedades não enumeráveis.
Referências compartilhadas (grafo acíclico) são aceitas e verificadas uma única
vez. Uma promise principal é aguardada e funções síncronas continuam síncronas.
Essa verificação estrutural não identifica dados confidenciais em strings: o
schema e o mapeamento continuam responsáveis pelos campos de negócio.

`allowControl: true` pertence apenas ao registro global. Preserva suspensão,
respostas sem corpo (exceto a de `Response.error()`, com status 0) e envelopes
com dados verificados; o corpo do envelope é reconstruído desses dados. Headers
e destinos devem ser definidos pela aplicação. Adapters não habilitam essa opção
nem encaminham respostas upstream. Os logs atuais contêm só uma mensagem fixa
por origem, emitida por `logServerFailure`, sem erro original ou contexto da
requisição. Diagnóstico detalhado e telemetria exigem uma integração própria.

## O que o lint cobre

[backendPolicy](../tooling/backendPolicy/index.ts) configura as regras nativas
`no-restricted-globals`, `no-restricted-properties`, `no-restricted-imports` e
`no-console` do Oxlint em `src`, incluindo fixtures, nas extensões `.ts`,
`.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` e `.cjs`:

- Restringe `fetch` ao transporte e barra acesso direto a `XMLHttpRequest`,
  `WebSocket` e `EventSource`, inclusive propriedades globais estáticas.
- Restringe os transportes conhecidos do Node e `undici`.
- Reserva `markSafeError` e `SAFE_ERROR` a `publicErrors` e o módulo inteiro de
  configuração/dispatch de server functions (`@solidjs/web/server-functions` e
  `@solidjs/web/server-functions/server`) a `configureServerErrors`. O import de
  `configureServerErrors` pela raiz `@solidjs/web` também fica restrito a esse
  módulo, inclusive em `publicErrors`: cada chamada substitui o hook global de
  erros do servidor.
- Reserva o objeto global `console` a `logServerFailure`, inclusive aliases e
  desestruturação direta. Nesse arquivo, use somente `console.error`
  diretamente; acessos por `globalThis.console`, `window.console`,
  `self.console` e `global.console` continuam proibidos. Os testes exigem um
  único argumento fixo por origem, sem o objeto original. Aliases de `console` e
  outros loggers exigem revisão.

Os testes de regressão exigem que `no-restricted-imports` também recuse
`import("pacote")` quando o pacote inteiro está restrito. A política não depende
de restrições por `importNames` para esse carregamento. Por isso,
[backend/static-solid-imports](../tooling/backendPolicy/plugin.ts) exige imports
estáticos de `@solidjs/web` e seus subcaminhos, inclusive em `publicErrors` e
`configureServerErrors`. A regra verifica strings e templates sem interpolação;
as APIs públicas desse pacote continuam disponíveis por import estático.

Imports nomeados com alias, reexports e acessos diretos por namespace também são
verificados. Bibliotecas visuais, métodos locais chamados `fetch` e parâmetros
locais com esse nome são permitidos. Testes e declarações de tipos ficam fora
dessas restrições de backend. As exceções dos adapters usam caminhos exatos;
copiar um módulo privilegiado para outra extensão não concede a mesma permissão.

O lint não faz análise completa de fluxo: aliases do objeto global, como
`const g = globalThis`, fontes de import calculadas, templates de pacotes fora
de `@solidjs/web`, SDKs desconhecidos e marcação manual por `Symbol.for` exigem
revisão. Ele também não restringe `allowControl` pelo nome nem verifica o
conteúdo dos argumentos de log em `logServerFailure`. Não use essas lacunas nem
um disable para contornar o contrato. O padrão de imports relativos é
compartilhado com `tooling/lint.ts` pela constante
`RELATIVE_IMPORT_RESTRICTION`.

## Validação e recuperação

O [E2E de backend](../src/tests/pages/BackendError/BackendError.e2e.test.ts)
executa 23 casos no build de produção: cinco cenários (HTTP 500, exceção após
leitura, `Error` dentro do resultado, erro público e sucesso) em SSR inicial,
streaming e chamada HTTP; quatro recargas, incluindo SSR sem JavaScript; um
teste de isolamento do bundle; e três sinais de controle em server functions
chamadas no SSR: um `redirect()` lançado, um envelope devolvido e um envelope
lançado. O envelope lançado chega ao hook como controle, mas o router lança o
valor dele no render e o documento vira 500, com ou sem o hook.

[Bug do `@solidjs/router` (#633)](https://github.com/solidjs/solid-router/issues/633):
quando uma `query()` lida no SSR devolve ou lança um envelope de `respond()`, o
`handleResponse` copia os headers do envelope para a resposta da página, e o
documento HTML sai com `content-type: application/json`. As cópias feitas depois
do envio do início da resposta são descartadas com o aviso
`[LATE_HEADER_WRITE]`. Até a correção, não leia um envelope de `respond()` por
`query()` durante o SSR; use `respond()` em actions e chamadas HTTP. O E2E marca
esse comportamento com `test.fail()`: quando o router corrigir, o teste passa a
falhar e o marcador deve sair.

O
[E2E de erros fora de server functions](../src/tests/pages/OutsideError/OutsideError.e2e.test.ts)
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
série e exigem uma linha nova de log fixo por requisição.

O `webServer` do Playwright grava a saída do preview em
`test-results/server-<modo>.log`. O
[teardown global](../tooling/testing/server-log-teardown.ts) confere que o
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

Os testes toleram em `pageerror` só a mensagem pública fixa e, nos casos que
passam por uma fonte assíncrona ou por streaming, a mensagem genérica do
runtime; cada caso declara as mensagens admitidas, que dependem da ordem entre a
hidratação e a chegada do fragmento rejeitado. O status do streaming pode
permanecer 200 após o envio inicial; os testes conferem confidencialidade
independentemente dele. Fontes adiadas aninhadas e trabalho assíncrono fora do
retorno aguardado exigem integração e testes próprios.

O link global "Recarregar página" preserva a URL e funciona sem JavaScript.
Ações iniciadas depois do carregamento precisam ser repetidas. Para retry local
com query, invalide a chave antes de `reset()`:
`revalidate(getData.key); reset()`. Confirme uma nova chamada ao backend.

Após alterar essa fronteira, execute:

```bash
pnpm test:tooling
pnpm test:unit
pnpm test:e2e src/tests/pages/BackendError src/tests/pages/OutsideError
pnpm typecheck
pnpm check:ci
```

O [CI](../.github/workflows/ci.yml) executa `test:tooling` e a suíte E2E
completa; `pnpm validate` e o `pre-push` rodam `test:tooling` localmente, o que
inclui as duas políticas. Os testes da política verificam as regras no parser
real e seu registro no lint completo, com casos recusados e permitidos para cada
exceção. Consulte os resultados de cada execução nos logs da validação local e
do CI.

## Atualizar o Solid

Consulte as dependências declaradas no [package.json](../package.json), o
catálogo do [pnpm-workspace.yaml](../pnpm-workspace.yaml) e a resolução no
[pnpm-lock.yaml](../pnpm-lock.yaml). `vp toolchain` mostra as ferramentas da
instalação ativa. Esses arquivos e o comando substituem uma lista de versões
mantida neste guia.

A proteção atual parte da avaliação da versão do Solid resolvida no lockfile
quando o wrapper foi revisado, que já contém a
[sanitização SSR (#3477)](https://github.com/solidjs/solid/pull/3477), o
[hook central (#3481)](https://github.com/solidjs/solid/pull/3481) e a
[consolidação de onError (#3484)](https://github.com/solidjs/solid/pull/3484).
Nessa avaliação o runtime trocava erros lançados pela mensagem genérica, mas não
recusava um `Error` devolvido como dado; por isso o `wrapInvocation` fica e o
hook é aditivo. Uma issue fechada ou um commit integrado não comprova que o
pacote publicado e instalado mudou esse comportamento.

1. Confira releases, exports e contrato dos pacotes publicados. Atualize
   `solid-js` e `@solidjs/web` juntos, verificando Router, plugin e lockfile.
   Preserve as versões anteriores para reversão; não antecipe APIs internas.
2. Confira se o contrato do hook `configureServerErrors({ onError })` que o
   registro central usa continua igual: chamada síncrona, retorno enviado sem
   nova sanitização, veredito por objeto e substituição do hook anterior. Um
   `onError` por requisição (opção de `renderToStream` ou de
   `handleServerFunctionRequest`) tem precedência sobre o hook global e o
   substituiria sem aviso: confira se o plugin continua sem repassá-lo e se o
   módulo `configure` ainda carrega antes do primeiro dispatch.
3. Rode
   `pnpm test:e2e src/tests/pages/BackendError src/tests/pages/OutsideError` no
   build de produção. Os marcadores nos corpos brutos, os controles positivos e
   o teardown do log são a regressão da fronteira. Se o runtime mudar as
   mensagens que chegam ao navegador, meça antes de ajustar as tolerâncias de
   `pageerror`, inclusive com CPU limitada a 20x.
4. Reavalie o wrapper só se as notas da versão ou o código publicado indicarem
   que o runtime passou a recusar um `Error` devolvido como dado. Numa
   reprodução isolada, troque o `wrapInvocation` por um passthrough e confira o
   cenário `result` nos três canais pelos marcadores nos corpos brutos, sem
   confiar em teste verde. Verifique os artefatos de produção resolvidos;
   `NODE_ENV` sozinho não basta.
5. Retire somente a interceptação que o runtime passou a cobrir. Preserve o
   transporte, o contrato de dados públicos, o hook, a contenção do middleware e
   seus testes. Registre comandos, resultados e limites na validação da
   atualização. Na reversão, restaure dependências e proteção juntas.

O acompanhamento ocorre nas atualizações de dependências; não há monitor
automático configurado.
