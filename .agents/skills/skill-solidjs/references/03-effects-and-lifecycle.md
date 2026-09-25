# Effects e ciclo de vida

## Compute e apply

Contrato: `createEffect(compute, apply, options?)` rastreia no compute; apply recebe o resultado, lê sem rastrear, escreve e sincroniza sistemas externos. Devolva cleanup síncrono para liberar antes do próximo apply e no descarte. Apply roda a cada reexecução mesmo com resultado igual: `EffectOptions` não tem `equals`. Com 50 linhas comparando seleção, houve 50 applies; memo por linha reduziu a 2.

Receita:

```ts
createEffect(
  () => ({ channel: props.channel, active: props.active, transport: props.transport }),
  ({ channel, active, transport }) => {
    if (!active) return
    const subscription = transport.subscribe(channel)
    return () => subscription.cancel()
  }
)
```

Armadilha: dependência lida só no apply não reinscreve. Retornar proxy pai e ler folhas no apply perde a assinatura das folhas; extraia os campos no compute ou use `deep(store)` deliberadamente, pagando pela assinatura ampla. Um effect que apenas copia signal para outro deve virar derivação. Effect atende title, storage, métricas, sockets e integrações. Sem apply, dev lança `MISSING_EFFECT_FN`; trabalho único sem leitura pode ser chamada direta. Apply async devolve Promise e disponibiliza limpeza tarde demais; preserve cancelador síncrono e trate rejeição.

## Owner por fase

Contrato: apply de `createEffect` tem owner null. Compute e apply de `createRenderEffect` têm owner. `onSettled` expõe owner, mas proíbe criar primitivas. Memo criado no apply pode funcionar sem aviso em dev, porém nasce sem dono.

Receita: capture `const owner = getOwner()` no setup. Se subscribe exige owner e retorna cancelador, devolva-o via runWithOwner. Se devolve objeto, envolva `unsubscribe` numa função. Se a biblioteca usa `onCleanup` internamente, dê a cada execução seu próprio root:

```ts
const owner = getOwner()
createEffect(source, current => runWithOwner(owner, () =>
  createRoot(dispose => {
    current.subscribe(receive)
    return dispose
  })
))
```

Armadilha: `onCleanup` no apply não roda e dev avisa `NO_OWNER_CLEANUP`. Reentrar só no owner do componente mantém A e B assinadas até desmontar; root por execução remove A na troca e B no descarte. Primitivas ficam no setup.

## Retorno do apply

Contrato: só função de cleanup ou undefined são retornos válidos. Setter retorna valor escrito; `push`, `Map.set` e chamadas similares também devolvem valores.

Receita:

```ts
createEffect(source, value => {
  updateExternal(value)
})
```

Armadilha: arrow sem chaves pode transformar retorno em cleanup. Dev lança no primeiro apply "Callback do effect retornou cleanup inválido; retorne função ou undefined" (`effect callback returned an invalid cleanup value. Return a cleanup function or undefined.`). Padrão guarda o valor e falha na próxima execução com "não é uma função". Sem reexecução, dispose lança TypeError síncrono sem halt. Durante execução sem boundary, ambos os builds param todas as raízes com `REACTIVITY_HALTED`; escritas seguintes são ignoradas e registradas. Sob `createErrorBoundary`/`Errored`, fallback recebe a falha sem parar o grafo. Tsc estrito recusa o retorno, mas JS, any e casts perdem a proteção.

## Erros por fase

Contrato: `{ effect, error }` no lugar de apply recebe em error falhas do compute/upstream, incluindo rejeições async. Falha de compute sem handler num effect não renderizador é registrada, pula apply e mantém o sistema. Falha no apply vai ao boundary ou provoca halt. O braço error não captura indiscriminadamente erros de apply.

