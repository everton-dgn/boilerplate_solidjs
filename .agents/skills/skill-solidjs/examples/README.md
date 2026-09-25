# Exemplos SolidJS 2

Base documental: `solid-js@2.0.0-rc.9` e `@solidjs/web@2.0.0-rc.9`.

Estes arquivos são exemplos próprios para adaptação a um projeto compatível, não uma aplicação pronta com servidor e build. Não instale novas dependências sem conferir o ambiente existente.

## Componentes

[Contador](counter.tsx) demonstra derivação e efeito em duas fases. [Contexto de preferências](preferences-context.tsx) demonstra o provider do Solid 2 sem estado de usuário global. [Referência observada](observed-ref.tsx) demonstra setup com owner e cleanup retornado de onSettled.

[Tarefas](tasks.tsx) demonstra fonte remota otimista, action geradora, refresh aguardado, pendência por ID, mensagens públicas e lista por chave. Sua API é recebida por prop e deve ser **estável por instância**. A captura inicial com `untrack` explicita essa fotografia, sem prometer acompanhar mudanças da prop. Para trocar de backend/contexto de usuário, remonte o modelo no owner apropriado, em vez de alterar silenciosamente a prop API esperando que a captura inicial seja reativa.

Decisões do exemplo, todas verificadas na rc.9:

1. O formulário e seu rascunho ficam fora de `Errored` e `Loading`. O usuário digita durante a primeira carga, e o campo continua visível e preenchido quando a lista falha ou é recarregada.
2. Um `Set` comum reserva chaves por operação: `form` e `task:<id>` na criação, `task:<id>` na conclusão. Concluir uma tarefa durante a criação de outra é permitido; repetir a mesma operação é recusado com aviso em `role="status"`.
3. `disabled` e `aria-busy` leem uma flag otimista por chave, escrita dentro de cada action. Ela aparece no próximo flush e volta no settle. Um signal comum escrito no mesmo tick da chamada ficaria retido até o fim da action.
4. As mensagens são escritas depois que a Promise da action assenta. A gravação confirmada com revalidação que falha informa que a alteração foi salva e deixa a falha de carga para a `Errored` da lista; a falha da gravação mantém o rascunho e desfaz a linha otimista.

O exemplo exige que `api.create` aceite a ID enviada e que `api.list` retorne essa mesma identidade depois da confirmação. Adapte esse contrato ao backend real. O guard protege somente a instância local. Cada envio gera outra ID; se o servidor pode ter gravado antes de a resposta falhar, reutilize a ID na nova tentativa ou deduplique no backend. O uso de crypto.randomUUID acontece no evento/action, não na renderização SSR, e pressupõe browser moderno em contexto seguro.

[Tipos de tarefas](task-types.ts) contém os contratos. [Validação de tarefas](task-validation.ts) recebe unknown, rejeita forma inválida e IDs duplicados, e retorna apenas campos esperados. O adapter precisa chamar o parser na fronteira de entrada; uma interface TypeScript sozinha não faz isso.

## Integração de dados

Implemente TasksApi com o transporte já adotado: fetch com checagem de status e parser, server functions, ou adapter de teste. Listar pode falhar e deve rejeitar com uma falha apropriada. Gravar deve resolver somente depois da confirmação relevante do servidor.

A API do exemplo não possui cancelamento de requests; adicione-o na camada de transporte conforme seu ciclo de vida. Não trate esse exemplo como solução completa de persistência, autorização, concorrência distribuída ou offline.

Se a tela for descartada enquanto uma operação está aberta, confirme o comportamento do modelo e do transporte num teste do projeto. O código não mantém efeitos externos duradouros, mas a requisição do adapter pode continuar. Não registre segredos ou os dados brutos da falha.

## Validação necessária

Copie o conjunto necessário e rode o typecheck real, os testes DOM/SSR e o build de produção. A revisão original fez análise sintática; revisões posteriores executaram cenários selecionados com testes locais que não acompanham a skill. Não atribua a um exemplo a cobertura de outra fixture. Consulte [o relatório](../dev/VALIDATION.md) e [as receitas](../references/15-diagnostics-checklists-and-recipes.md).

## Novos exemplos de integração

[Lista com estado local](list-with-local-state.tsx) recebe registros readonly, conserva seleção própria por ID e lê os dados diretamente. O exemplo pressupõe IDs únicos e estáveis. A seleção persiste enquanto o componente pai existir; não há limpeza automática por filtro ou paginação. Defina remoção e troca de contexto conforme o domínio.

[Operação cancelável](cancellable-operation.ts) é um utilitário puro com resultado discriminado e vigência. Cancelar notifica o AbortSignal e impede aplicação tardia, mas não obriga uma tarefa que ignora abort a terminar nem fecha recursos retornados por ela. [Sincronização externa](external-sync.ts) é uma fábrica chamada sob owner: seu accessor de entrada deve ler todos os campos reativos necessários no compute e entregar funções/valores à fase imperativa. Use somente para integração externa; para dados renderizados, prefira fonte assíncrona do grafo.

Os callbacks `apply` e `fail` devem ser síncronos. A cadeia observa rejeições acidentais, mas não controla efeitos que um callback já iniciou. A fábrica retorna void porque sua vida pertence ao owner; o effect fornece sua limpeza por execução.

## Matriz de regressões

A [matriz de regressões](regression-matrix.md) contém os cenários DOM, SSR, actions e transporte que precisam da infraestrutura real da aplicação.
