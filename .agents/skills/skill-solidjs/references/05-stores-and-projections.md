# Stores e projections

## Formas públicas

Contrato: `createStore(value, options?)` retorna store gravável e setter. `createStore(fn, seed, options?)` deriva estrutura gravável; fn aceita Promise/AsyncIterable e retorna `[Refreshable<Store<T>>, StoreSetter<T>]`. `createProjection(fn, seed, options?)` retorna só `Refreshable<Store<T>>`. Objetos/arrays reativos não são accessors. Seed pode ser `Partial<T>`: estrutura inicial do draft, sem garantir campos antes da primeira resposta. Promise pendente lança `NotReadyError`; resolução publica granularmente e descarta resposta obsoleta.

Receita:

```ts
const [state, setState] = createStore<State>({ filter: '', tasks: [] })
const openTasks = createProjection<Task[]>(() => state.tasks.filter(task => !task.done), [])
```

Armadilha: payload no formato exibido pede store/projection derivada; memo de fetch com store espelhada duplica sincronização. Seed não é o antigo initialValue de memo. Use store derivada quando precisar sobrescrever manualmente e projection para leitura.

## Setter síncrono e retorno

Contrato: setter recebe apenas callback `(draft) => void | T`. Transação fecha ao retornar; callback/helper async e draft retido violam a janela. Dev acusa `ASYNC_STORE_SETTER`, padrão não tem guard. Escritas antes do primeiro await podem já ter ocorrido; posteriores somem no draft fechado. Diagnóstico não garante rollback; o caso async não tem fixture própria.

Receita:

```ts
setState(draft => {
  const task = draft.tasks.find(item => item.id === id)
  if (task) task.done = true
})
```

Contrato: retorno envolvível substitui raiz: atribuir array em arrow sem chaves transforma toda a store no array; atribuir objeto produz diff raso e apaga chaves ausentes. Outra folha observada passa a undefined, silenciosamente nos dois builds. `push` e atribuição primitiva retornam não envolvíveis e são ignorados pelo runtime, embora tsc estrito recuse esses retornos também. Retorno deliberado, `setTasks(draft => draft.filter(item => !item.done))`, substitui raiz array.

Armadilha: `setState('filter', 'x')`, path array ou objeto direto lança `TypeError: fn is not a function`; `storePath` não recupera contrato antigo. Mutações usam chaves; JS/any/cast perdem proteção. Derivador async é permitido, setter manual async não.

## Reconciliação e identidade

Contrato: retorno comum de objeto reconcilia raiz superficialmente; array comum segue posição/comprimento, sem matching de negócio. `reconcile(value, 'id')` usa chave; função extrai outra chave; null é posicional. Chaves estáveis e únicas. Store derivada reconcilia por chave, id padrão quando aplicável; alinhe identidade com For.

Receita:

```ts
function receiveTasks(tasks: Task[]) {
  setState(draft => { reconcile(tasks, 'id')(draft.tasks) })
}
```

Contrato: encolher três itens para um remove índices excedentes: length 1, índice 2 undefined e `2 in store` false. Troca de slot objeto para array substitui filho/proxy; não mantém sua identidade anterior.

Armadilha: não use objeto de opções de v1. `null` pareia slots mesmo com IDs diferentes; serve à posição física (monitor/dashboard), não a input, seleção ou foco por entidade. Chaves divergentes entre store e For trocam estado local entre linhas.

## Identidade do proxy

Contrato: store entrega proxy distinto do original, estável ao ler/reordenar, refletindo escritas sem alterar original. `indexOf(raw)` retorna -1 e `includes(raw)` false; proxy com proxy funciona. Escrita direta na view fora do setter é ignorada sem erro, preservando store e original.

Receita: compare ID ou proxy: `state.items.findIndex(item => item.id === rawItem.id)`. No draft, `delete draft.key` remove a propriedade; `draft.key = undefined` conserva a chave em Object.keys e no operador in.

Armadilha: `unwrap` não é exportado. Backing interno tem símbolo não enumerável `STORE_OWNER`, invisível a snapshot, traps normais e JSON.stringify; restrito à depuração pontual. Snapshot não promete cópia nova, especialmente antes de qualquer escrita.

## Valores crus

Contrato: objetos plain, arrays e classes de usuário viram proxy. Built-ins como Map/Date, nós DOM e objetos congelados permanecem crus. Mutação no lugar pelo draft altera o cru sem notificar; reatribuição notifica. Objeto congelado mantém a referência original.

Receita:

```ts
setState(draft => {
  draft.filters = new Map(draft.filters).set('status', 'open')
})
```

