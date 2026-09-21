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
server functions chamadas diretamente no SSR e pelo transporte HTTP.

- [requestJson](../src/infra/server/requestJson/index.ts) verifica o status
  HTTP, lê o JSON de sucesso e aplica o schema de saída dentro da proteção.
- [protectServerOperation](../src/infra/server/protectServerOperation/index.ts)
  captura lançamentos e rejeições e verifica a estrutura do resultado.
- [publicErrors](../src/infra/server/publicErrors/index.ts) cria um erro novo
  com a mensagem fixa "Não foi possível concluir a solicitação.".
- Os módulos importam `server-only`; o plugin impede que entrem no bundle
  cliente. O alias de testes existe somente no projeto Node.

A proteção central é temporária e cobre a execução direta durante SSR, que não
passa pela sanitização do dispatch HTTP. Sua retirada exige a validação do
runtime publicado descrita neste guia. Um fallback genérico e HTML escapado não
removem dados do payload já enviado. Exceções de componentes, middleware e
tarefas fora de server functions não recebem proteção geral do renderer por esse
registro.

## Como adicionar uma chamada

Use `requestJson` dentro de uma server function, com um schema que selecione os
campos públicos. A
[fixture readBackend](../src/tests/fixtures/e2e/backend-error/readBackend/index.ts)
é a única chamada atual e só entra no build E2E:

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
respostas sem corpo e envelopes com dados verificados; o corpo do envelope é
reconstruído desses dados. Headers e destinos devem ser definidos pela
aplicação. Adapters não habilitam essa opção nem encaminham respostas upstream.
Os logs atuais contêm só uma mensagem fixa, sem erro original ou contexto da
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
  `@solidjs/web/server-functions/server`) a `configureServerErrors`.
- Reserva o objeto global `console` ao wrapper `protectServerOperation`,
  inclusive aliases e desestruturação direta. Nesse arquivo, use somente
  `console.error` diretamente; acessos por `globalThis.console`,
  `window.console`, `self.console` e `global.console` continuam proibidos. Os
  testes do wrapper exigem um único argumento fixo nas falhas inesperadas, sem o
  objeto original. Aliases de `console` dentro do wrapper e outros loggers
  exigem revisão.

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
conteúdo dos argumentos de log no wrapper. Não use essas lacunas nem um disable
para contornar o contrato. O padrão de imports relativos é compartilhado com
`tooling/lint.ts` pela constante `RELATIVE_IMPORT_RESTRICTION`.

## Validação e recuperação

O [E2E de backend](../src/tests/pages/BackendError/BackendError.e2e.test.ts)
executa 20 casos no build de produção: cinco cenários (HTTP 500, exceção após
leitura, `Error` dentro do resultado, erro público e sucesso) em SSR inicial,
streaming e chamada HTTP; quatro recargas, incluindo SSR sem JavaScript; e um
teste de isolamento do bundle.

Os marcadores sintéticos nascem no backend após o build. Os testes verificam o
corpo completo, headers, DOM e erros do navegador. O teste de assets procura
código e endereço exclusivos do servidor. Os testes Node cobrem HTML 500, JSON
inválido, schema inválido, falha de rede e cancelamento do corpo, além dos
contratos do wrapper.

A captura HTTP usa `route.fetch()` e entrega a resposta ao browser com
`route.fulfill()`, pois o decoder cancela o stream ao receber a exceção. Essa
captura aguarda o corpo completo e não mede cancelamento ou latência. O
streaming do documento SSR não é interceptado.

Os testes toleram somente a mensagem pública fixa em `pageerror` ao hidratar. O
status do streaming pode permanecer 200 após o envio inicial; os testes conferem
confidencialidade independentemente dele. Fontes adiadas aninhadas e trabalho
assíncrono fora do retorno aguardado exigem integração e testes próprios.

O link global "Recarregar página" preserva a URL e funciona sem JavaScript.
Ações iniciadas depois do carregamento precisam ser repetidas. Para retry local
com query, invalide a chave antes de `reset()`:
`revalidate(getData.key); reset()`. Confirme uma nova chamada ao backend.

Após alterar essa fronteira, execute:

```bash
pnpm test:tooling
pnpm test:unit
pnpm test:e2e src/tests/pages/BackendError
pnpm typecheck
pnpm check:ci
```

O [CI](../.github/workflows/ci.yml) executa `test:tooling` e a suíte E2E
completa; `pnpm validate` e o `pre-push` rodam `test:tooling` localmente, o que
inclui as duas políticas. Os testes da política verificam as regras no parser
real e seu registro no lint completo, com casos recusados e permitidos para cada
exceção. Consulte os resultados de cada execução nos logs da validação local e
do CI.

## Atualizar o Solid e retirar o wrapper

Consulte as dependências declaradas no [package.json](../package.json), o
catálogo do [pnpm-workspace.yaml](../pnpm-workspace.yaml) e a resolução no
[pnpm-lock.yaml](../pnpm-lock.yaml). `vp toolchain` mostra as ferramentas da
instalação ativa. Esses arquivos e o comando substituem uma lista de versões
mantida neste guia.

Acompanhe as mudanças técnicas de
[sanitização SSR (#3477)](https://github.com/solidjs/solid/pull/3477),
[hook central (#3481)](https://github.com/solidjs/solid/pull/3481) e
[consolidação de onError (#3484)](https://github.com/solidjs/solid/pull/3484).
Elas orientam a próxima avaliação; sua integração não prova que um pacote
publicado e instalado contém a solução.

1. Confira releases, exports e contrato dos pacotes publicados. Atualize
   `solid-js` e `@solidjs/web` juntos, verificando Router, plugin e lockfile.
   Preserve as versões anteriores para reversão; não antecipe APIs internas.
2. Avalie o hook nativo `configureServerErrors({ onError })`, de `@solidjs/web`,
   e a integração do plugin. Confira o nome publicado por requisição: a proposta
   convergiu para `onError`. Um retorno explícito pode ser tratado como público
   sem nova sanitização. Nunca devolva o erro original; confira sincronismo e
   precedência.
3. Em uma reprodução isolada, teste a sanitização nativa sem o wrapper local,
   usando os três canais e falhas de render/rejeições fora de server functions.
   Verifique os artefatos de produção resolvidos; `NODE_ENV` sozinho não basta.
4. Confira payload, conclusão do streaming e hidratação separadamente. Antes de
   retirar a tolerância de `pageerror`, reproduza com CPU limitada a 20x. Um
   `Error` retornado como dado continua exigindo tratamento da aplicação.
5. Retire somente a interceptação que o runtime passou a cobrir. Preserve o
   transporte, o contrato de dados públicos e seus testes. Registre comandos,
   resultados e limites na validação da atualização. Mantenha as versões nos
   arquivos de dependências; na reversão, restaure dependências e proteção
   juntas.

O acompanhamento ocorre nas atualizações de dependências; não há monitor
automático configurado.
