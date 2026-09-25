# Formulários e acessibilidade

RC.9.

## Estado e entradas

`createSignal(() => props.value)` cria derivação gravável: sobrescrita local dura até a origem mudar. Para rascunho independente, não use essa forma como inicializador único.

`value`/`checked` são controlados; `defaultValue`/`defaultChecked` são iniciais. Eventos são nativos: capture `event.currentTarget` antes de `await`.

## Select com opções tardias

Contrato: select com value/onChange acompanha código/usuário no mesmo nó. Sem handler não desfaz seleção do usuário, divergindo do estado. Runtime aplica value na hora e numa microtask, sem reaplicar ao mudar options.

Receita:
```tsx
<select onChange={event => setChoice(event.currentTarget.value)}>
  <For each={options()}>{option => <option selected={choice() === option}>{option}</option>}</For>
</select>
```

Armadilha: só value deixa primeira opção visível quando opções chegam depois, mesmo com outro valor no estado. Multiple/hidratação não testados.

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

Armadilha: em `aria-pressed` e `aria-busy`, `true` booleano é rejeitado pelo tipo; `false` booleano é aceito para remover o atributo. Use as strings `"true"` e `"false"` para comunicar o estado. Um cast só oculta o erro de tipo. Em atributo booleano nativo, `disabled="false"` desabilita e `disabled={false}` remove.

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

Keyed preserva a identidade, mas mover o nó focado pode causar blur. Use a [restauração de foco](06-lists-control-flow-and-local-state.md#foco-ao-reordenar) após o flush. Formulário e rascunho fora de `Loading`/`Errored` continuam editáveis durante carga e falha; mensagens imediatas no clique seguem o [agendamento da action](10-actions-optimism-and-confirmation.md#indicador-de-operação-e-publicação-no-clique).
