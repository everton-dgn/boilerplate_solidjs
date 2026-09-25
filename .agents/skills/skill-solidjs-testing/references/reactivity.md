# Primitives, stores e actions

Contratos em [reatividade](../../skill-solidjs/references/02-reactivity-and-ownership.md), [effects](../../skill-solidjs/references/03-effects-and-lifecycle.md), [stores](../../skill-solidjs/references/05-stores-and-projections.md) e [actions](../../skill-solidjs/references/10-actions-optimism-and-confirmation.md).

## Receita: primitive sob createRoot

Crie o modelo sob owner, registre o disposer e faça as escritas depois que `createRoot` retornar. Escrita no corpo do root lança `REACTIVE_WRITE_IN_OWNED_SCOPE`; `ownedWrite` não deve mascarar isso na fixture. O apply inicial de effect só roda depois de `flush()`.

Primitiva que lê contexto precisa de componente sonda sob o provider. Para provar descarte, observe primeiro uma atualização bem-sucedida; só então descarte e tente atualizar outra vez.

## Store e action

Para granularidade de store, conte as execuções dos consumidores das folhas afetadas e não afetadas. Observar apenas o valor final perde essa diferença.

Invoque a action fora do corpo de root, memo ou effect; em fixture que ainda tenha owner ambiente, use `runWithOwner(null, fn)`. A sobreposição otimista reverte também no sucesso: o teste precisa confirmar que a fonte autoritativa passou a devolver o dado após a gravação e o refresh. Apenas o caso de falha aprovaria uma action que nunca grava.

## Sequências que discriminam erro

Escolha as linhas pertinentes ao contrato alterado.

| Área | Sequência e observável |
| --- | --- |
| Setters | Duas atualizações funcionais antes do flush; composição preservada |
| Memo condicional | Escrever no ramo inativo, alternar e voltar; execuções e valor atualizado |
| Effect | Alterar leitura do apply e depois do compute; dependências e cleanup por execução |
| Props | Alterar prop na instância montada; valor novo sem remontagem |
| For | Reordenar IDs e atualizar payload; estado local e foco da entidade |
| Async | Iniciar A e B, resolver B antes de A; A não sobrescreve B |
| Otimismo | Sobrepor alterações e falhar uma; preservar a confirmação da outra |
| Owner | Descartar pai e disparar callback tardio; sem reconexão sob owner morto |

## Armadilhas

- `NotReadyError` precisa ser a classe de `solid-js`. Uma classe local homônima vira falha real para `Loading` e `Errored`.
- `isPending` pode absorver erro do próprio callback e devolver `false`; observe também a falha para não concluir que houve sucesso.
- Um leitor async criado sob owner já descartado não publica. Mantenha consumidor vivo durante a espera.
- Microtasks, actions e timers têm [esperas diferentes](settle-and-wait.md).
