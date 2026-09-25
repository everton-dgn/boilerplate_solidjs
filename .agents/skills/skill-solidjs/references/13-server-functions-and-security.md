# Server functions e segurança

Base: Solid 2 RC.9.

## Compilação e corpo registrado

Contrato: use server exige transformação cliente/servidor, manifesto, bootstrap e handler HTTP, sem criar backend em site estático. Use adapter e @solidjs/web/server-functions; entradas client/server são para integrações, sem remontar protocolo. Filtro padrão do plugin é `src/**/*.{jsx,tsx,tsrx,ts,js,mjs,cjs}`; inclua fixtures. Build verde fora do filtro pode manter corpo servidor no cliente.

Armadilha: `validated(schema, async (...) => { "use server" })` pode registrar função interna e envolver só a referência cliente. HTTP equivalente ignorou wrapper, com zero validações; sem build completo. Valide/autorize no corpo registrado. Em módulo use server, wrapper exportado pode ser registro: confira output. Exporte só funções; constantes/schemas/sentinelas não foram testados e ficam em outro módulo.

Receita: confira referência cliente, ausência de marcador sintético do corpo em bundle/chunks/sourcemaps públicos, registro servidor e HTTP real. Use marcador sintético, nunca segredo ou credencial real. Marcador ausente não prova remoção de módulo importado, mesmo com import estático usado só dentro da função; inspecione bundle próprio.

## Validação e autorização

Contrato: valide estrutura/tipo/tamanho, negócio, sessão, tenant, permissão/propriedade no HTTP forjado. TS/UI não validam runtime; usuário/isAdmin/metadata/cookie não verificado/header do chamador não provam identidade. Decodificação remove recursivamente __proto__/constructor/prototype em objetos e entradas Map/Set, controlando ciclos; chaves seguras com conteúdo malicioso continuam exigindo schema.

Receita, com readSessionUserId e findProject implementados na camada servidor:
```ts
type PublicProject = { id: string; name: string }
export const getProject = GET(async (projectId: unknown): Promise<PublicProject | undefined> => {
  "use server"
  const userId = readSessionUserId()
  if (!userId || typeof projectId !== "string" || projectId.length > 64) return undefined
  const project = await findProject({ projectId, ownerId: userId })
  return project ? { id: project.id, name: project.name } : undefined
})
```

Armadilha: select não autoriza ID. Renomear exige sessão (401 público), projectId/name strings, nome aparado não vazio, entrada até 80 caracteres (400 público por campo). Update usa projectId/ownerId; ausente/alheio dá mesmo 404; saída só id/name, sem internalNotes. Middleware valida sessão antes de locals.userId; confira tipo em getRequestEvent. Limites são da receita; exemplo com banco declarado só foi tipado, sem compilação/HTTP.

## Métodos, limites e metadados

Contrato: padrão POST, GET(fn) declara leitura. Handler aceita POST sempre; GET/HEAD só em declaradas GET, HEAD sem corpo com status/headers equivalentes; demais métodos 405. GET em função comum: Allow: POST. GET/HEAD declarados dispensam gate de origem por padrão e podem ser invocados de outra origem com cookies do ambiente; csrf.protectDeclaredReads true reativa proteção quando deploy não depende de cache compartilhado por origem. Autenticação/autorização/cache continuam obrigatórios.

Contrato: bodySizeLimit padrão 1 MiB recusa excesso com 413 antes de decodificar; maxArguments padrão 1000 recusa com 400. withMeta anexa metadata; getServerFunctionMetadata/isServerFunction servem à inspeção, não autorização. Propriedades antigas .GET/.withOptions não são API atual.

Armadilha: GET não muta; query string não leva segredo/token/dado sensível registrado/cacheado. Limites não validam domínio; leitura autenticada exige isolamento.

## Configuração e origem

Contrato: configureServerFunctionsServer aceita endpoint padrão /_server alinhado ao cliente/base path; csrf ligado por padrão; secret usado no flash no-JS; wrapInvocation envolvendo HTTP e chamada direta SSR; provideEvent ligado a provideRequestEvent de @solidjs/web/storage ou equivalente; handleNoJS, cujo null desliga convenção; bodySizeLimit/maxArguments. Csrf false só se outra camada confiável protege endpoint. handleServerFunctionRequest aceita por request createEvent, provideEvent, wrapInvocation, onError, transformResult, handleNoJS, csrf, codec e limites. Wrapper por request cobre só invocação endereçada; chamadas aninhadas exigem política global.

