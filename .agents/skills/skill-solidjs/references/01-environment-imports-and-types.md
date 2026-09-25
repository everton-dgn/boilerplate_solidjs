# Ambiente, imports e tipos

## Pacotes e compatibilidade

Core, renderer, plugin e compilador precisam resolver para um conjunto compatível. Confira as versões resolvidas e os peers ao mudar esse conjunto; a faixa do manifesto não prova a resolução instalada.

Receita: fixe versões exatas e lockfile ao atualizar; confira a resolução do plugin com `pnpm why @solidjs/compiler -r`. Monorepo com vários pacotes Solid, em cliente/SSR/Vitest:

```ts
resolve: { dedupe: ['solid-js', '@solidjs/web', '@solidjs/router', '@solidjs/signals'] }
```

Armadilha: Motores independentes não rastreiam signals entre si, sem erro. Confira que `solid-js`, `@solidjs/web` e `@solidjs/signals` resolvem cada um para um único diretório real, que nenhum pacote do conjunto está declarado por dist-tag e que `@solidjs/router` não é da linha 0.x ou 1.x. `--force`, overrides e peers relaxados não provam compatibilidade. Não atualize dependências a cada tarefa.

## Tags, plugin e compilador

Contrato: No recorte, `latest` de `solid-js` e router escolhia Solid 1; `next` escolhia a linha 2. `latest` de web, signals, compiler e babel-plugin estava atrás do core; `next` do vite-plugin era mais antigo que `latest`. Tags atuais não verificadas. Atualize plugin/compilador juntos: o plugin usa `^` e passa `componentNames` em dev/observe; código ainda não publicado troca a opção por `sourceNames` e rejeita a antiga. Inferência: versão futura aceita pela faixa pode quebrar dev.

Receita: tags: `npm view <pacote> dist-tags`; offline, lockfile/manifesto instalado, tags não verificadas. Após atualização, teste dev e produção. Backend padrão native; compiler babel isola JSX, mas demais transformações exigem @solidjs/compiler.

Armadilha: Tag ou primeiro pacote em `.pnpm` pode escolher outra RC transitiva; Babel não elimina o compilador nativo.

Na base verificada, uma cópia transitiva antiga de `@solidjs/signals` pode não exportar `ROOT_ERROR_HOOK`, `configureClientErrors` ou `isStatic`, exigidos pelo core, causando `MISSING_EXPORT`. Confira `pnpm why solid-js` e `pnpm why @solidjs/signals` antes de contornar o erro com aliases. A faixa do [manifesto do core](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/solid/package.json) não garante alinhamento no lockfile.

Eventos delegados também dependem desse alinhamento: na base verificada, o renderer usa `node._$$click`; um compilador antigo que emita `node.$$click` produz handlers que nunca disparam, sem erro de build. Ao investigar, compare a propriedade emitida no JSX compilado com a chave lida pelo renderer instalado.

## Origem das APIs e dos tipos

Contrato: stores/core; renderer e tipos DOM/web. Element do core é renderizável, distinto do DOM. Use import type.

```tsx
import { createEffect, createMemo, createSignal, createStore, For, Loading, merge } from 'solid-js'
import type { Accessor, SourceAccessor, Setter, Signal, Store, Component, ParentComponent, VoidComponent, FlowComponent, Element } from 'solid-js'
import { dynamic, hydrate, Portal, render } from '@solidjs/web'
import type { ComponentProps, JSX, ValidComponent } from '@solidjs/web'
```

Receita: Alias SolidElement distingue DOM. Marcadores `server-only`/`client-only` fazem o build recusar imports na direção errada.

Armadilha: `solid-js/store`, `solid-js/web` e `solid-js/types/*` não são entradas desta base. Mapa público: `.`, `./refresh`, `./attribution`, `./internal` e `./package.json`, mas `internal`, `dist`, `src` e imports diretos de `@solidjs/signals` não são APIs de aplicação. `mergeProps` de web é interno ao compilador; use `merge`. Marcadores de ambiente não autorizam acesso no servidor.

O antigo patch mode (`patchDriver`, `wrapPatchMode`, `registerPatch`, `registerRowOps`, `registerSlotPatch`, `patchableRaw`) foi removido do compilador e do runtime nesta base, sem substituto público equivalente.

## Configuração e builds

TSX web compilado usa `jsx: 'preserve'` e `jsxImportSource: '@solidjs/web'`, com `@solidjs/vite-plugin`:

Receita:

```ts
import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'
export default defineConfig({ plugins: [solid()] })
```

