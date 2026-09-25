# Matriz de regressões para a aplicação

Esta matriz é um plano adaptável ao runner existente, com base 2.0.0-rc.9. Parte dos cenários foi exercitada com testes locais que não acompanham a skill. Não adicione dependências ou altere a configuração de testes da aplicação apenas para copiar a matriz.

## Agendamento e effects

| Cenário | Preparação | Resultado a conferir |
| --- | --- | --- |
| Leitura antes do flush | Signal simples, escrita em handler | Valor confirmado antigo antes, novo após o assentamento elegível |
| Atualizadores consecutivos | Duas escritas funcionais no mesmo evento | Composição correta, sem perder incremento |
| Dependências do effect | Compute lê dois campos, apply lê somente o resultado | Cada campo necessário reinicia o efeito |
| Cleanup | Criar recurso, trocar entrada, descartar owner | Limpeza antes da substituição e no descarte, sem duplicação |
| Assíncrono obsoleto | Iniciar A e B, entregar B antes de A | A não sobrescreve B |
| Erro do apply | Lançar erro sintético no apply | Política de erro imperativo, sem atribuir ao error do compute |

A verificação de leitura antes do flush deve isolar fonte síncrona. Não generalize esse resultado para transação mantida por rede pendente.

## Stores, identidade e sidecar

| Cenário | Preparação | Resultado a conferir |
| --- | --- | --- |
| Draft síncrono | Alterar campo e remover item no setter | Update correto sem draft usado depois da callback |
| Identidade por chave | Substituir todos os objetos, mantendo IDs | Linha lógica e foco preservados quando o contrato assim exige |
| Estado visual próprio | Selecionar linha e executar mudança otimista de título | Rollback do título não perde seleção |
| Filtro e exclusão | Ocultar linha temporariamente e depois excluir de fato | Política de retenção local deliberada |
| Duas colunas | Mover a mesma entidade com confirmações sobrepostas | Unicidade no modelo e no DOM verificadas separadamente |

## Actions e confirmação

Controle entrega de resposta da mutação e entrega da fonte autoritativa independentemente. Cubra confirmação antes e depois de entrar no until, timeout, abort, erro de predicado e resposta supersedida de refresh.

Um teste importante de refresh usa o mesmo valor antes e depois. A espera deve terminar mesmo sem nova notificação de efeito por igualdade. Não use contagem de renders como único observador de uma revalidação.

No teste de until, uma linha exclusivamente otimista não deve confirmar sua própria gravação. Uma confirmação de outra operação com ID diferente também não deve liberar a espera.

Cobertura na rc.9, com testes locais que não acompanham a skill: reentrada depois de `await`, rollback e convergência; duplo envio recusado, operações sobrepostas por ID, falha da revalidação e falha da gravação; escrita comum no tick da action, nova execução da derivação no settle e reversão de escrita otimista feita depois do `yield`. `until`, `refresh` com o mesmo valor e resposta supersedida de `refresh` não foram testados.

## Boundaries e concorrência

Monte duas boundaries lendo a mesma fonte. Varie ausência de on, chave confirmada, chave adiantada e remount. Compare com duas fontes independentes. Registre a versão e confronte com o [alerta R03](../references/17-known-risks.md). Cobertura na rc.9: `on` com valor, accessor e irmã, `Reveal` e boundaries aninhadas.

Para [R01](../references/17-known-risks.md), estabeleça controle sem action pendente, repita com action aberta e repita após encerrá-la. Meça retenção de assinaturas ou recursos pelo mecanismo suportado pelo ambiente. Não acrescente campos privados de diagnóstico ao código de produto.

## Hidratação e produção

Entregue shell e uma região, mantenha outra região pendente e altere o cache. Verifique identidade do elemento, momento de publicação, descarte e takeover quando o stream terminar. Rode também com build de produção e clique real após hidratar.

Inclua fallback de erro durante streaming, cancelamento da navegação, duas sessões paralelas e uma fonte client-only. Um HTML final correto não cobre essas janelas temporais.

## Transporte e erro

Use segredo sintético em mensagem, cause e campo de Error. Procure esse marcador no HTML, payload, RPC e exportador de logs. Teste erro lançado e erro devolvido como dado separadamente, porque o contrato não é o mesmo.

Teste origem recusada, preflight, método errado, argumentos inválidos, replay de mutação e coleta adicional de dados falhando depois de gravação confirmada. Todos os testes devem usar ambiente isolado, nunca dados de produção.

## Como relatar

Para cada cenário registre versão dos pacotes, condição do build, entrada, ordem das operações, observação intermediária, resultado final e status de execução. Use não executado quando houver somente inspeção. Não marque um teste como aprovado porque uma issue ou PR diz que passou upstream.