Armadilha: com Sec-Fetch-Site, same-origin libera e same-site/cross-site/none recusam sem consultar csrf.origin. Só sem header entram Origin/Referer e matcher string/array/função. Endpoint absoluto e matcher não certificam cross-origin browser; não remova proteção para contornar 403. Provedor executa uma vez por invocação, sem garantir idempotência entre requests. Detalhes de transporte ficam em 09-cancellation-and-live-sources.md.

Armadilha: configure um provedor de evento explícito: `configureServerFunctionsServer({ provideEvent: (event, fn) => provideRequestEvent(event, fn) })`. Sem `provideEvent`, o runtime cai para o `AsyncLocalStorage` global que `provideRequestEvent` instala na primeira chamada; a chamada só lança `No request event provider` se nenhum dos dois existir ainda, e o resultado depende da ordem das requisições no processo. `createEvent` é opção por requisição de `handleServerFunctionRequest`; passado a `configureServerFunctionsServer`, é aceito sem erro e ignorado, e `locals` fica vazio.

## Cache e redirect seguro

Contrato: handler responde Cache-Control no-store salvo política própria em respond com headers ou Response. Publicidade só para leitura independente de sessão; dados de usuário pedem private, no-store em todos os ramos, inclusive 401/redirect. Redirect copia destino para Location sem validar.

Receita:
```ts
type NextTarget = { next: string | null; origin: string }
function safeNextPath({ next, origin }: NextTarget): string {
  if (!next) return "/"
  try {
    const url = new URL(next, origin)
    if (url.origin !== origin || !url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/"
    return url.pathname + url.search + url.hash
  } catch { return "/" }
}
function redirectAfterLogin(request: Request): Response {
  const url = new URL(request.url)
  const response = redirect(safeNextPath({ next: url.searchParams.get("next"), origin: url.origin }), 303)
  response.headers.set("cache-control", "private, no-store")
  return response
}
```

Armadilha: prefixo / aceita //evil.example e /\evil.example. Mesma origem aceita /a/..//evil.example, mas pathname normalizado //evil.example vira host externo em Location. Rejeite https externo/javascript/data. Tipagem não isola cache.

## Política cliente e cancelamento

Contrato: configureServerFunctionsClient.prepareRequest é hook único; componha políticas. Método ausente/alterado é recusado antes do fetch; só method é verificado. Preserve init/signal; trocar body é permitido. Invoke aceita só signal/keepalive/priority.

Receita:
```ts
configureServerFunctionsClient({
  prepareRequest: init => ({ ...init, headers: { ...init.headers, ...sessionHeaders() } })
})
// Chamada com cancelamento:
invoke(save, { signal: controller.signal, keepalive: true, priority: "high" }, input)
```

Armadilha: init sem signal passa no guard se method correto, perdendo cancelamento. Invoke com method/headers/body/timeout lança indicando GET/prepareRequest/argumentos. Timeout usa AbortSignal composto quando suportado; retry/dedupe são da camada de dados. Abort rejeita/cancela transporte sem desfazer backend; repetição não idempotente exige contrato.

## Codecs e framing

Contrato: transporte usa HTTP natural quando aplicável e JSON no restante. Date, Map, Set, arrays tipados e ciclos exigem opt-in correspondente. enableRichArguments de @solidjs/web/server-functions/rich-args habilita escrita do codec de argumentos; resultados têm contrato próprio independente desse opt-in. Plugins usam createPlugin/OpaqueReference da instância de serialização do runtime.

Armadilha: seroval separado pode incompatibilizar protocolo sem erro de tipo. Serialization/frames são integração avançada; opt-in não valida payload. Runtime remove Content-Length, Content-Encoding e Transfer-Encoding declarados pela função, tanto HTTP quanto envelope de stream, pois framing pertence ao transporte.

## Respostas e endereço natural

Contrato: endereço programático difere do natural de form action, separando serializado/HTTP no cache. Respond combina valor/metadados; redirect/reload sinalizam navegação/revalidação ao adapter, sem refazer todo memo por chave textual.

Contrato: no caminho com script medido, redirect retornado dá 200 sem Location, com X-Server-Function-Redirect no formato `<status> <url-absoluta>`; endereço natural dá 302. Reload dá 200 com X-Revalidate. Return/throw de respond status 400 preservam status/corpo, mas só throw marca X-Server-Function-Error true e rejeição RPC. decodeRedirectHeaderValue aceita absoluto http(s) e status reconhecido; javascript/data/inválido ou header ausente retornam undefined, tratado como sem redirect. Não monte endpoint/headers internos na UI.

Armadilha: domínio esperado é público/tipado. Return/throw mudam rejeição; sem Location programática ainda pode haver redirect.

## Formulário sem JavaScript