Contrato: export conditions variam por worker, browser, deno e node, com prioridade `development`, depois `observe`, depois default, inclusive fora desses ambientes. `resolve.conditions: ['development']` ou `['observe']` seleciona o tier. Produção usa o ramo `default`, sem `development` ou `observe`; não existe condição chamada `production` ([build de produção](../../skill-solidjs-testing/references/vitest-config.md#build-de-produção)). Web repete isso inclusive em `server-functions` e `frames`; as 14 entradas do recorte resolvem arquivos existentes. Node sem `browser` usa servidor. Configure Vitest cliente; não force browser no SSR.

Armadilha: plugin básico não instala roteador/servidor/deploy. Preserve adapters; evite vite-plugin-solid/babel-preset-solid. `react-jsx` com `@solidjs/h` pertence a outra renderização. Vite não executa tsc; cheque tipos e produção (otimizações, diagnósticos e sanitização diferem). Bibliotecas: emita/teste declarações num consumidor; `skipLibCheck`, stubs ou TS antigo não validam integração.

## Templates válidos

Contrato: nativo/Babel usam validate true; reestruturação HTML que invalida caminhada posicional falha no build.

Receita: inclua tbody entre table e tr no código-fonte.

Armadilha: `<tr>` diretamente em `<table>` produz "HTML fornecido está malformado" (`HTML provided is malformed`). Desligar validate transfere risco ao runtime.

## Componentes e atributos nativos

Contrato: `Component<P>` não acrescenta children; `ParentComponent<P>` aceita children opcionais; `VoidComponent<P>` os proíbe; `FlowComponent<P, C>` declara children/render prop. Declare children obrigatório explicitamente. Array readonly de domínio, array de stores e children são distintos.

Receita:

```tsx
type Props = ComponentProps<'button'> & { variant?: string }
function Button(props: Props) {
  const nativeProps = omit(props, 'variant')
  return <button {...nativeProps} data-variant={props.variant ?? 'primary'} />
}
```

Armadilha: redefinir class/disabled/children perde contrato nativo. Para atributo controlado pelo wrapper, declare `Omit<ComponentProps<...>, 'atributo'>` e sua precedência no JSX. Não vaze props de domínio no HTML. Genéricos: prefira função declarada; arrow TSX pode exigir `<T,>`.

## Narrowing, signals e callbacks

Contrato: TS trata cada chamada reativa como nova. Use callback estreitado de `Show` ou capture dentro do escopo rastreado; `if (user()) user().name` não garante narrowing.

Receita: inicialize de verdade quando possível; explicite `createSignal<Item[]>([])`. `createSignal<T>()` admite ausência e, quando T inclui `undefined`, o setter pode ser chamado sem argumento para limpar. Preserve essa sobrecarga em wrappers. Valor recebe `Exclude<T, Function>`; propague esse limite em primitivas genéricas. Funções armazenadas exigem camada de função na criação e no setter. Fonte async entrega `Accessor<T>` resolvido pelo grafo, não `Promise<T>`.

Armadilha: `Setter<T>` aceita valor ou atualizador e devolve o valor escrito; não equivale a `(value: T) => void`. Retorno implícito: apply recebe cleanup inválido; store pode substituir raiz. Tsc estrito recusa ambos, inclusive `push`/atribuição primitiva na store, que o runtime ignora. Use chaves. MemoOptions: `id`, `name`, `equals`, `unobserved`, `lazy`, `transparent`; hidratação acrescenta `ssrSource` via `HydrationMemoOptions<T>`.

Contrato: TS aceita async em posição apenas `() => void`, como `onCleanup`. Apply de effect e `onSettled` retornam `void | (() => void)` e recusam async/retorno implícito sob tsc estrito. Aceitação não prova cleanup síncrono. Evite !/casts/cópias de props no setup para silenciar tipos.

## Eventos, erros e fronteiras de confiança

Contrato: use `JSX.EventHandler<T, E>` ou `InputEventHandler`, `ChangeEventHandler`, `FocusEventHandler`, importando JSX do renderer. `JSX.InputEventHandler<HTMLInputElement, InputEvent>` detecta elemento/evento incompatível melhor que cast de `Event`. Fallback de `Errored` recebe `ErrorAccessor`: leia `err()`. `JSX.Element` exclui funções; inclui elemento renderizado, arrays, string, number, boolean, null e undefined; o elemento renderizado recusa objetos com `call`, `apply` ou `bind`.

Receita: invoque a função que devolve JSX explicitamente ou use um componente dinâmico, sem inserir referência crua.

Erro capturado fora do grafo não chega automaticamente a `Errored`.
