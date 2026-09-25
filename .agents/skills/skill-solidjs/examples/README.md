# Exemplos SolidJS 2

Exemplos adaptáveis à base verificada da skill. O [registro de validação](../dev/VALIDATION.md) distingue as provas executadas de leitura de fonte e typecheck; os testes históricos não acompanham o pacote.

## Exemplos pequenos

- [Contador](counter.tsx): derivação e effect em duas fases.
- [Contexto](preferences-context.tsx): provider do Solid 2 com estado por instância.
- [Ref observada](observed-ref.tsx): setup sob owner e cleanup retornado de `onSettled`.

## Tarefas com otimismo

[Tarefas](tasks.tsx) recebe a API por prop. Ela é capturada com `untrack` e precisa permanecer estável por instância; trocar backend ou contexto de usuário exige remontar o modelo.

Os [tipos](task-types.ts) e o [parser](task-validation.ts) fazem parte do exemplo. O adapter chama o parser na entrada. `api.create` deve aceitar a ID de correlação enviada, e `api.list` deve devolvê-la após a confirmação, para preservar a identidade da linha.

- Formulário e rascunho ficam fora de `Loading` e `Errored`, permanecendo editáveis durante carga e falha.
- Um `Set` comum reserva `form` e `task:<id>` antes da action. O guard é local à instância; a flag otimista por chave alimenta `disabled` e `aria-busy`.
- Mensagens comuns são escritas após a Promise da action. Escrevê-las no mesmo tick da chamada as reteria até o assentamento.
- Gravação confirmada com refresh falho informa que salvou, limpa o rascunho salvo e mantém o erro da lista. Falha da gravação preserva o campo e desfaz a linha otimista.

Cada envio cria uma nova ID. Se o servidor gravou antes de a resposta falhar, uma nova tentativa precisa reutilizar a ID ou ser deduplicada pelo backend. A API deste exemplo não cancela requests; desmontar a tela não garante interromper o transporte.

## Integrações

[Lista com estado local](list-with-local-state.tsx) mantém seleção por ID separada dos registros otimistas. A seleção dura enquanto o pai existir; filtro e paginação não a apagam.

[Operação cancelável](cancellable-operation.ts) impede aplicação tardia e notifica o `AbortSignal`; uma operação que ignora abort pode continuar e devolver recurso que ainda precisa de descarte.

[Sincronização externa](external-sync.ts) chama essa operação no apply de um effect. Seu accessor precisa ler todas as entradas reativas no compute. `apply` e `fail` são síncronos; a cadeia observa rejeições acidentais, mas não desfaz efeitos já iniciados.

Para regressões desses contratos, consulte a [seleção de cenários](regression-matrix.md).
