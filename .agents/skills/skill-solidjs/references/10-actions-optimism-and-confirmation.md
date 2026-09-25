# Actions, otimismo e confirmação

Contratos do runtime instalado, Solid 2 RC.9. `action` aqui vem de `solid-js`; a função homônima do router tem outro contrato.

## Geradores e reentrada

Contrato: crie o modelo sob owner e invoque a action no handler, tratando sua Promise. Invocação no corpo de componente/root ou no compute de memo/effect lança `ACTION_CALLED_IN_OWNED_SCOPE` em dev. O apply de `createEffect` e `onSettled` permitem invocação; `runWithOwner(null, fn)` serve à integração imperativa, não para disfarçar mutação durante compute. Gerador mantém passos síncronos na transação; `action(async () => ...)` não substitui essa forma. `affects` marca impacto antes da espera e `refresh` obtém o estado autoritativo.

Receita:
```ts
const items = createMemo(() => api.list())
const add = action(function* (text: string) {
  affects(items)
  yield api.add(text)
  yield refresh(items)
})
```

Contrato: gerador async permite inferir resultado com await, mas o código entre await e próximo yield fica fora da transação. Isso inclui escrever e criar `until`, `latest`, memo, effect ou montagem. A expressão de `yield until(...)` é avaliada antes de reentrar: faça yield vazio primeiro.

Receita:
```ts
const save = action(async function* (input: Input) {
  const saved = await api.save(input)
  yield
  setSelected(saved.id)
  yield until(() => items().some(item => item.id === saved.id), { timeout: 10_000 })
})
```

Armadilha: sem yield vazio, confirmação já recebida no store retido pode criar leitor retido, esperando o commit que a própria action bloqueia, até `TimeoutError`. Teste confirmação antes e depois da resposta da mutação. `flush()` dentro da action rejeita com `FLUSH_IN_ACTION` em dev.

## Sobreposição e estado durável

Contrato: `createOptimistic` e `createOptimisticStore` fornecem sobreposição transitória. Derivação mantém fonte autoritativa; toda escrita otimista dentro da action reverte no settle, com sucesso ou falha, inclusive escrita após yield usando resposta servidor. Verdade durável vem da derivação reexecutada por refresh/entrada ou de store comum separada. Escrita otimista fora de action aparece por um flush e reverte ao fim dele. `setOptimistic` não é export da base; use o setter do par.

Receita:
```ts
const [items, setItems] = createOptimisticStore<Item[]>(() => api.list(), [])
const [saving, setSaving] = createOptimistic(false)
const complete = action(function* (id: string) {
  setSaving(true)
  setItems(draft => {
    const item = draft.find(item => item.id === id)
    if (item) item.completed = true
  })
  yield api.complete(id)
  yield refresh(items)
})
```

Armadilha: exemplos documentais que escrevem resposta no otimista após yield não tornam isso persistente. No caso medido, signal/store comuns escritos antes do primeiro yield ficaram invisíveis ao effect externo durante a espera e publicaram mesmo após rejeição da Promise cedida; controle com sucesso publicou o mesmo. Leituras pela própria action após escrita e após yield vazio viram base, inclusive da fonte otimista. Isso não mede exceção no corpo, rejeição após yield posterior nem escrita após reentrada. Não infira sucesso pelo estado final nem rollback de fontes comuns. Snapshot antigo restaurado manualmente pode apagar mudança concorrente válida.

## Indicador de operação e publicação no clique

Contrato: pending observa expressão do grafo; nem toda mutação tem dependência que o botão possa observar. Flag otimista escrita dentro da action aparece no próximo flush e reverte no settle. Signal comum escrito no mesmo tick, antes ou depois da chamada, entra na transação e só publica no settle; escrita independente num tick posterior publica. Para limpar erro/input no clique e mostrar prévia otimista, faça a escrita comum e flush antes da chamada síncrona da action.

Receita:
```ts
const submit = () => {
  const value = text()
  setText("")
  setError("")
  flush()
  void save(value).catch(() => { setError("Falhou") })
}
```

Armadilha: `save(text()); setText("")` retém o texto até o fim. Adiar só a action com await/microtask atrasa a prévia, que ainda estará antiga após o flush do evento. A receita é para handler DOM ou código fora de flush em andamento: em `onSettled`/`createTrackedEffect`, flush lança; no apply, é no-op com `FLUSH_IN_EFFECT_CALLBACK`; na action, `FLUSH_IN_ACTION`. Se o comando nasce nesses contextos, agende o bloco inteiro de escrita, flush e action em `queueMicrotask`. Mensagens de resultado podem ser signals comuns após a Promise; região acessível deve estar montada antes do texto.

## affects, propriedades e latest

Contrato: refresh isolado é silencioso para pending. `affects` antes de refresh na action torna espera visível até assentar. `affects(store, key)` aceita uma chave de slot, não caminho de várias chaves; use nó/folha correto. `isPending(() => store)` só devolve proxy, sem observar campo. Antes do primeiro dado, leitura de propriedade pode lançar NotReadyError; indicador não contém carregamento inicial.