Contrato: documental. fn.url é endereço natural usado em form action. Browser form POST recebe createNoJSHandler por padrão; handleNoJS global/por request substitui, e createNoJSHandler({base}) estende a convenção a toda chamada sem script. Resultado fica em cookie flash de uso único por 60 segundos, cifrado AES-GCM, limite 4 KB. Acima disso descarta eco dos campos e truncated indica resumo. decodeFlashCookie retorna Promise<FlashSubmission | undefined>, exige await.

Armadilha: sem await, flash parece vazio. Secret igual entre instâncias post/render; ausente usa segredo do plugin por build, sem ambos redireciona sem resultado. Alta entropia fora do Git. Formulário/router repopula campos/erros; RPC onSubmit não implementa progressive enhancement. Teste browser sem JS e instâncias com segredo igual/diferente.

Contrato: o parser do corpo distingue quatro casos: corpo vazio sem tag de formato (zero argumentos), tag válida, tag desconhecida (recusada com `TypeError` citando descompasso de versão) e POST de formulário sem tag, que segue o ramo de navegação sem JavaScript quando `Sec-Fetch-Mode` é `navigate` ou está ausente e é recusado com 400 para qualquer outro valor, como `cors`.

## Erros e logs

Contrato: erro comum lançado por HTTP é sanitizado com DEV desligado, salvo hook explícito ou markSafeError. Condição development liga DEV e entrada padrão desliga; NODE_ENV sozinho não prova artefato. setServerFunctionsDev(true) liga modo e permite mensagem/stack originais; nunca habilite em produção e teste isoladamente, pois muda estado compartilhado. Falha direta SSR reporta/relança original ao chamador; Responses/envelopes de controle têm outro contrato.

Armadilha: sanitizeServerError só atua no throw. Throw de Error comum chega como Internal Server Error; return Error atravessa com message/cause/propriedades, inclusive não enumeráveis cujo descriptor tem value. Instância de classe não Error volta pela mesma referência, sem filtrar conteúdo. Travessia só usa chaves string, não Symbol; getters só são lidos quando enumeráveis ou descriptor tem value. Isso não saneia SDK/domínio. MarkSafeError usa Symbol.for("solid.SafeError") e deve marcar só erro público, nunca tornar seguro retorno bruto.

Contrato: onError servidor pode mapear valor destinado ao cliente sem sanitização adicional. Não retorne/logue original; proteja operação e validação de saída antes do transporte, selecionando campos públicos e criando erros novos. Não revele existência de recurso privado. Não habilite logs com tokens/cookies/payload por conveniência.

## Server components experimentais

Contrato: prévia fora da estabilidade 2.0. Adoção explícita: tarefa de UI não autoriza arquitetura/transporte/deploy experimental. Server function pode retornar componente consumido por dynamic. Argumentos vão ao servidor; props do componente retornado são slots/ligações cliente e não refazem consulta sozinhas. $key é identidade do protocolo de slots, não key universal de lista nem índice substituto. asyncArg aceita Promise/AsyncIterable em prop de slot preservando tipo resolvido T, e continua experimental.

Receita: `serverFunctions: { components: true }`, ou components "external" com ligação documental pelo host. Reutiliza endpoint/compilação/segurança RPC. Start SSR gerado chama installServerComponents de @solidjs/web/frames antes de hydrate; entrada autoral chama uma vez e servidor recebe plugin de render de frames.

Armadilha: sideEffects false em @solidjs/web permite remover import sem chamada. Sem use client/convenções Next.js inventadas. Alinhe cliente/servidor/codec; teste produção/HMR e manifesto completo. Markup/props podem vazar dados. Router instalado (`2.0.0-next.26`) não tem `serverRouteComponent`; o registro anterior situa a chegada experimental em `2.0.0-next.27`, sem validação nesta skill. UI/formulários comuns podem usar componentes cliente/async/SSR/RPC.

## Critérios de aceite

Contrato: teste HTTP sem sessão, outro tenant/ID alheia, campos extras, payload excessivo, métodos errados/HEAD, origem, cancelamento e replay; confira cache inclusive erro/redirect, destinos //evil.example e /a/..//evil.example e ausência de credenciais/schema secreto/banco no cliente. Endpoint real deve ser isolado, sem mutação automática de produção. Query/action de dados vêm do router; router instalado não exporta useSubmission singular, e createServerFn é de outro framework.

Contrato: experimento exige testar argumentos/refetch/slots/estado, erro/parcial/cancelamento/navegação, duas instâncias/requests e A/B invertidas em hidratação/prefetch. Artigo/dynamic não certifica protocolo. Meça payload/servidor/waterfall/cache/erro, sem prometer bundle/latência/backend menores; registre versões/migração.

Armadilha: função local não prova HTTP/isolamento; experimento não herda certificação do core.

