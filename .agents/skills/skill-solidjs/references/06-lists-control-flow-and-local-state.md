# Listas, fluxo e estado local

## For e identidade

Contrato:

| Modo | Item no callback | Índice | Identidade |
| --- | --- | --- | --- |
| padrão/true | valor | accessor | item |
| false | accessor | número | posição |
| função de chave | accessor | accessor | chave |

Receita:

```tsx
<For each={tasks}>{(task, index) => <p>{index() + 1}: {task.title}</p>}</For>
<For each={tasks} keyed={false}>{(task, index) => <p>{index + 1}: {task().title}</p>}</For>
<For each={tasks} keyed={task => task.id}>{(task, index) => <p>{index() + 1}: {task().title}</p>}</For>
```

Contrato: store array direto; signal/memo usa `each={tasks()}`. Keying fixo por instância. Padrão preserva identidade por referência/reconciliação; chave personalizada, entidade com novos objetos; posicional, slot. No keyed por referência, mutação de propriedade no objeto cru sem trocar referência não atualiza nó; use store granular ou nova referência.

Armadilha: não chame item padrão nem índice posicional como função; não alterne overloads com booleano dinâmico. Chave estável/única vem do domínio, nunca random/posição reordenável; `key` de React não controla componentes arbitrários. Fallback de For significa lista confirmada vazia. Primeira leitura pendente vai a Loading, sem fallback de vazio.

## Foco ao reordenar

Contrato: keyed preserva nó e estado local, mas mover o nó focado perde foco em happy-dom e Chromium; se outro nó se move, foco pode permanecer. Restaure ativo no handler após flush.

Receita:

```tsx
function reorder(nextRows: Row[]) {
  const active = document.activeElement
  setRows(nextRows)
  flush()
  if (active instanceof HTMLElement && active.isConnected && document.activeElement !== active) active.focus()
}
```

Armadilha: queueMicrotask deixa intervalo sem foco quando outro código/teste drena sincronicamente antes; sem esse flush, auto-flush ocorre antes da microtask e restauração adiada funciona. Receita síncrona funciona com action pendente em outra linha e each otimista: reordenação comum aplica no flush e não move novamente ao assentar. Cursor/seleção não foram medidos; guarde selectionStart/selectionEnd se necessário. Teste mover, inserir no início, excluir no meio e atualizar mesma chave com input/estado local.

## Callback estrutural, Show e Repeat

Contrato: corpos de For e Show não keyed rodam uma vez por item/ramo, sob owner sem tracking. Leituras de índice ou `current().name` no topo congelam valor e dev emite `STRICT_READ_UNTRACKED` por callback, rotulado For/Show; produção fica silenciosa. JSX/memo/effect mantêm leitura viva. Match usa o mesmo caminho, sem teste próprio.

Receita:

```tsx
<For each={rows()}>{(row, index) => <li data-index={index()}>{row.id}</li>}</For>
<Show when={user()}>{current => <p>{current().name}</p>}</Show>
```

Contrato: Show não keyed entrega accessor estreitado e conserva nó ao trocar objeto; keyed entrega valor e recria ramo quando identidade muda, afetando cleanup/estado/custo. Switch escolhe primeiro Match truthy; defina prioridades e fallback. Match também distingue chave/accessor. Ternários simples continuam úteis, sem converter toda condição de atributo em Show.

Contrato: Repeat renderiza contagem sem diff de coleção, índice numérico estável. `from` define janela `[from, from + count)`, com reuso documentado das entradas mantidas, mas janela não foi testada em runtime. Trate `items[index]` ausente e não capture folha reativa no corpo.

Armadilha: lista vazia truthy não representa carregamento. Repeat atende slots/quantidade, não substitui For de entidades reordenáveis.

## Loading, Errored e Reveal

Contrato: Loading delimita prontidão, Errored falhas; fallback de erro recebe accessor, reset é ação de interação, nunca render. Reveal coordena irmãos: sequential padrão, together espera grupo, natural segue prontidão individual. Collapsed só atua no sequencial; demais modos o ignoram. Não use props antigas de SuspenseList nem together booleano.

Receita: com três Loading a/b/c resolvendo c, a, b, espere:

| Modo | Início | Após c | Após a | Após b |
| --- | --- | --- | --- | --- |
| sem Reveal | três fallbacks | só c pronto | não medido | não medido |
| together | três fallbacks | igual | igual | todos |
| sequential | três fallbacks | igual | a pronto | todos |
| sequential collapsed | fallback a, b/c vazios | igual | a pronto, fallback b, c vazio | todos |

