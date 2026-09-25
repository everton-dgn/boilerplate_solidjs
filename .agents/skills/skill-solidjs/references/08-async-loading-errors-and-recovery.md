# Async, Loading, erros e recuperação

Contratos do runtime instalado, Solid 2 RC.9. Os limites indicados não são garantias de outros ambientes.

## Fontes assíncronas e dependências

Contrato: `createMemo` pode retornar Promise e seu accessor representa o dado resolvido. Leia em JSX, memo ou compute de effect; capture entradas reativas antes do primeiro `await`. Leituras posteriores não assinam dependências e só veem mudanças quando outra entrada rastreada reinicia a computação. Memos independentes sob root ativo iniciam mesmo sem consumidor, no grafo cliente. Suspender uma leitura pode impedir as próximas expressões do consumidor, mas não impede fontes já criadas de iniciar. `await` sequencial adia a próxima chamada; uma dependência real exige essa espera. `Promise.all` publica o conjunto só quando todas resolvem; exibição independente pede fontes e boundaries separadas.

Receita:
```ts
const user = createMemo(() => api.read(id()))
const combined = createMemo(() => {
  const key = id()
  return Promise.all([api.read(key), api.orders(key)])
})
```

Armadilha: fetch em cada JSX ou effect imitando `createResource` multiplica trabalho. Ler fonte ainda não resolvida depois de `await` gera, em desenvolvimento, erro de leitura assíncrona após espera (trecho literal: ``Read of an unresolved async source after an `await` ``): vai ao braço `error` do effect ou à boundary; render effect sem boundary causa `REACTIVITY_HALTED`, e `createEffect` sem braço de erro apenas registra no console. No build padrão, o dependente trava silenciosamente com `isPending` falso. Não interprete isso como sucesso.

## Loading e leitura que lança

Contrato: `Loading` contém prontidão inicial; uma boundary inicializada pode preservar conteúdo confirmado na atualização. Keying ou troca de owner pode criar uma nova boundary. `Errored` precisa envolver o leitor do memo que lança desde o início. Memo criado acima de `Show`/`Switch` recompõe no flush antes da troca de ramo por status: sem boundary, o flush lança, a tela antiga permanece e todas as raízes param com `REACTIVITY_HALTED`. Memo criado dentro do ramo é descartado com ele; função comum que lança no JSX pode ser descartada pelo condicional antes de executar, mas também causa halt sem proteção.

Receita:
```tsx
<Errored fallback={(_error, reset) => (
  <section>
    <p>Indisponível</p>
    <button type="button" onClick={() => { model.retry(); reset() }}>Tentar novamente</button>
  </section>
)}>
  <Loading fallback={<p>Carregando</p>}>
    <output>{model.read()}</output>
  </Loading>
</Errored>
```

Armadilha: o fallback recebe accessor de erro, não mensagem pública pronta. Com accessor recebido pelo fallback, o erro contido não registra no console e outras raízes continuam. Não releia a fonte quebrada para explicar a falha. `Errored` não contém toda rejeição de evento/action: trate a Promise explicitamente. `ASYNC_OUTSIDE_LOADING_BOUNDARY` costuma ser warning no cliente, com montagem raiz vazia e adiada até assentar; no servidor, fonte `ssrSource: "client"` fora de `Loading` lança `Error` com essa mensagem, e dentro usa `NotReadyError(CLIENT_HOLE)` para preservar o stream. Prefira boundary a enforcement estrito por padrão.

## Entrada confirmada, latest e isPending

Contrato: render effect que lê fonte async dependente de `id` retém a própria escrita até o dado chegar. No handler, `id()` dá a entrada confirmada, `latest(id)` a entrada em voo e `isPending(() => data())` indica espera. Na sequência 1, 2, 3, com resposta de 3 antes da de 2, publica 1 e depois 3; 2 tardia não publica. Com apenas `createEffect` lendo, `id()` já muda e só o leitor espera. Ambos os builds coincidem.

Receita:
```ts
const pending = () => isPending(() => user()) || isPending(() => orders())
```

Armadilha: `isPending(() => id())` não observa o trabalho dependente; `isPending(() => users() || orders())` omite o segundo ramo por short-circuit. Mesmo sem short-circuit, uma leitura que lança NotReady pode impedir a seguinte: use consultas separadas, fonte agregada ou boundaries próprias. `latest` escolhe a view disponível, não espera rede nem inventa dado inicial: antes do primeiro resultado lança `NotReadyError`. Não use como catch de pendência, filtro universal de recarga ou prova de edição não confirmada.

