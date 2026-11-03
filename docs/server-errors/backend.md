# Chamadas de backend e consumo nas páginas

[Voltar ao guia principal](../server-errors.md)

## Como adicionar uma chamada

Use `requestJson` dentro de uma server function, com um schema que selecione os
campos públicos. O bloco abaixo é a forma simplificada da
[fixture readBackend](../../src/tests/fixtures/e2e/backend-error/readBackend/index.ts),
a chamada de referência; a fixture acrescenta os cenários de falha que o E2E
provoca e, como as demais fixtures que usam o transporte, só entra no build E2E:

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
devolve só `path` e `lastmod`. A fonte recebe um `AbortSignal` que aborta no
prazo de 10 s, na desconexão do cliente e ao fim da leitura das fontes;
repasse-o à leitura (por exemplo, em `init.signal` do `requestJson`) para
cancelá-la. A rota do sitemap responde 503 sem corpo a qualquer falha e registra
pela origem `sitemap` a linha fixa
`[sitemap] Unexpected failure; private details omitted`, com a classe e os
frames descritos em [Log de falhas](logging.md#log-de-falhas), sem a mensagem do
erro.

Fontes particionadas ficam no registro `src/infra/server/sitemapSources/`, fora
de `route.info` e do bundle do cliente. Seus callbacks também usam os adapters
protegidos para banco e SDK e repassam o sinal à consulta. O índice lista IDs
públicos, e a leitura de uma parte retorna somente seu lote de `path` e
`lastmod`. Falhas continuam usando a resposta vazia 503 e o mesmo log fixo. Uma
parte removida ou vazia responde 404 com `no-store`; a diferença entre o índice
anterior e essa leitura faz parte da consistência eventual descrita no
[guia de SEO](../seo/sitemap.md#fontes-particionadas).

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
nem encaminham respostas upstream. Os logs, emitidos por `logServerFailure`,
contêm a mensagem fixa da origem e, para um `Error`, só a classe e os frames
descritos em [Log de falhas](logging.md#log-de-falhas), sem mensagem, `cause`,
propriedades ou contexto da requisição. Diagnóstico detalhado e telemetria
exigem uma integração própria.

## O que o lint cobre

[backendPolicy](../../tooling/backendPolicy/index.ts) configura as regras
nativas `no-restricted-globals`, `no-restricted-properties`,
`no-restricted-imports` e `no-console` do Oxlint em `src`, incluindo fixtures,
nas extensões `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` e `.cjs`:

- Restringe `fetch` ao transporte e barra acesso direto a `XMLHttpRequest`,
  `WebSocket` e `EventSource`, inclusive propriedades globais estáticas.
- Restringe os transportes conhecidos do Node e `undici`.
- Reserva `markSafeError` e `SAFE_ERROR` a `publicErrors` e o módulo inteiro de
  configuração/dispatch de server functions (`@solidjs/web/server-functions` e
  `@solidjs/web/server-functions/server`) a `configureServerErrors`. O import de
  `configureServerErrors` pela raiz `@solidjs/web` também fica restrito a esse
  módulo, inclusive em `publicErrors`: cada chamada substitui o hook global de
  erros do servidor.
- Reserva `observeRenderFailures`, de
  [renderIntegrity](../../src/infra/server/renderIntegrity/index.ts), a
  `configureServerErrors`, inclusive por alias, namespace e reexport: depois
  dessa chamada o estado do render nasce sem erros, e só o registro instala o
  hook que o marca.
- Reserva o objeto global `console` a `logServerFailure`, inclusive aliases e
  desestruturação direta. Nesse arquivo, use somente `console.error`
  diretamente; acessos por `globalThis.console`, `window.console`,
  `self.console` e `global.console` continuam proibidos. Os testes exigem um
  único argumento, uma string que começa pela mensagem fixa da origem e não traz
  mensagem, `cause` nem propriedades do erro. Aliases de `console` e outros
  loggers exigem revisão.

Os testes de regressão exigem que `no-restricted-imports` também recuse
`import("pacote")` quando o pacote inteiro está restrito. A política não depende
de restrições por `importNames` para esse carregamento. Por isso,
[backend/static-solid-imports](../../tooling/backendPolicy/plugin.ts) exige
imports estáticos de `@solidjs/web` e seus subcaminhos, inclusive em
`publicErrors` e `configureServerErrors`;
`backend/static-render-integrity-imports` faz o mesmo com `renderIntegrity`,
porque a restrição por nome não alcança `import()`. A regra verifica strings e
templates sem interpolação; as APIs públicas desse pacote continuam disponíveis
por import estático.

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
compartilhado com `tooling/lint/rules/javascript.ts` pela constante
`RELATIVE_IMPORT_RESTRICTION`, em `tooling/backendPolicy/constants.ts`.

## Consumo em páginas

Depois de proteger a server function, use `query` para o cache de dados e leia
seu resultado no componente. Com a função `readBackend` do exemplo acima:

```tsx
const getBackend = query(readBackend, 'backend')

export default function Page() {
  const data = createMemo(() => getBackend('example'))
  return <h1>{data().message}</h1>
}
```

No Solid instalado, renders aguardados e concorrentes que compartilham a
primeira carga de uma rota `lazy()` leem o valor assíncrono de outro render
([solidjs/solid#4595](https://github.com/solidjs/solid/issues/4595)). O Markdown
usa render aguardado, no prerender e no modo `'dynamic'`, e as rotas de arquivo
são `lazy()`; o HTML em streaming não é afetado. Enquanto o pacote publicado não
trouxer a correção
([solidjs/solid#4601](https://github.com/solidjs/solid/pull/4601)), não publique
em Markdown páginas cujas leituras assíncronas dependam da requisição, como
parâmetros, idioma, usuário ou sessão. A issue mostra que um `<Loading>` acima
da leitura também evita o problema, mas ele muda o HTML inicial do streaming.

Importe `query` de `@solidjs/router` e `createMemo` de `solid-js`. O `Errored`
global do `App` substitui a aplicação e o cabeçalho pelo fallback quando essa
leitura falha. A recuperação por recarga está descrita em
[validação e recuperação](recovery.md#validação-e-recuperação).
