# Cancelamento e fontes vivas

Base: [revisão verificada](../SKILL.md).

## Responsabilidade e limpeza

Use fonte async do grafo para dados renderizados; effect split para integração imperativa. O apply precisa devolver cleanup síncrono. Draft de setter ou projection retido depois da execução perde escritas; não o capture em timer ou Promise. Reentrada de action após `await` tem [contrato próprio](10-actions-optimism-and-confirmation.md#geradores-e-reentrada).

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

`Sec-Fetch-Site` pode recusar a chamada antes de consultar `csrf.origin`: veja [configuração e origem](13-server-functions-and-security.md#configuração-e-origem). Aceitação num cliente HTTP fora do navegador não prova o fluxo com preflight e credenciais.

## Hooks e invocação

Contrato: provideEvent executa callback exatamente uma vez; zero/duas é inválido, sem retry no provedor. wrapInvocation não chamável é recusado, incluindo null/false improvisados. Siga assinatura pública e teste HTTP/SSR direto.

Armadilha: dois requests podem executar duas vezes; idempotência de criação/reserva/pagamento pertence ao domínio/persistência.

## Estado live

Contrato: live entrega estados sucessivos da mesma consulta e reemite estado atual a cada invocação. Compõe com GET sem implicá-lo: live(GET(fn)). Perda de conexão pode reinvocar com backoff; estado deve ser reconstruível da fonte autoritativa, sem persistir o mesmo grafo servidor.

Armadilha: não é SSE/WebSocket pronto nem persistência durável. Identifique adapter/teste recuperação. Eventos de entrega única, histórico, auditoria ou incremento precisam de cursor/sequência/dedupe/reconexão próprios; snapshot não é evento.

## Coleta após gravação

Contrato: collectFlightData participa de POST com script/header single-flight/coletor registrado, após transformResult, em retorno ou Response/envelope lançado como controle. Erro comum lançado não coleta. foldFlightData retorna logo em Response com corpo próprio. Falha de coleta não desfaz gravação confirmada. Separe domínio/invalidação/dados adicionais, preserve Set-Cookie separado e use adapter, sem remontar protocolo privado.

Armadilha: configurar hook/chamar direto não prova coleta HTTP. Catch da coleta loga erro original via console.error inclusive em produção, fora da proteção da invocação. Normalize dentro da coleta e represente fatia indisponível conforme adapter; não devolva erro bruto nem substitua console global. Esse caminho não prova vazamento de aplicação concreta. Reconciliação não deve reenviar mutação confirmada.
