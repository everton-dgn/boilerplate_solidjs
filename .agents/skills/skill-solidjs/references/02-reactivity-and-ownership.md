# Reatividade e ownership

## Fonte, derivação, owner e observador

Contrato: fonte guarda/produz estado; derivação calcula; owner controla vida/contexto/limpeza; observador rastreia. Owner não implica tracking, e `untrack` mantém o owner. Componente monta uma vez; JSX, memos e compute rastreiam. Callbacks estruturais também não reexecutam a cada atualização.

Receita: leia `props.name` no JSX ou em accessor/memo. Use memo para cálculo relevante, compartilhado, igualdade ou fonte async, sem encapsular toda concatenação trivial. Getter de objeto preserva leitura se o consumidor o acessar sob tracking. Confira quem rastreia, onde escreve, quem descarta e o que espera (confirmado, pending, rede ou DOM).

Armadilha: copiar/desestruturar props no setup congela o valor. Leitura em evento não assina; criar memos/effects por evento repete primitivas fora do lifecycle.

## Escolha da primitiva

Contrato: `createSignal(value)` guarda estado independente; `createMemo(fn)` deriva leitura; `createSignal(fn)` permite sobrescrita temporária; store permite escrita por propriedade; projection deriva estrutura sem setter; optimistic guarda tentativa transitória; effect sincroniza sistema externo. Seleção granular pode usar projection por ID.

Armadilha: mantenha essas primitivas sob o owner apropriado. `Accessor<T>` é `() => T`; `SourceAccessor<T>` também identifica a fonte, necessária para `refresh`. Encapsular numa função qualquer perde essa identidade. Setter retorna o valor escrito: apply com arrow sem chaves pode recebê-lo como cleanup inválido. Evite signal espelhado para derivação.

## Escritas e pureza

Contrato: setters, actions e `refresh` pertencem a handlers, passos de action, apply de effect ou `onSettled`, fora dos corpos de construção/computação. Em dev, signal externo ou local escrito no corpo de root, `untrack` desse corpo, compute de memo, componente, children de contexto ou setter de store na raiz lança `REACTIVE_WRITE_IN_OWNED_SCOPE`. Guard não para effect independente. O topo de `render` também é construção no runtime, sem caso próprio.

Receita:

```ts
createRoot(() => {
  const [ready, setReady] = createSignal(false)
  onSettled(() => { setReady(true) })
  return ready
})
```

Contrato: apply, `onSettled` e código após o retorno de `createRoot` podem escrever. `ownedWrite: true` existe só em `SignalOptions`, permite escrita até em compute de memo e deve ficar restrito à infraestrutura; `StoreOptions` contém `name` e `shallow`, sem essa exceção.

