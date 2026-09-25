# Formulários e acessibilidade

RC.9.

## Estado e entradas

Contrato: separe fonte/rascunho/validação/envio/resposta; sobrescreva edição só por política explícita. createSignal(fn) é derivado gravável, não leitura única. Value/checked vêm do estado, evento escreve nele; defaultValue/defaultChecked são iniciais. Um dono por campo.

Receita:
```tsx
<>
<input value={text()} onInput={event => setText(event.currentTarget.value)} />
<input type="checkbox" checked={checked()} onChange={event => setChecked(event.currentTarget.checked)} />
</>
```

Armadilha: checkbox usa checked; valueAsNumber pode ser NaN, vazio não é zero. Datas/arquivos/select múltiplo pedem parsing próprio. Preserve cursor, digitação intermediária e IME em busca/envio por tecla. Capture valor/referência antes de await: currentTarget não é permanente. Promise tratada dispensa handler async.

## Select com opções tardias

Contrato: select com value/onChange acompanha código/usuário no mesmo nó. Sem handler não desfaz seleção do usuário, divergindo do estado. Runtime aplica value na hora e numa microtask, sem reaplicar ao mudar options.

Receita:
```tsx
<select onChange={event => setChoice(event.currentTarget.value)}>
  <For each={options()}>{option => <option selected={choice() === option}>{option}</option>}</For>
</select>
```

Armadilha: só value deixa primeira opção visível quando opções chegam depois, mesmo com outro valor no estado. Multiple/hidratação não testados.

## Envio e validação

Contrato: submit envia; button auxilia. PreventDefault não implementa progressive enhancement. Button comum com name/value/aria-pressed fica fora de FormData; submit entra com `new FormData(form, submitter)`. Checkbox visualmente oculto entra se nomeado, marcado e habilitado.

Armadilha: disabled não trava concorrência; complemente com guard local e idempotência/autorização servidor. Preserve campos em falha. Cliente valida UX; servidor valida HTTP, separando campo/global/conflito sem banco/stack brutos. FormData tem string/File/ausência: sem cast, limite tamanho/quantidade/conteúdo de arquivos.

## Rótulos e atributos

Contrato: label usa `for` no JSX DOM; `htmlFor` do React não pertence aos tipos; createUniqueId no caminho correto mantém ID SSR/hidratação. Ligue mensagem por aria-describedby e estado por aria-invalid. Aria-pressed/busy exigem texto enumerado reativo.

Receita:
```tsx
const id = createUniqueId();
<>
<label for={id}>Nome</label>
<input id={id} name="name" autocomplete="name" required />
<button type="button" aria-pressed={active() ? "true" : "false"}>Selecionar</button>
</>
```

Armadilha: booleano ARIA falha no typecheck, mesmo com cast. Texto false comunica estado. No nativo, disabled="false" desabilita, disabled={false} remove. Cor/classes não bastam como feedback; classes condicionais precisam existir no CSS de produção.

## Anúncios

Contrato: monte região vazia, altere texto e modere repetição em listas. Show/fallback insere região preenchida; use status do modelo fora de Loading/Errored.

Receita:
```tsx
<>
<p role="alert">{error()}</p>
<p role="status">{status()}</p>
</>
```

Armadilha: Show remove nó ao limpar erro; novo nó preenchido pode não anunciar. Região por item exige nó vazio; o exemplo de tarefas usa outro contrato: sem falha de gravação, nenhum alert aparece. DOM não prova anúncio.

## Foco e ciclo do formulário

Contrato: preserve foco em reorder/modal/recuperação. Portal segue contexto/evento delegado lógico; listener nativo segue DOM físico. Não fornece foco/Escape/inert/diálogo. Prefira controles nativos/biblioteca acessível compatível em UI complexa. Foco/inert/leitor de tela em Portal e foco/seleção anteriores ao clique de formatação não foram medidos: teste browser real.

Armadilha: rascunho/intenção de formulário aberto são persistentes, flag otimista é transitória. No exemplo, formulário fora das boundaries permite digitar em carga/falha; flag por ID nasce na action e mensagens comuns após sua Promise, pois mesmo tick retém escrita comum. Recusa duplicada usa status desde montagem. Teste teclado/Enter, falha, duplo clique, confirmação tardia/edição concorrente/troca de tela; confira rótulos/foco/conteúdo, hidratação inicial e restore browser.

