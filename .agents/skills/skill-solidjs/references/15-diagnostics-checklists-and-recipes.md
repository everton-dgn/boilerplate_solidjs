# Diagnósticos, checklists e receitas

Base: `solid-js` e `@solidjs/web` 2.0.0-rc.9. Como testar (Vitest, assentamento, fake timers, montagem, oráculos, captura de avisos) fica na skill `skill-solidjs-testing`. Cenários de regressão por área: [matriz](../examples/regression-matrix.md).

## Onde os diagnósticos aparecem

Contrato: o pacote `solid-js` instalado inclui `CHEATSHEET.md` e a skill oficial `skills/reactivity-diagnostics/SKILL.md`, com uma seção por código. `DEV` existe no artefato de desenvolvimento; `OBSERVE`, nos de desenvolvimento e observação; ambos são `undefined` no build default. Canal: `error` indica comportamento quebrado e `warn` código que funciona mas está errado ou caro; eventos `info` ficam só no canal estruturado, sem console (um spy de `console.warn` não os vê); listeners rodam de forma síncrona na emissão; o primeiro relato de cada código leva um rodapé com o guia de reparo, uma vez por código e por instância do módulo.

`solid-js/attribution` resolve o gravador em development e observe e uma implementação inerte no default. `attribution.enable` existir não prova gravação: confira `OBSERVE.attribution.installed` e um registro produzido por interação controlada, e desabilite no fim ([AttributionSlot](https://v2.solidjs.com/reference/solid-js/advanced/diagnostics-dev-hooks/observe#attributionslot)). Use a superfície pública de `OBSERVE`, sem nós privados. `@solidjs/diagnostics` captura evidência para testes; confira os exports instalados antes de importar helpers.

Armadilha: silêncio no build default não prova ausência de problema. Confirme as condições de exportação que o runner ou bundler resolveu antes de interpretar o console.

## Diagnósticos de corretude e reparo

A união `DiagnosticCode` tem 52 códigos. Origem: grafo (motor em dev), atribuição (só com gravador habilitado), servidor (runtime de servidor).

| Código | Origem | Verificar e corrigir |
| --- | --- | --- |
| `STRICT_READ_UNTRACKED` | grafo | Leitura reativa fora de JSX, memo ou compute (callback de `ResizeObserver`, binding `style`/`class` a sub-objeto de store sem `readShallow`); preservar o accessor ou fotografar com `untrack` |
| `PENDING_ASYNC_UNTRACKED_READ` | grafo | Fonte sem valor lida fora de escopo capaz de suspender |
| `PENDING_ASYNC_FORBIDDEN_SCOPE` | grafo | Leitura pendente em `onSettled` ou tracked effect; mover ao compute |
| `REACTIVE_WRITE_IN_OWNED_SCOPE` | grafo | Setter ou `refresh()` em componente ou cálculo; `untrack` não isenta. `{ ownedWrite: true }` na criação, ou mover a handler/`onSettled` |
| `ACTION_CALLED_IN_OWNED_SCOPE` | grafo | Action invocada durante construção ou cálculo |
| `ASYNC_STORE_SETTER` | grafo | Callback do setter devolveu Promise; separar espera e draft síncrono |
| `MISSING_EFFECT_FN` | grafo | Effect de um argumento; separar compute e apply |
| `FLUSH_IN_EFFECT_CALLBACK` | grafo | `flush` no próprio ciclo de apply; remover |
| `NO_OWNER_EFFECT`, `NO_OWNER_BOUNDARY`, `NO_OWNER_CLEANUP` | grafo | Criação ou `onCleanup` sem owner |
| `CLEANUP_IN_FORBIDDEN_SCOPE` | grafo | Cleanup registrado onde deveria ser retornado |
| `SETTLED_CLEANUP_UNOWNED` | grafo | Setup agendado sem owner que honre a limpeza |
| `PRIMITIVE_IN_FORBIDDEN_SCOPE` | grafo | Primitiva criada em fase imperativa inadequada |
| `RUN_WITH_DISPOSED_OWNER` | grafo | O aviso não impede o callback; conferir `isDisposed(owner)` antes ([ciclo de vida](03-effects-and-lifecycle.md)) |
| `INVALID_REFRESH_TARGET`, `INVALID_AFFECTS_TARGET` | grafo | `refresh(target)` e `affects(target, key?)` exigem accessor criado por Solid ou store derivada refreshable; wrapper, propriedade solta, chave inválida ou caminho de múltiplas chaves disparam |
| `SYNC_NODE_RECEIVED_ASYNC` | grafo | Opção `sync` em origem assíncrona |
| `ASYNC_OUTSIDE_LOADING_BOUNDARY` | grafo e servidor | Falta de limite de prontidão explícito |
| `REACTIVITY_HALTED` | grafo | Consequência de erro anterior não contido; achar a primeira falha |
| `INVARIANT_VIOLATION` | nenhum artefato emite | Bug interno; reduzir a reprodução e reportar |
| `EFFECT_WRITES_OWN_SOURCE` | atribuição | Effect escreve o que lê; derivar com memo ou normalizar no setter |
| `EFFECT_RELAY_TEAR` | atribuição | Effect copia sua saída para outro sinal e causa execução intermediária; derivar com memo |
| `IMMUTABLE_UPDATE_IN_STORE` | atribuição | Setter troca contêiner por cópia; mutar o draft ou `reconcile` por chave |
| `UNSTABLE_LIST_IDENTITY` | atribuição | Lista recriou linhas equivalentes; chavear por campo estável ou `reconcile` |
| `SSR_RENDER_ERROR_CONTAINED` | servidor | Falha de render contida; `data.handling` diz como. Corrigir a origem |
| `SSR_ERROR_SANITIZED`, `SERVER_FN_ERROR_SANITIZED` | servidor | Produção trocou o erro pela mensagem genérica; corrigir a falha sem desligar a sanitização |
| `LATE_HEADER_WRITE` | servidor | Cabeçalho depois do envio; em dev lança, fora dele é descartado |
| `SERVER_WRITE` | servidor | Setter durante render de servidor; derivar o estado |

No servidor, achados (`SSR_*`, `LATE_HEADER_WRITE`, `SERVER_FN_ERROR_SANITIZED`, `SSR_ERROR_SANITIZED`, `FRAME_MARKER_CORRUPTED`) existem também no build observe; checagens, só em desenvolvimento. `SERVER_FN_ERROR_SANITIZED` nasce no runtime de server functions e `FRAME_MARKER_CORRUPTED` no cliente de frames.

Fora da união: `FLUSH_IN_ACTION` é exceção lançada em dev por `flush()` no corpo de uma action (no default o dreno é pulado sem erro; observe o resultado depois que a action assentar). `flush()` também lança dentro de `onSettled` ou `createTrackedEffect` ("Cannot call flush() from inside onSettled or createTrackedEffect") e no `apply` de `createEffect` vira no-op com `FLUSH_IN_EFFECT_CALLBACK`; em teste que dispara evento síncrono nesses escopos, drene com `queueMicrotask(() => flush())`. `StatusError` não é export de `solid-js`: leitura imperativa de fonte com erro lança esse invólucro com o original em `cause`; compare `err.cause` por identidade ([erros assíncronos](08-async-loading-errors-and-recovery.md)).

Armadilha: não há lint confiável para leitura reativa depois de `await`, porque `Accessor<T>` é estruturalmente `() => T`. Cubra com revisão e um teste que troque o signal depois do `await` e confira se o memo ou effect assíncrono voltou a rodar. Não traduza todo aviso em falha nem ausência de exceção em correção; corrija a origem e repita com diagnóstico habilitado.

## Diagnósticos de custo

Vêm do gravador de atribuição e descrevem custo, não erro. `HUGE_FAN_OUT` sugere publicação ampla; `WIDE_WRITE` consta na união mas nenhum artefato da rc.9 o emite. `HUGE_FAN_IN` e `WIDE_SCOPE_DEPS` apontam escopo que lê demais. `HOT_SCOPE_RERUNS`, `HOT_SCOPE_FANOUT` e `HOT_SCOPE_TIME` diferenciam frequência, multiplicação e tempo. `UNSTABLE_MEMO_OUTPUT` aponta memo que devolve objeto ou array novo mas shallow-equivalente por `unstableMemos` execuções seguidas (padrão 4; `enable({ unstableMemos: n })` ajusta, `false` desliga; `Promise`, `Date` e `Map` são ignorados). `ASYNC_WATERFALL` indica cadeia observada, não prova paralelismo possível; profundidade 2 é `info`, fora do console.

Receita: nomeie memos e effects investigados; `why(scope)` e `subscriptions(scope)` dão causas e dependências, `costs()` o custo atribuído. Caminhos de owner indicam origem de execução; caminhos de boundary, onde o erro foi tratado. Compare tempo absoluto no profiler do artefato de produção; passes reativos intermediários não provam frame pintado. Leitura: [depuração](https://v2.solidjs.com/guides/debugging-reactivity#something-updates-too-often) e [performance](https://v2.solidjs.com/guides/performance#measure-before-changing).

Com `solid({ diagnostics: true })` no plugin, o dev server expõe `POST /__solid/diagnostics` com `{ method: 'begin' | 'end' | 'whyDidRun' | 'costs' }` para capturar sessões a partir de um teste de browser; dev-only, no-op em produção. Autodetecção de `@solidjs/diagnostics`: o hook `apply` do plugin de diagnostics é suprimido em `mode: 'test'` (o modo do Vitest, inclusive browser mode) e fora de `command: 'serve'`; sem o pacote declarado no `package.json` do app, `transformIndexHtml` não injeta nada nem em dev. `diagnostics: true` explícito dispensa a checagem do `package.json`, sem desfazer a supressão em `mode: 'test'`.

## Erros em produção

`configureClientErrors({ onError })` observa falhas tratadas no cliente; `configureServerErrors({ onError })`, no servidor. Falhas de apply, compute, evento e transporte têm caminhos diferentes; teste o que o monitoramento recebe e registre metadados e correlação sem payloads.

Armadilha: no servidor, o retorno do hook pode virar o valor enviado ao cliente sem nova sanitização; um handler que só registra retorna `undefined`. Falhas de compilador ou runtime e propriedades renomeadas podem aparecer só no artefato construído. Em subprocessos, sinal de término e erro de spawn são falha, não saída zero.

## Checklists de implementação, revisão e aceite

Aplique só as seções do escopo. Cada item é respondido por leitura, teste ou evidência; item não executado fica como não verificado, com motivo.

- [ ] Antes: pacote alvo e versão resolvida do Solid identificados; renderer, compilador, roteador e peers conferidos por versão exata, não por dist-tag; uma só cópia física de `solid-js`, `@solidjs/web` e `@solidjs/signals`; instruções locais e scripts lidos; estado fonte, derivação, efeito externo e mutação separados; fronteira cliente/servidor e ciclo de vida do estado definidos.
- [ ] Reatividade: leituras que atualizam não capturadas no corpo nem por desestruturação de props; nenhuma escrita em componente/memo disfarçada com `untrack`; `createSignal` com função tem intenção derivada; atualizações encadeadas em forma funcional; nenhuma dependência nova lida só no apply.
- [ ] Tipos: JSX e tipos DOM do renderer; guards para arrays vazios, opcionais e índices; dados externos validados sem asserção ampla; sem `any`, `ts-ignore` ou cast para esconder incompatibilidade.
- [ ] Stores e listas: setter síncrono, por função, sem draft escapando; nenhum setter por caminho ou com objeto; sem retorno implícito de `push` como substituição da raiz; store não chamada como accessor; reconciliação por chave ou posição deliberada; `For` com item e índice conforme o modo; keys estáveis e únicas; reordenação preserva foco; `shallow` só com ingestão compatível e medição.
- [ ] Assíncrono: estados para primeira carga, atualização, vazio e falha; leituras assíncronas em escopo que rastreia ou suspende; dependências capturadas antes de `await`; trabalho independente não serializado; `isPending` acompanha o dado certo; `loadingValue` não esconde ausência de resposta como vazio; `refresh` usa a fonte original e sua Promise não é confundida com voo específico.
- [ ] Actions: gerador com `yield` após `await` antes de nova escrita; verdade confirmada antes do fim da sobreposição otimista; rejeição, conflito, duplo clique e respostas fora de ordem tratados; cancelamento e timeout não apresentados como rollback.
- [ ] Efeitos e DOM: todo `createEffect` e `createRenderEffect` com compute e apply, e apply retornando só cleanup síncrono ou `undefined`; sem `createTrackedEffect` novo, `Dynamic` depreciado ou API da [tabela de ausentes](16-migration-from-solid-1.md#apis-do-solid-1-ausentes-na-base) (uso preexistente tratado à parte); ref callback só conecta o elemento; listeners, observers, timers e widgets descartados; eventos e atributos sem prefixos antigos; inputs com `value`/`checked` ou defaults, não misturados.
- [ ] Acessibilidade: rótulos, teclado, foco, erros e pending acessíveis; conteúdo não confiável fora de HTML executável sem sanitização.
- [ ] SSR: estado privado no request; HTML e IDs iguais entre cliente e servidor; lazy nomeado com `export`; APIs browser-only fora do servidor; bootstrap, assets e nonce integrados; stream consumido uma vez; headers e cookies decididos antes do commit; múltiplos `Set-Cookie` sem concatenação por vírgula.
- [ ] Servidor: server function com transformação, manifesto e endpoint real; entrada, sessão, permissão e tenant verificados no servidor; GET não muta e cache autenticado isolado; erros e hooks sem dados privados; server components só com adoção experimental deliberada.
- [ ] Encerramento: tipos, lint e testes pertinentes executados pelos comandos do projeto, com resultados registrados; build de produção e SSR/hidratação verificados quando necessários; diff sem dependências, segredos ou refatorações fora do escopo; resposta diz o que foi e o que não foi validado.

Perguntas adversariais: e se a prop mudar depois de montar? Se a requisição antiga resolver depois da nova? Se o usuário clicar duas vezes antes de `disabled`? Se o item trocar de posição? Se o owner for descartado com a rede aberta? Se dois usuários receberem SSR ao mesmo tempo? Se a server function for chamada sem a UI? Se a build de produção remover os diagnósticos? Sem resposta verificável, não está pronto.

Revisão por evidência: conferir presença da correção na tag, não só status da issue; distinguir Promise de compute e cleanup síncrono; testar resultado obsoleto, descarte e confirmação em ordem invertida; preservar estado visual próprio sem escrever no store otimista alheio; testar identidade do DOM durante streaming; separar reset de boundary, invalidação de cache e retry idempotente; verificar a origem real do cliente antes de prometer server functions entre origens ([riscos](17-known-risks.md)).

## Receitas completas e adaptação

O [catálogo](../examples/README.md) descreve componentes, utilitários e limites. Copie só o exemplo necessário para a pasta da feature, preserve imports e substitua o transporte injetado por implementação real testável; não copie a pasta inteira para `src`.

O componente de tarefas recebe uma API injetada de listagem, criação e conclusão. A criação exige que o servidor aceite e devolva o identificador de correlação fornecido, o que preserva a identidade otimista; backend com outra chave precisa de reconciliação explícita. As decisões de concorrência (reserva por chave de operação, flag otimista por chave, mensagens após o assentamento) estão numeradas no README dos exemplos; a reserva vale para a instância local e não impede outra aba, outro processo ou cliente hostil. O exemplo não traz banco nem endpoint; a API injetada pode ser fetch validado, server function ou transporte existente.

Critérios de teste: contador, atualização encadeada e callback de observação quando a prop muda; contexto, dois providers independentes e ausência de provider; ref, descarte sem listeners pendurados. Na lista de tarefas, controle a Promise de listagem para observar a primeira `Loading`; depois criação otimista, confirmação, falha da gravação, falha da revalidação, envio duplicado, operações sobrepostas por ID e reordenação. Valide dados externos pelo parser e trate erro de validação como falha de fronteira; o parser não autoriza.

Cancelamento e estado local: [operação cancelável](../examples/cancellable-operation.ts) demonstra Promise com resultado discriminado, AbortSignal e vigência; [sincronização externa](../examples/external-sync.ts) liga esse contrato ao effect split sem cleanup async; [lista com estado local](../examples/list-with-local-state.tsx) mantém dados do chamador e seleção própria com owners distintos. Os testes de operação e validação não importam Solid; componentes e fábrica de integração exigem typecheck e execução com os pacotes reais.