Receita: trate falha esperada do apply com try/catch local. Handler recebe erro original, escreve estado e observa assentado: recuperação antes da fase imperativa pode executar sucesso, e transação retida adia o handler. Relançar escala para boundary/halt. Resultados esperados de domínio não devem expor detalhes internos. Consulte o [contrato de EffectBundle](https://v2.solidjs.com/reference/solid-js/reactivity/create-effect#effectbundle) com essa separação de fases.

Contrato: falha de compute não limpa automaticamente a última inscrição válida. `error(error, cleanup)` permite liberá-la explicitamente; sem chamar cleanup, ele aguarda o próximo apply ou descarte. Cleanup anterior que lança antes do novo apply participa do mesmo tratamento desse apply.

Armadilha: decida se a integração conserva inscrição durante falha. `REACTIVITY_HALTED` é consequência da primeira falha não contida; não há recuperação pública. `resetErrorHalt` é interno a testes, apesar do export: escrita durante halt pode se perder e atrasar a próxima publicação.

## onSettled

Contrato: cada registro dispara uma vez após assentamento, sem assinatura contínua. Agende no corpo proprietário para widget, medição ou observer. Retorne cleanup; não crie primitivas nem registre onCleanup no callback. `createMemo` ali lança `PRIMITIVE_IN_FORBIDDEN_SCOPE` em dev.

Receita:

```ts
function createObservedRef(onWidth: (value: number) => void) {
  let element: HTMLElement | undefined
  onSettled(() => {
    if (!element) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) onWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  })
  return (value: HTMLElement) => { element = value }
}
```

Contrato: use a fábrica sob owner, callback no ref e APIs browser só no cliente. A receita supõe elemento estável; trocar elemento exige liberar o recurso anterior. Agendamento imperativo sem owner notifica assentamento, mas não promete cleanup do componente. Setup dentro de outro onSettled perde o lifecycle necessário: dev acusa `SETTLED_CLEANUP_UNOWNED`, produção ignora o retorno.

Armadilha: async devolve Promise, dev lança cleanup inválido e, sem boundary, halt. `onMount` não é exportado; setup com cleanup pode usar `createEffect(() => {}, () => { ... })`; trabalho único pós-assentamento usa onSettled. Escritas no callback continuam no mesmo flush, mas leituras ainda veem o assentado anterior; atualizadores compõem. `flush()` ali lança em dev; dentro de apply é aviso/no-op.

## Descarte e primitivas avançadas

Contrato: `onCleanup` continua nos escopos proprietários; APIs imperativas podem exigir retorno de cleanup. Memo após dispose devolve último commit sem recalcular, mesmo mudando fonte; termine leituras antes do descarte. Ordem entre cleanups de componentes pai/filho difere entre builds.

Receita: reserve `createRenderEffect`, também split, a bindings e integrações de renderer. Ele participa do render e a leitura async pendente retém a transição como os bindings JSX. `createReaction` precisa ser armada novamente; confira seu contrato antes de construir primitiva.

Armadilha: `createTrackedEffect` é depreciado, com limitações de transição e leituras/escritas no mesmo flush; não use em código novo. `untrack(fn, label)` com string emite `STRICT_READ_UNTRACKED` em dev quando fn lê diretamente um reativo. O aviso não existe automaticamente para toda leitura sem tracking; rótulo serve a primitivas personalizadas.

## Async tardio e SSR

Contrato: trabalho async imperativo exige cancelador síncrono e guarda de vigência antes de aplicar resultado. Tipo que aceita async em `onCleanup` não torna o retorno síncrono; apply e onSettled são recusados pelo tsc estrito. Para criar primitivas após espera, capture owner no setup e confira `owner && !isDisposed(owner)` imediatamente antes de reentrar. O runtime avisa owner descartado mas ainda executa callback. `isDisposed` inclui owner marcado para descarte; não cancela operação externa nem propaga contexto através de await.

Receita: cancele a operação e ignore resultado obsoleto; se dado será renderizado, prefira fonte async do grafo. No servidor, effect executa compute para expor prontidão/`NotReadyError`, mas nunca apply; `ssrSource: 'client'` pula até compute. Para aplicação durante SSR, `createRenderEffect` requer `options.defer` explícito.

Armadilha: owner marcado pode ainda ter DOM retido e cleanup adiado por action. Em Chromium, trocar ramo de Show marcou owner antes de remover DOM; no commit, ramo novo entrou e cleanup ocorreu uma vez. Isso não mediu recomputações do ramo retido. Guarda de owner não comprova remoção nem cleanup concluído. DOM global no compute normal quebra SSR.