Armadilha: cauda collapsed oculta até conteúdo já pronto; together libera quando cada slot direto tem primeiro conteúdo. Reveal natural interno pode esperar grupo sequencial externo. SSR progressivo exige streaming: gerar string inteira antes de enviar elimina progressão. Teste shell, fragmentos e hidratação, não apenas HTML final.

## Componentes dinâmicos e lazy

Contrato: `dynamic(() => source)` de web fabrica componente de tag/componente/fonte compatível, inclusive async. Crie no corpo proprietário, callback estrutural de linha ou módulo realmente constante/global; não a cada leitura. Dynamic/DynamicProps continuam depreciados. `{ static: true }` lê uma vez sem tracking e recusa Promise; `isStatic` é avançado para bibliotecas.

Receita:

```tsx
const Tag = dynamic(() => props.level)
const Panel = lazy(() => import('./Panel'), { export: 'Panel' })
return <Tag>{props.title}</Tag>
```

Armadilha: lazy padrão seleciona default; nomeada usa opção export. `.then(module => ({ default: module.Panel }))` perde identidade de módulo para hidratação. Use preload para antecipar; não invente parâmetro de identidade reservado ao compilador. Namespace de módulo não equivale à exportação. Loader/compilador coerentes em cliente/SSR.

Contrato: `lazy()` compartilha a Promise do import entre todas as instâncias que apontam para a mesma fábrica. Desmontar a primeira instância antes do import resolver não cancela nem corrompe essa Promise: a segunda instância ainda renderiza quando ela resolve, e a fábrica roda uma única vez.

## ClientOnly e Portal

Contrato: clientOnly/web impede import no servidor; mostra fallback SSR, trocado após assentar hidratação. Import compartilhado; lazy true adia ao render, browser padrão pode iniciar na criação. Portal: ilha cliente, sem conteúdo SSR; hidratação monta após assentar. Dados iniciados nele começam no cliente e podem exigir Loading própria; dados de SSR precisam nascer acima da ilha.

Receita: use clientOnly para módulo que acessa browser já no import. Deixe mount padrão de Portal quando document.body não puder ser avaliado no SSR.

Portal conserva o contexto e a propagação delegada da árvore lógica. O descarte remove só seus nós, preservando o conteúdo anterior do alvo; observado no Chromium cliente.

Armadilha: if depois do import não evita efeito de módulo. Portal não lança necessariamente no servidor. Ler props.children em when de Show constrói árvore extra e Portal duplicado; use `<Show when={condition()}>{props.children}</Show>`. Na construção medida, descarte limpou ambas as instâncias sem vazamento. Portal em happy-dom, hidratação, ShadowRoot e foco não foram testados; contexto/limpeza cliente não provam esses casos.

## Estado visual por identidade

Contrato: seleção, foco, medidas e arraste têm dono/ciclo próprios. Leia campos de negócio da fonte recebida e mantenha estado visual em store comum por ID, juntando na leitura. Sobreposição otimista termina com transação. Não precisa detectar família interna da store.

Receita: receba props de leitura e callbacks específicos com entrada/falha, sem setter inteiro. Função reativa exige Accessor; For por ID preserva linha com novos objetos. Prefixe chave do dicionário para impedir que `__proto__` seja interpretado como protótipo; valide IDs e unicidade mesmo assim.

Armadilha: readonly restringe TS, sem congelamento/sandbox/validação. Não faça cast de store para draft nem introspecção de `$REFRESH`/`_firewall`. Copiar coleção inteira para outra store pode desconectar a sobreposição; guardar seleção na optimistic faz sua vida depender da transação. Estado separado não resolve conflitos entre clientes nem ordem de confirmação distribuída.

## Exclusão, sessão e integração otimista

Filtrar ou paginar não prova exclusão de uma entidade. A duração da seleção por ID é independente da presença da linha e da transação otimista.

Receita: teste título otimista/rollback mantendo seleção, novos objetos do mesmo ID e reordenação por registro. Para estado visual imediato, escreva e faça flush antes de chamar action, no mesmo handler. Adiar action atrasa prévia otimista.

Armadilha: signal/store comum escrito no mesmo tick da chamada aguarda assentamento; actions sobrepostas que revalidam a mesma fonte podem assentar juntas. Escrita independente num tick posterior publicou durante espera. Arraste: compare dados/instâncias DOM por ID; a base tem relato de duplicação visual sob sobreposição, correção ainda não publicada no recorte. Não descarte dados válidos, use chave aleatória ou reescreva backend para ocultar defeito visual.
