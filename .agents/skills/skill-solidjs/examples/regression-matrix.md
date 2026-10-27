# Regressões específicas

Agendamento, props, granularidade e descarte estão na [matriz da skill de testes](../../skill-solidjs-testing/references/reactivity.md#sequências-que-discriminam-erro). Para os contratos avançados dos exemplos, acrescente somente o cenário pertinente.

| Contrato | O que diferencia um teste útil |
| --- | --- |
| Confirmação por `until` | Entregar a confirmação antes e depois da espera; uma linha só otimista ou a confirmação de outra ID não libera a operação |
| `refresh` em helper async | Limitar o tempo da Promise da action e observar a fonte durante a espera, com uma fonte independente e outra que leia estado escrito pela action: a action precisa assentar e o valor novo não pode aparecer antes, conforme [actions](../references/10-actions-optimism-and-confirmation.md#geradores-e-reentrada) |
| `refresh` com valor igual | A Promise termina mesmo sem nova publicação por igualdade; contar renders sozinho perde esse resultado |
| Estado visual separado | Rollback do título não apaga a seleção por ID; filtro temporário não equivale a exclusão |
| Boundaries compartilhadas | Comparar leitor único com duas boundaries lendo a mesma fonte, conforme [R03](../references/17-known-risks.md#r03-on-e-boundary-criada-durante-hold) |
| Retenção durante action | Comparar recursos sem action aberta, durante a espera e após assentamento/descarte, conforme [R01](../references/17-known-risks.md#r01-retenção-de-assinaturas-durante-action-pendente) |
| Hidratação progressiva | Interagir após a shell e antes da última região do stream; conferir listeners e identidade após o término |
| Erro de servidor | Procurar marcador sintético em HTML, chunks, RPC e logs; `throw Error` e `return Error` têm exposições diferentes |

Esta lista seleciona provas; não declara que todos os cenários foram executados.
