# DOM, eventos e refs

## HTML e atributos

Contrato: atributos HTML (class/for/tabindex), eventos camelCase. TS aceita só `tabindex`; `tabIndex` dá `TS2322`, embora Chromium aceite a atualização do atributo minúsculo. Booleano true grava atributo vazio; false/undefined remove. String 'false' mantém disabled e é rejeitada pelo tipo. Muted é propriedade: compilador atribui elemento.muted, sem atributo mesmo com true.

Receita: diferencie estado controlado de inicial em value/defaultValue, checked/defaultChecked, selected/defaultSelected e muted/defaultMuted. Preserve semântica textual de ARIA: aria-pressed='false' não equivale universalmente à ausência.

Armadilha: minúsculas indiscriminadas quebram propriedades nativas. Custom elements e propriedades especiais exigem verificar integração e tipos. Evite prefixos antigos `on:`, `oncapture:`, `use:`, `attr:`, `bool:`, `class:` ou especializações de style. Migre pela intenção: atributo/propriedade/listener/integração, sem troca textual cega.

## Classes e estilos

Contrato: class aceita string, objeto condicional e array. Objeto mutado compara snapshot por elemento e adiciona/remove só tokens alterados; signal com mesma referência precisa `equals: false` para reexecutar binding. Style usa kebab-case/custom properties, repassadas a setProperty; undefined remove. CamelCase dá TS2561 e não aplica no Chromium, estático ou dinâmico.

Receita:

```tsx
<div class={['card', { selected: props.selected }]} style={{ 'background-color': color(), '--space': space() }} />
```

Armadilha: classList não é API JSX atual. Snapshot de classes não torna cru reativo.

## Eventos e propagação

Contrato: eventos são nativos, sem SyntheticEvent. currentTarget é elemento do handler; target pode ser descendente. Capture antes de await. onInput acompanha edição; não presuma onChange do React. Respeite contratos de formulário/composição/números.

Receita:

```tsx
<input value={text()} onInput={event => { setText(event.currentTarget.value) }} />
<button onClick={event => (mode() === 'open' ? open : close)(event)} />
```

Contrato: handler direto é lido na montagem, delegado (onClick) ou nativo (onMouseEnter). Ternário fora do callback fixa escolha. Spread de props/elemento lê getter e reaplica handler. Prop recebe valor (`value={count()}`); accessor pode funcionar como texto, mas multiplicação dá NaN; TS rejeita.

Contrato: roots render/hydrate possuem/limpam delegação; aplicação não limpa singleton document. Portal propaga delegado pela árvore lógica: botão, depois ancestral lógico. Listener nativo no ancestral lógico não recebe; no alvo físico recebe.

Armadilha: teste roots aninhados, ShadowRoot e Portal com eventos reais. stopPropagation mantém semântica nativa. Capture/passive/once/opções fora do JSX: addEventListener com cleanup; evite privados/limpeza global v1. Lint não prova esses contratos: no recorte, plugin lint detectou style camelCase/índice capturado em For, mas não ternário de handler, accessor em prop numérica ou captura no Show.

## Fragmentos

Contrato: nativo rejeita fragmento filho direto de elemento; aceita topo, componente ou expressão. Babel não foi testado nesse caso.

Receita: remova fragmento redundante ou use `<section>{<><p /><p /></>}</section>`.

Armadilha: `<section><><p /><p /></></section>` falha com "Fragmentos e filhos spread ainda não implementados" (`Fragments and spread children are not implemented yet`); no Vitest aparece como erro de import.

## Ref e lifecycle

Contrato: ref roda sem owner; guarda elemento/aplica DOM com descarte já registrado. Setup de effects/onCleanup/recursos fica no componente/fábrica sob owner. Limpe widgets/observers/listeners/timers, inclusive ao trocar elemento.

Receita:

```tsx
function SearchField() {
  let element: HTMLInputElement | undefined
  onSettled(() => { element?.focus() })
  return <input ref={value => { element = value }} aria-label="Pesquisar" />
}
```

Armadilha: foco inicial exige UX apropriada, sem roubar navegação/tecnologia assistiva. Variável nua em array de refs não recebe atribuição especial de ref isolado. Effect/cleanup ficam no setup.

## Composição de refs e SSR

Contrato: array aplica callbacks em ordem, achata arrays e ignora undefined. Restrinja a prop a `JSX.RefCallback<T> | undefined`: JSX.Ref amplo aceita elemento, mas elemento no array não é chamável e lança TypeError. False/null são descartados pelo runtime, porém recusados pelos tipos. Condição é resolvida na criação; mudança posterior não instala/remove comportamento.

Receita:

```tsx
type LinkProps = {
  ref?: JSX.RefCallback<HTMLAnchorElement> | undefined
  href: string
  children: JSX.Element
}
function Link(props: LinkProps) {
  const mark: JSX.RefCallback<HTMLAnchorElement> = element => { element.dataset.origin = 'design-system' }
  return <a href={props.href} ref={[props.ref, mark]}>{props.children}</a>
}
```

Contrato: substitua directive por fábrica `ref={behavior(value)}` ou array; effect/cleanup ficam na fábrica, callback guarda elemento. Leia reativos no compute, pois leitura no callback não assina e pode avisar STRICT_READ_UNTRACKED. Fábrica retorna função/array em todo caminho; compilador ignora demais retornos, inclusive undefined, sem diagnóstico. Condição inicial usa `condition ? callback : undefined`; mudanças reativas usam lifecycle.

Armadilha: fábrica executa no SSR, callback não recebe elemento. Compute do effect também executa no servidor; só apply é pulado. `ssrSource: 'client'` pula compute. Window/document na fábrica ou compute normal causa ReferenceError. Na base verificada, composição/opcional/atualização/remoção foram observadas em Chromium; fases SSR cobrem default e dev. Isso não prova hidratação composta/performance.

## Texto e hidratação

Children explícitos suprimem `textContent` na compilação; não combine as duas formas. Em SSR hidratável, `textContent` numérico pode perder o zero e a hidratação preservar o espaço até a primeira atualização. Detalhes e limites em [R07](17-known-risks.md#r07-textcontent-perde-o-zero-numérico-no-html-de-ssr). Esse caminho não sustenta uma recomendação geral de performance.

## Número como filho único

`<output>{total()}</output>` começando em zero funciona no Chromium, mas quebra em happy-dom na base verificada. `{String(total())}` preservou 0/5/0 nos dois ambientes; converter muda o caminho exercitado, então não faça isso no teste de comportamento numérico. Veja [ambientes de teste](../../skill-solidjs-testing/references/environments.md#happy-dom).

Alternar número falso e elemento como filho único tem outro defeito de runtime: [R13](17-known-risks.md#r13-zero-ou-nan-como-filho-único-acumula-nós-de-texto-ao-alternar).

## Namespace

Tags ambíguas entre HTML e SVG (`a`, `script`, `style`, `title`) precisam do namespace correto na criação dinâmica. Trocar a tag lógica depois não corrige o namespace.