## Refresh e pontes imperativas

Contrato: `refresh(source)` invalida accessor Solid ou store derivada refreshable mesmo sem mudança de entrada. A Promise acompanha o próximo estado assentado, inclusive trabalho substituto; accessor resolve valor, store resolve o nó passado. Nó da mesma família derivada reinicia a fonte inteira, sem refetch parcial implícito. Valor igual também resolve sem notificar leitores comuns. Refresh isolado não ativa pending; `affects(source)` marca impacto, ou modele estado de operação. Se ainda aguarda ao falhar, a Promise rejeita; o runtime permite ignorá-la no uso fire-and-forget, sem estender essa proteção a outras Promises.

Receita:
```ts
const data = await resolve(() => source())
await refresh(source)
```

Armadilha: `refresh(() => source())` e propriedade arbitrária não são alvos. A espera não identifica uma chamada HTTP específica. `resolve` retorna Promise de leitura assentada e não deve nascer em computação rastreada. `until(predicate, options?)` espera verdade e aceita timeout/cancelamento; trate rejeição e confira verdade autoritativa dentro da action. `untrack` só desliga assinatura: leitura sem valor continua lançando `NotReadyError`, volta a funcionar ao assentar e não existe overload `untrack(fn, fallback)`.

## Valores provisórios

Contrato: `loadingValue` publica provisório antes do primeiro resultado, sem suspensão inicial normal. `[]` pode ocultar carregamento: use indicador explícito se vazio e carregando diferem. Stores/projections usam `seedLoadingValue: true`; seed estrutural sozinho não decide UX. Modele `null`/`undefined` no tipo e na UI.

Armadilha: na primeira falha com `loadingValue`, o effect inscrito mantém provisório sem reexecutar, e pending fica falso inclusive em leitor novo. `createErrorBoundary` recebe o erro original por identidade; leitura imperativa nova lança `StatusError` com o original em `cause`. Compare identidade no canal escolhido, não só mensagem. `refresh` antes de qualquer dado real restaura provisório, tira a boundary do fallback e resolve com o provisório enquanto a requisição ainda espera. Aguardar esse refresh não confirma dado real; o primeiro sucesso substitui o seed. Não generalize para recarga após valor real.

## Fontes AsyncIterable

Contrato: memo aceita `AsyncIterable`. O primeiro pull mantém fallback até um valor; pulls seguintes preservam valor confirmado sem reabrir pending. Troca de entrada espera o primeiro yield da nova fonte e preserva conteúdo antigo em boundary inicializada. Substituição chama `return()` uma vez no iterador anterior; pull antigo resolvido com owner vivo não publica nem pede outro. Descarte chama `return()` uma vez no ativo, sem pull adicional após resposta tardia.

Armadilha: isso não cancela transporte/processamento externo, nem é o yield de action. Generator que termina sem yield assenta `undefined`; após um yield, terminar preserva aquele valor. Thenable síncrono e `next()` com resultado já assentado publicam no mesmo flush; Promise nativa, mesmo resolvida, exige microtask. Sondas diretas de pending e via memo coincidiram quando criadas/descartadas por fase sob owner, sem equivalência geral.

## Chaves e leitores compartilhados

Contrato: no runtime instalado, `Loading.on` compara valor. Passe `on={id()}`; `on={id}` compara accessor estável e equivale a omitir `on`, embora o tipo `any` aceite e o JSDoc use accessor. Identidade de função só é chave correta quando esse é o domínio. A chave participa do commit: irmã que retém a mesma mudança pode impedir o fallback.

| Configuração | Durante a espera | Ambiente |
| --- | --- | --- |
| `on={id()}`, sozinha | fallback | Chromium |
| `on={id()}`, irmã lendo mesma fonte | ambas preservam conteúdo | Chromium |
| `on={id}` | conteúdo antigo, pending verdadeiro | Chromium |
| chave cujo valor não muda | conteúdo antigo | grafo |
| `on` com dado async e refresh | fallback a cada refetch | grafo |
| `on` com id e refresh do mesmo assunto | conteúdo antigo | grafo |