Armadilha: `latest` não filtra toda recarga. Em store derivado assentado, affects global + refresh manteve pendentes leitura comum e latest. Com edição otimista + `affects(store, 0)`, apenas leitura comum da primeira linha ficou pendente; latest e segunda linha não. Edição otimista sem affects não ativou indicadores. Isso prova slot de array, não isolamento de duas propriedades da mesma linha. Não marque aplicação inteira por mudança em uma linha.

## Três esperas

Contrato: `resolve(expression)` retorna leitura assentada; refresh aguardado retorna próximo estado assentado da invalidação, incluindo supersessão; until espera condição autoritativa correlacionada com timeout/cancelamento. Refresh resolve mesmo com valor igual sem notificação comum. Dentro da action, pode entregar valor autoritativo staged sem esperar commit bloqueado pela própria action. Para accessor otimista, valor resolvido é autoritativo enquanto leitura direta vê sobreposição; para store, resolve o próprio nó, e leitura pelo proxy ainda vê sobreposição. A garantia de não devolver sobreposição refere-se ao valor resolvido, não ao proxy lido depois.

Armadilha: a janela inicial de `loadingValue` permite refresh resolver com provisório antes do dado real. Until não confirma pela própria sobreposição; falsy continua esperando, erro/timeout/abort rejeita. Uma ID já presente, ausência em página parcial ou contador alterado por outro cliente não confirma sua mutação. Use ID de correlação ou versão, compartilhada pela reconciliação e teste. Refetch após resposta confirmada normalmente basta; until serve quando confirmação vem por fonte viva independente. Teste confirmação precoce, tardia e de outra operação: timeout só limita condição errada.

## Operações concorrentes

Contrato: dois cliques podem ocorrer antes de disabled publicar. Para serialização local use guard imperativo; para paralelismo, chave por entidade. Defina serialização, última escrita vencedora ou versão com conflito no domínio. Setters privados e comandos nomeados impedem sobreposição sem confirmação. Não use fila global para registros independentes nem booleano global para múltiplas operações.

Receita: no exemplo de tarefas, `Set` comum reserva `form` e `task:<id>` para criação e `task:<id>` para conclusão antes da action. Recusa síncrona aparece em status acessível. Flag otimista por chave alimenta disabled/aria-busy; nova linha fica bloqueada enquanto servidor não conhece a ID. Concluir A enquanto B é criada permite ambas, mas revalidar fonte compartilhada pode assentar ambas juntas na tela: Promise de A terminou após seu refresh, enquanto valor/flag de A esperaram B.

Armadilha: fim da Promise não garante DOM confirmado. Use ID estável cliente quando permitido ou correlação explícita; trocar chave temporária sem reconciliar desmonta linha, perde foco ou duplica entidade. Resposta obsoleta descartada não cancela efeito servidor. Backend ainda exige precondição, versão, transação ou chave idempotente.

## Publicar confirmação de uma action sobreposta

Contrato: confirmação escrita dentro da action, depois do yield, espera as outras sobrepostas. Escrita após a Promise da própria action publica imediatamente, com guarda de ordem. Passe Promise já criada para gravar uma vez. Se esperar todas é a UX desejada, escrita dentro continua correta.

Receita:
```ts
type Submission = { text: string; response: Promise<string> }
const execute = action(function* ({ text, response }: Submission) {
  setPreview(text)
  yield response
})
let generation = 0
let confirmedGeneration = 0
const save = async (text: string) => {
  const current = ++generation
  const response = api.save(text)
  await execute({ text, response })
  const canonical = await response
  if (current > confirmedGeneration) {
    confirmedGeneration = current
    setConfirmed(canonical)
  }
}
```

Armadilha: sem guarda, resposta antiga pode sobrescrever confirmação nova. Mantenha intenção persistente, rascunho e flag transitória separados; não transforme todo signal visual em otimista.

## Gravação, revalidação e falhas

Contrato: validação, conflito e permissão podem retornar domínio tipado; infraestrutura pode rejeitar. Defina apresentação pública, retry e retenção do rascunho. Rejeição de Promise cedida entra no gerador por throw. `throw` dentro de `async function*` de action rejeita a Promise retornada sem travar, direto ou depois de um `await` interno. Gravação confirmada seguida de refresh falho deve produzir resultado próprio e não repetir a gravação.

Receita:
```ts
yield api.save(input)
try {
  yield refresh(items)
} catch {
  return { saved: true, refreshed: false }
}
return { saved: true, refreshed: true }
```

Armadilha: `void action()` não trata rejeição. Não exponha mensagem bruta de servidor. No exemplo, falha de refresh informa que salvou sem atualizar lista, limpa rascunho salvo e mantém Errored da lista; falha de gravação preserva campo, remove linha otimista e não refaz lista. Na base, escrever sobreposição de store derivado e falhar seu refresh provoca outra execução da derivação no settle, sem pedido da aplicação; sem escrita otimista, não. Essa leitura extra pode recuperar lista sem reset. Conte requests com essa regra, sem generalizar a versões futuras.

Contrato: descarte de tela/abort não desfaz confirmação tardia do backend; próxima leitura deve convergir. Teste ausência de assinaturas/escritas em owner morto. Compensação exige conhecimento de versão/intenção, não catch genérico. Fixe dado confirmado e indicador coerentes, não contagem histórica de commits; duplicação ou assinaturas crescentes pedem reprodução local antes de atribuir ao modelo ou aos riscos R01/R02.
