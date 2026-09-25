# Diagnósticos e reparo

Base: `solid-js` e `@solidjs/web` 2.0.0-rc.9. Como testar (Vitest, assentamento, fake timers, montagem, oráculos, captura de avisos) fica na skill `skill-solidjs-testing`.

## Onde os diagnósticos aparecem

Contrato: o pacote `solid-js` instalado inclui `CHEATSHEET.md` e a skill oficial `skills/reactivity-diagnostics/SKILL.md`, com uma seção por código. `DEV` existe no artefato de desenvolvimento; `OBSERVE`, nos de desenvolvimento e observação; ambos são `undefined` no build default. Canal: `error` indica comportamento quebrado e `warn` código que funciona mas está errado ou caro; eventos `info` ficam só no canal estruturado, sem console (um spy de `console.warn` não os vê); listeners rodam de forma síncrona na emissão; o primeiro relato de cada código leva um rodapé com o guia de reparo, uma vez por código e por instância do módulo.

`solid-js/attribution` resolve o gravador em development e observe e uma implementação inerte no default. `attribution.enable` existir não prova gravação: confira `OBSERVE.attribution.installed` e um registro produzido por interação controlada, e desabilite no fim ([AttributionSlot](https://v2.solidjs.com/reference/solid-js/advanced/diagnostics-dev-hooks/observe#attributionslot)). Use a superfície pública de `OBSERVE`, sem nós privados. `@solidjs/diagnostics` captura evidência para testes; confira os exports instalados antes de importar helpers.

Armadilha: silêncio no build default não prova ausência de problema. Confirme as condições de exportação que o runner ou bundler resolveu antes de interpretar o console.

## Diagnósticos de corretude e reparo

Consulte o código no guia instalado e confira as [divergências documentais](16-migration-from-solid-1.md#divergências-encontradas-na-própria-documentação). Os casos que merecem atenção adicional:

| Código | Armadilha |
| --- | --- |
| `REACTIVITY_HALTED` | É consequência da primeira falha não contida; afeta outras raízes |
| `REACTIVE_WRITE_IN_OWNED_SCOPE` | `untrack` não libera escrita em construção ou compute |
| `RUN_WITH_DISPOSED_OWNER` | O aviso não impede a execução; confira `isDisposed(owner)` antes de reentrar |
| `INVALID_REFRESH_TARGET`, `INVALID_AFFECTS_TARGET` | Wrapper de accessor e propriedade arbitrária não preservam a identidade da fonte |
| `SERVER_WRITE` | Em teste de reatividade cliente, pode denunciar build servidor carregado por engano |
| `INVARIANT_VIOLATION` | Consta na união, mas nenhum artefato da base o emite |

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