O guard depende do motor resolvido: no cliente dev, escrita no root lança; no padrão, passa silenciosamente; no servidor, registra `SERVER_WRITE`. Misturar core e motor de builds diferentes pode deixar `DEV` indefinido com guard ativo, ou expor core dev sem o guard. A condição de exportação `test` não equivale ao modo test do Vitest; confira a [postura do runner](../../skill-solidjs-testing/references/vitest-config.md#canário-de-postura).

Armadilha: silêncio e `DEV` indefinido não provam conformidade. `untrack(accessor)` equivale a `untrack(() => accessor())` e não autoriza escrita.

## Microtasks e flush

Contrato: escritas síncronas agrupam e publicam no flush. No handler, ler logo após setter retorna o valor anterior. Atualizadores compõem; `flush()` drena e `flush(fn)` também devolve o retorno de `fn`, como `42`. `batch` não é exportado.

Receita:

```ts
function incrementTwice() {
  setCount(value => value + 1)
  setCount(value => value + 1)
}
```

Armadilha: guarde o próximo valor localmente para decisões imediatas. Não faça flush por tecla, para liberar action ou no apply. Timer não prova assentamento de grafo/action/rede; espere observável.

## Escrita retida numa transição

Contrato: render effect lendo fonte async tornada pendente pela escrita retém o commit até a resposta. Bindings JSX usam render effect; prova usa primitiva direta, sem JSX. Nos dois builds, após flush, handler lê confirmado, `latest(source)` lê valor em voo, `isPending(() => data())` é true e effects que só leem o signal também esperam. Resposta superada não publica: para IDs 1, 2, 3, com 3 resolvendo antes de 2, só `1:one` e `3:three` aparecem.

Receita:

```ts
function select(nextId: number) {
  setId(nextId)
  report(nextId)
}
```

Armadilha: `report(id())` ainda usa o confirmado durante retenção. `latest` não confirma chegada e lança `NotReadyError` se a fonte nunca resolveu; depois da resposta entrega o valor. Se apenas `createEffect` lê o async, a escrita não fica retida: effects de ID publicam cada passo e só o leitor async espera, sem par rasgado `2:one`.

## Dependências condicionais

Contrato: `createMemo(() => useA() ? a() : b())` assina as leituras daquela passagem. B inativo não recomputa; ao alternar, A deixa de disparar; ao voltar, lê A atualizado, inclusive escritas feitas enquanto inativo.

Receita: leia cada entrada dentro do ramo que realmente precisa dela e mantenha observador externo ao medir recomputações.

Armadilha: ler A e B antes do ternário assina ambos. Medição cobre passagens síncronas sem erro, não remoção de dependências em suspensão/falha. Contagem não prova performance/Show/DOM/SSR.

## Derivação gravável e função armazenada

Contrato: `createSignal(() => props.value)` cria derivação gravável. Escrita manual vale até mudar a origem: `source() * 2`, sobrescrito por 99, volta a 4 quando source vira 2. Para fotografia inicial, calcule uma vez com `untrack` quando necessário. Derivação evita I/O imperativo, inscrição e escrita externa.

Receita:

```ts
const initial = () => 'initial'
const [execute, setExecute] = createSignal<() => string>(() => initial)
function replace() { setExecute(() => () => 'next') }
```

Contrato: `execute()` retorna a função e `execute()()` a executa. Segundo argumento derivado é options, não initialValue posicional. `{ loadingValue: 7 }` oferece provisório sem declarar prontidão; sem ele, Promise pendente lança `NotReadyError` e deve ser lida sob Loading. `createSignal(() => pendingPromise, 7)` falha no tipo com TS2769.

Armadilha: `createSignal(() => window.innerWidth, { ssrSource: 'client' })` ativa o gate cliente; primeiro argumento literal ignora `ssrSource`, pois não há compute a adiar. Sem loadingValue, servidor permanece em `NotReadyError` até assentar hidratação; use Loading ou provisório não nulo apropriado. Essa função inicial não é inicializador único de React.

## Memo, igualdade e lazy

Contrato: `createMemo(compute, options?)` recebe opções no segundo argumento. Compute pode receber valor anterior, ausente inicialmente sem provisório. `loadingValue` define provisório explícito; não acrescente undefined para disfarçar leitura fora de Loading. `equals` não roda no commit inicial; a partir da segunda execução compara valores concretos anterior/novo. Não detecte primeira execução por `previous === undefined` no comparador; por exemplo signal 0 atualizado para 1 compara `(0, 1)`.

Receita: ponha memo antes do effect para cortar applies iguais, pois effects não têm `equals`. Use nomes estáveis em `createSignal`, `createMemo` e `createEffect`; `name` aparece em attribution/`whyDidRun` e pilha de escrita em dev/observe.

Contrato: memo lazy adia até a primeira leitura e perde a computação ao perder o último assinante; leitura posterior recalcula do zero. Não lazy vive até descartar owner. Consumidor em outra raiz não transfere ownership. O caso lazy após descartar criadora com consumidor vivo noutra raiz segue sem fixture/não verificado. Cache exige chave/escopo/expiração; derivação tolera reexecução/descarte/supersessão.

Armadilha: igualdade ignorando campos congela UI; equals false pode aumentar trabalho. Lazy não é cache permanente nem local para efeito único. `sync: true` declara compute exclusivamente síncrono; os tipos dizem que Promise/AsyncIterable ficam crus e classificam esse uso como indefinido, sem nova prova de runtime.

## Leituras assíncronas

Contrato: memo aceita Promise/AsyncIterable e seu accessor representa valor resolvido. Só leituras anteriores ao primeiro await rastreiam; leitura posterior vê valor atual mas não reexecuta o memo quando muda. Outra dependência pode disparar releitura atualizada.

Receita:

```ts
const summary = createMemo(async () => {
  const userId = id()
  const currentRole = role()
  const user = await fetchUser(userId)
  return `${user.name}:${currentRole}`
})
```

Armadilha: primeira leitura de fonte async ainda pendente após await gera em dev "Leitura de fonte assíncrona não resolvida após await" (trecho literal: ``Read of an unresolved async source after an `await` ``); no padrão deixa o dependente preso. `isPending` é false em todos os caminhos abaixo, portanto não detecta a trava. `await accessor()` não estabelece tracking; `.loading` de `createResource` não pertence a esse contrato.

| Leitor | Desenvolvimento | Padrão |
| --- | --- | --- |
| effect sem error | console.error, pula rodada, sem halt | não publica nem acusa |
| effect com error | erro no braço error | não publica nem acusa |
| render effect sob boundary | fallback, irmão da fonte resolvida publica | ambos deixam de publicar |
| render effect sem boundary | halt, rejeição não tratada, todas as raízes param | ambos deixam de publicar, sem halt |

Contrato: `Errored` usa `createErrorBoundary` com fallback. Leia entradas antes do await, inclusive ao iniciar requisições independentes em paralelo.

## Ownership e descarte

Contrato: root fornece disposer e, sob outro owner, é filho descartado com o pai. Guardá-lo globalmente não o desvincula. A assinatura aceita options com `id` e `transparent`, sem `detachedOwner`. Infraestrutura independente usa `runWithOwner(null, () => createRoot(...))` e assume descarte próprio.

Receita: crie recursos sob dono que viva o tempo necessário. Após await, não presuma owner ambiente; reentrada não cria tracking. Confirme vigência antes de reutilizar owner. Servidor compartilhado: não ponha usuário/sessão/tokens/cache privado em signals de módulo.

Armadilha: throw no callback de criação antes de devolver disposer não descarta automaticamente a raiz parcial nem executa seu onCleanup. Não adquira recurso antes de trecho que pode lançar. Owner descartado reutilizado pode vazar e gerar erro estrutural.

## Ordem de cleanup e hidratação

Contrato: no mesmo owner, cleanup é FIFO. Owners filhos, inclusive roots e memos, descartam antes dos cleanups do pai. Componente ganha root próprio em dev, mas compartilha owner do pai no padrão: pai registra antes/depois do filho e resulta em `child, parent-before, parent-after` em dev, contra `parent-before, child, parent-after` no padrão. O runtime instalado não oferece a mudança futura para LIFO nem a correção futura de reentrada; a reentrada duplicada não foi reproduzida nele.

Receita: cleanups independem dessa ordem. Se a dependência for obrigatória, libere explicitamente o outro recurso ou use root filho, que descarta antes do pai nos dois builds. Registrar primeiro o cleanup do pai não resolve.

Armadilha: `untrack` não isola contexto de hidratação. Escrita seguida de leitura no setup pode entrar no snapshot e provocar replay estrutural; não combine `ownedWrite` e releitura imediata para fabricar seed de outra fonte.

## APIs retiradas

Consulte o [mapa de migração](16-migration-from-solid-1.md#apis-do-solid-1-ausentes-na-base). Imports do motor ou aliases não recuperam o contrato público antigo.