Armadilha: `on={latest(id)}` também espera a irmã; sozinha mostra fallback. Não misture título de B com dados confirmados de A sem indicar a diferença. Não incremente contador nem crie objeto novo ao avaliar `on`. `flush()` só drena trabalho síncrono elegível, sem resolver rede ou forçar transação arbitrária.

## Aninhamento e Reveal

`Loading` interna contém sua leitura inicial e deixa a shell externa aparecer. Uma leitura pendente diretamente sob a externa mostra o fallback externo. Para ordem e colapso entre boundaries, veja [Reveal](06-lists-control-flow-and-local-state.md#loading-errored-e-reveal); um grupo natural interno não libera a espera do sequencial externo.

## SSR e superfície disponível

Contrato: `ssrSource: "server"` serializa origem autoritativa servidor; `"hybrid"` usa esse dado e permite recomputação cliente; `"client"` pula origem no servidor. `deferStream: true` pode reter shell até dado necessário; `transparent: true` é opção restrita de integração. Fonte client pede Loading/fallback ou provisório explícito. Não leia `window` em origem servidor nem escolha hybrid sem necessidade de refetch.

Armadilha: APIs disponíveis são `latest`, `isPending`, `affects`, `flush`, `refresh`, `until`, `untrack`, `createOptimistic`, `createProjection`, `action`, `onSettled`, `resolve`, `enableExternalSource` e `NotReadyError`. Não existem `isSomePending`, `isRefreshing`, `batch`, `pending` ou `createAsync`; agregue `isPending`, controle operação Refresh e use memo/projection async com `ssrSource`.

## Recuperação e cache

Contrato: `reset` solicita reavaliação das fontes coletadas, sem recriar a subárvore. A boundary também recupera sem reset quando a fonte volta a produzir valor por entrada, refresh ou reexecução. Input ocultado durante erro pode voltar como o mesmo nó com o texto digitado. Antes da primeira carga ele não aparece; mantenha formulário fora da boundary para continuar visível/editável. Fonte que apenas volta a pendente mantém fallback de erro, com ou sem reset; Loading interna só retorna ao conteúdo quando houver valor. Indicador de retry deve vir do modelo fora de `Errored`, em região de anúncio montada vazia desde o início.

Receita:
```tsx
<p role="status">{model.retrying() ? "Carregando" : ""}</p>
<p role="alert">{model.publicMessage()}</p>
```

Armadilha: reset não apaga Promise rejeitada de cache externo nem desfaz/reautoriza mutação. Invalide na camada correta; não retenha accessor de owner descartado. Modelo responsável pelo retry precisa sobreviver ao leitor. No servidor, `lazy()` limpa sua Promise interna após rejeição, permitindo novo import na próxima montagem/preload; isso não limpa cache do bundler/router. Na API de router inspecionada, `revalidate` casa prefixo, `force` é true por padrão e `query.delete` remove entrada: escolha chave restrita e teste request real, pois HTTP do core não certifica esse cache. Bloqueie retry duplicado; pagamento/criação/reserva exige idempotência e reconciliação do backend. Permissão só recupera se a condição mudou. `NotReadyError` não é falha de negócio.

## Observação e sanitização

Contrato: `configureClientErrors` observa erros coletados por boundary, deduplica por objeto e admite política por root em render/hydrate. Erros não contidos seguem a plataforma. `ownerPath` identifica origem e `boundaryPath` tratamento, mas podem faltar conforme artefato/nomes retidos. O hook cliente retorna void e não altera erro servidor; hook servidor pode mapear exposição. `Errored` aceita `fallback`/`children`, sem prop `onError`.

Armadilha: fallback reativo pode reexecutar e duplicar telemetria; não dependa só de `window.onerror` nem envie log sem deduplicação. Mensagem genérica no DOM não protege HTML, chunks, hidratação, RPC ou exportador. Selecione campos públicos antes de entregar ao Solid; retorno de hook e `markSafeError` autorizam exposição. Teste marcador sintético, nunca segredo ou credencial real, em mensagem/cause/campo próprio, falha contida/não contida, mesmo objeto/nova instância e request efetivo após invalidação. Não remova assertions para recuperar contagem antiga de renders.

## Limite de atualização

A semântica de `Loading.on` descrita para código posterior difere da base verificada. Consulte [R03](17-known-risks.md#r03-on-e-boundary-criada-durante-hold) antes de aplicar exemplos de outra versão.
