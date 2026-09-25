# Cancelamento e fontes vivas

RC.9.

## Responsabilidade e limpeza

Contrato: JSX usa memo/projection async sob Loading/Errored; derivação é pura; gravação usa handler/action; widget usa effect split; assinatura pós-montagem usa onSettled com cleanup síncrono. Compute aceita async; apply retorna void/cleanup. Setter é síncrono: draft fecha ao retornar. Promise no setter lança ASYNC_STORE_SETTER em dev; padrão não verifica e perde escritas pós-await.

Receita:
```ts
const result = await api.read()
if (isCurrent()) setState(draft => { draft.result = result })
```

Armadilha: apply/onSettled async não entregam cleanup síncrono, mesmo com cast. Não guarde draft em closure/ref/timer/Promise. Draft de projection usado após retorno perde escrita silenciosamente; mudança posterior de projections/stores derivadas não vale nesta base. Action após await exige yield vazio antes de escrita/leitor, inclusive yield until; utilitário genérico não conhece transação Solid.

## Operação imperativa

Contrato: compute captura entradas que reiniciam trabalho, inclusive transporte substituível. Apply inicia tarefa e retorna cancelador imediatamente; AbortController por execução e guarda bloqueiam resposta antiga mesmo sem abort cooperativo. Confira vigência novamente entre resolver/aplicar. Utilitário discrimina conclusão/cancelamento/falha unknown; cancelamento não é sucesso. Falha de callback segue à plataforma por microtask.

Receita:
```ts
createEffect(
  () => ({ id: id(), read: transport() }),
  ({ id, read }) => {
    const controller = new AbortController()
    let current = true
    void Promise.resolve().then(() => read({ id, signal: controller.signal })).then(
      result => { if (current) return applyResult(result) },
      error => { if (current) return reportFailure(error) }
    ).catch(error => { queueMicrotask(() => { throw error }) })
    return () => { current = false; controller.abort() }
  }
)
```

Armadilha: callbacks devem ser síncronos; tipo void aceita async. Cadeia observa rejeição acidental, sem cancelar efeito iniciado. Tarefa que ignora abort pode manter Promise pendente até terminar. Braço error do effect trata compute/dependências, não rejeição posterior do apply. Separe cancelado/recuperável/inesperado, sem catch vazio; mensagem pública e observação seguem política de dados sensíveis. Cancelar não desfaz banco/serviço. Ignorar ImageBitmap tardio não o fecha: descarte recurso explicitamente.

## Corridas e recursos adiados

Contrato: teste A substituída por B, B concluída antes de A, A rejeitando cancelada e descarte antes da resolução; só B aplica. Cubra início síncrono falho, aplicação falha e cleanup duplo. Fonte própria fecha no finally: teste saída antes do próximo valor, rejeição e fim normal. Criar iterador pode preceder corpo/pulls; server functions vinculam trabalho adiado suportado ao contexto da chamada.

Armadilha: perder leitor não reverte servidor. Teste requests concorrentes com fontes lentas/locals distintos, sem request global nem Response/Headers/cache compartilhado de sessão. Testes de ordenação/cancelamento cooperativo do utilitário não provam descarte de owner Solid.

## Origem e CORS

Contrato: Sec-Fetch-Site presente decide: same-origin libera; same-site/cross-site/none recusam sem consultar csrf.origin. Sem header, Origin/Referer usam matcher string/array/função. withCSRFVary acrescenta Vary: Sec-Fetch-Site, Origin, Referer. csrf.allowCredentials não existe. Fetch cross-site browser envia metadados; matcher só amplia aceitação sem eles, como proxy/node:http/bots.

Armadilha: endpoint absoluto/matcher/token não comprovam fluxo browser cross-origin. Separe autenticação/autorização/CSRF/CORS/roteamento; não remova proteção, forje headers ou libere todas as origens com credenciais. Em Capacitor/extensão/widget, teste host, OPTIONS de preflight, cookie/bearer e leitura da resposta. Mudança posterior não certifica pacote instalado.

## Hooks e invocação

Contrato: provideEvent executa callback exatamente uma vez; zero/duas é inválido, sem retry no provedor. wrapInvocation não chamável é recusado, incluindo null/false improvisados. Siga assinatura pública e teste HTTP/SSR direto.

Armadilha: dois requests podem executar duas vezes; idempotência de criação/reserva/pagamento pertence ao domínio/persistência.

## Estado live

Contrato: live entrega estados sucessivos da mesma consulta e reemite estado atual a cada invocação. Compõe com GET sem implicá-lo: live(GET(fn)). Perda de conexão pode reinvocar com backoff; estado deve ser reconstruível da fonte autoritativa, sem persistir o mesmo grafo servidor.

Armadilha: não é SSE/WebSocket pronto nem persistência durável. Identifique adapter/teste recuperação. Eventos de entrega única, histórico, auditoria ou incremento precisam de cursor/sequência/dedupe/reconexão próprios; snapshot não é evento.

## Coleta após gravação

Contrato: collectFlightData participa de POST com script/header single-flight/coletor registrado, após transformResult, em retorno ou Response/envelope lançado como controle. Erro comum lançado não coleta. foldFlightData retorna logo em Response com corpo próprio. Falha de coleta não desfaz gravação confirmada. Separe domínio/invalidação/dados adicionais, preserve Set-Cookie separado e use adapter, sem remontar protocolo privado.

Armadilha: configurar hook/chamar direto não prova coleta HTTP. Catch da coleta loga erro original via console.error inclusive em produção, fora da proteção da invocação. Normalize dentro da coleta e represente fatia indisponível conforme adapter; não devolva erro bruto nem substitua console global. Esse caminho não prova vazamento de aplicação concreta. Reconciliação não deve reenviar mutação confirmada.

## Aceite

Contrato: teste isolamento, método/entrada/origem inválidos, cancelamento, sanitização, reconexão live e gravação confirmada com coleta falha. Capture logs/payload; confirme gravação com fatia indisponível.

Armadilha: stub não cobre HTTP compilado; ausência de marcador no corpo não prova log seguro. Teste contenção/cancelamento/rollback separadamente.

