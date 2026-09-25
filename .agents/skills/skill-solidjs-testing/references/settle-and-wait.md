# Assentamento e espera

O agendador publica escritas por `queueMicrotask(flush)`.

## Tabela de assentamento

| Situação | Como assentar |
| --- | --- |
| Depois de `render()` | O DOM inicial já está pronto |
| `element.click()` ou setter fora de flush | `await Promise.resolve()` ou `flush()` |
| Leitura logo depois do setter | Vê o valor anterior até `flush()` |
| `createRoot` com memo e effect | Memo calcula na criação; apply do effect espera `flush()` |
| Memo assíncrono sob owner | `await resolve(() => memo())` |
| Conteúdo sob `Loading` ou rota nova | `vi.waitFor`, `expect.poll` ou `expect.element` no browser mode |
| `await userEvent.click()` no Chromium | O DOM já está assentado no retorno |
| Dentro de action, `onSettled` ou apply de effect | `flush()` lança ou vira no-op com diagnóstico |

`flush()` não resolve rede nem Promise. Para respostas fora de ordem, controle cada operação com `Promise.withResolvers()`, confirme que A e B começaram e libere B antes de A.

## Loading, lazy e isPending

Para testar pending durante recarga, resolva a primeira carga antes de trocar a entrada. Observe o pending e o conteúdo antigo durante a segunda espera, depois o novo valor. A primeira carga sem dado depende de `Loading`; não a confunda com esse cenário de recarga.

`lazy()` compartilha o import entre instâncias da mesma fábrica. Ao testar cancelamento, desmontar uma delas antes do import resolver não deve impedir a outra de renderizar.

## Fake timers

- Preserve `queueMicrotask` real. Com `toFake: ['queueMicrotask']`, o DOM fica parado até `vi.runAllTicks()` ou `flush()`.
- Timer que escreve signal: `await vi.advanceTimersByTimeAsync(ms)` entrega o DOM atualizado; `vi.advanceTimersByTime(ms)` executa o callback e deixa a publicação para a microtask.
- `until(fn, { timeout })` só rejeita por timeout depois de avançar o relógio.