Armadilha: substitua Date em vez de setTime; valor muito mutável pode ter signal próprio. Set na raiz recebe proxy incompatível com seus slots nativos e `add` lança `Method Set.prototype.add called on incompatible receiver #<Object>` (receptor incompatível); Set aninhado aceita add mas não notifica, então substitua a propriedade. Traps recusam travessia/escrita de `__proto__`, `constructor` e `prototype`; tentativa pelo draft não altera Object.prototype, mas isso não dispensa validação de entrada.

## Projections e granularidade

Contrato: leitura de folha assina a folha; retornar só proxy pai e ler depois fora do tracking não equivale. Projection atende derivação real, sem espelhar por reflexo. Controle entradas rastreadas e evite escrita externa no draft derivado. Com `ssrSource: 'client'`, `seedLoadingValue: true` torna seed commit inicial confirmado durante pendência, evitando suspender toda a subárvore.

Receita: leia `state.user.name` dentro da derivação. Preserve `NotReadyError` para prontidão/retry/Loading, sobretudo SSR. Guarde novo valor localmente ou leia draft para decidir durante escrita.

Armadilha: store comum lida antes do flush entrega valor anterior. Derivada pode entregar recém-escrito e, após `latest` na mesma propriedade, passar a entregar anterior nas escritas seguintes. Assentado/assinantes ficam corretos; evite decidir por essa leitura. Catch genérico que converte pending em vazio quebra o grafo. Projection complexa para filtro de três itens pode custar mais que ajudar.

## Seleção por chave

Contrato: projection por ID notifica só chaves alteradas. Em 50 linhas, seleção de 1 para 7 produziu:

| Estratégia | Derivações | Computes/applies de effect |
| --- | --- | --- |
| comparação em cada effect | 0 | 50/50 |
| memo por linha | 50 | 2/2 |
| projection por ID | 1 | 2/2 |

Receita:

```ts
const [selectedId, setSelectedId] = createSignal(1)
const selected = createProjection<Record<number, true>>(() => ({ [selectedId()]: true }), {})
const isSelected = (rowId: number) => selected[rowId] === true
```

Armadilha: crie sob owner e leia só a chave da linha. A forma draft, apagando anterior e marcando nova, teve o mesmo resultado. Em lista pequena, comparação direta é mais simples. `createSelector` não é exportado.

## Store otimista

Contrato: `createOptimisticStore(value, options?)` e forma derivada `(fn, seed, options?)` são próprias, não wrapper de createStore. Derivador recebe draft e aceita Promise/AsyncIterable. Chave padrão é id; declare outra quando o domínio exigir. Escrita em action aparece imediatamente como tentativa e reverte ou reconcilia com resultado quando assenta.

Receita: leia pelo draft recebido no derivador, não pela store externa fechada no escopo. Mantenha seleção/arraste em store comum separada, juntando com dados recebidos na leitura.

Armadilha: ler store externa pode reintroduzir dependência que a derivação já fornece. Espelhamento desnecessário pode perder dependência da sobreposição otimista; ciclo visual não é o da mutação remota.

## Snapshot e deep

Contrato: `snapshot(store)` lê view plain sem tracking; deep rastreia profundamente e entrega plain. Snapshot pode devolver original antes de escrita, repetir referência e só depois devolver cópia desconectada. Pode representar a view otimista ainda não confirmada.

Receita: trate snapshot como somente leitura; use deep apenas para reagir ao conjunto inteiro.

Armadilha: mutar snapshot antes da divergência pode alterar store por baixo. Não conte com identidade estável, cópia universal, JSON seguro ou remoção de segredos; Map/Date preservados exigem cuidado. Snapshot no compute não assina folhas profundas.

## Shallow

Contrato: `shallow: true` mantém níveis inferiores plain; substitua registro para publicar. Um objeto ingerido fica raw de modo persistente, sem ser simultaneamente profundo noutra store. Proxies já existentes são pulados na marcação e mantêm reatividade na store de origem.

Receita: use em coleção grande/ingestão imutável após medir; polling com objetos novos pode pedir For keyed por ID.

Armadilha: mutar folha não rastreada é silencioso. Não reaproveite objeto entre shallow e profunda esperando ambos os comportamentos nem suponha conversão barata de proxies. Misturar proxy de store com objeto cru já registrado como profundo na mesma ingestão não foi medido e fica sem garantia.

## API pública e comandos de domínio

`storePath` não é export público do core; uma declaração residual do servidor não o torna acessível. Use o setter por draft. `merge` e `omit` criam views de props e não recuperam o setter por caminho.
