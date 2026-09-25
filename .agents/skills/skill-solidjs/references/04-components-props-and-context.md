# Componentes, props e contexto

## Props e ponto de chamada

Contrato: componente executa uma vez/instância. Remontagem/identidade nova cria outra; investigue construção repetida. Pai passa valor; filho lê props no JSX/accessor/memo. Compilador gera getter do atributo. Cópia/desestruturação no parâmetro/setup/callback estrutural congela, salvo contrato estático.

Receita:

```tsx
type CounterProps = { value: number }
function Counter(props: CounterProps) {
  return <output data-double={props.value * 2}>{props.value}</output>
}
// No componente proprietário de count:
<Counter value={count()} />
```

Armadilha: `value={count}` é erro de tipo. Escapando por cast/any/JS, texto ainda atualiza porque renderer insere função como conteúdo dinâmico, mas multiplicação dá NaN. Getter só por contrato. `{ ...props }` fora do JSX copia valores; não preserva reatividade.

Contrato: último atributo JSX vence, incluindo spread. Coloque spread antes dos atributos controlados e exclua props internas com `omit`. Handler direto de nativo é escolhido na montagem; ternário externo fica preso ao handler inicial. Decida dentro de callback estável. Spread de elemento ou de componente encaminhado ao botão reaplica handler novo.

## Defaults, merge e omit

Contrato: `merge` e `omit` criam views, sem copiar valores. `merge` deixa undefined explícito de fonte posterior sobrescrever default, inclusive após atualização; fonte com getter acompanha signal, objeto com valor já lido fica congelado. `omit(props, 'variant', 'size')` devolve uma view, não tupla de splitProps; também aceita predicado.

Receita:

```tsx
const title = () => props.title ?? 'Panel'
const nativeProps = omit(props, 'title')
return <section {...nativeProps} aria-label={title()}>{props.children}</section>
```

Armadilha: use `??` quando default deve sobreviver a undefined. Use merge quando undefined deve vencer. Prefira nomes explícitos no omit para conjuntos pequenos; filtro dinâmico dificulta entender o encaminhamento.

## Children e construção

Contrato: `props.children` direto atende renderização comum. Para normalizar/reusar, crie `children(() => props.children)` uma vez sob owner: resolve preguiçosamente e memoriza; `toArray()` lê o mesmo resultado. Ler getter de children várias vezes pode construir filhos várias vezes. Reutilizar accessor evita repetição nessas leituras, sem prometer identidade eterna após mudança ou remount.

Receita: mantenha resultado em leituras reativas e use JSX com `<Component ... />`. Diferencie conteúdo de render prop, tipando argumentos para distinguir accessor de valor. `createComponent` fica para integração. Memo compartilhado continua pertencendo à raiz que o criou.

Armadilha: guardar resultado de children numa constante não reativa o congela. Chamar componente manualmente pode alterar criação/ownership. Não execute indiscriminadamente qualquer função recebida como child. Ler children no when de Show pode construir árvore extra, inclusive Portal.

## Contexto

Contrato: o contexto é o provider, sem `.Provider`; `Context<T>` estende `ContextProviderComponent<T>`. Sem default, `useContext` retorna T e lança quando falta provider. O erro tem `constructor.name === 'ContextNotFoundError'`, mas a classe não é exportada. Ausência legítima usa `createContext<T | null>(null)` e guard de null.

Receita:

```tsx
type Preferences = { theme: Accessor<'light' | 'dark'>; toggle: () => void }
const PreferencesContext = createContext<Preferences>()
const PreferencesProvider: ParentComponent = props => {
  const [theme, setTheme] = createSignal<'light' | 'dark'>('light')
  const value: Preferences = {
    theme,
    toggle: () => { setTheme(current => current === 'light' ? 'dark' : 'light') }
  }
  return <PreferencesContext value={value}>{props.children}</PreferencesContext>
}
```

Armadilha: não importe a classe para instanceof; identifique constructor.name ou trate falha de useContext como ausência. Não há `createContextProvider`/`createOptionalContextProvider` públicos; são helpers de outras libs. Default fake não deve esconder provider obrigatório. Estado pertence à instância do provider ou request SSR. Objeto com accessors/stores/ações permanece estável.

## Contratos reutilizáveis e estado próprio

Contrato: entradas tipadas/callbacks de intenção/operações restritas explicitam domínio. Use componente controlado quando o pai já tem a fonte de verdade. Helper de modelo roda sob owner, sem imitar React. Hooks React, arrays de dependências, useMemo/useCallback e rerender não justificam estrutura Solid.

Receita: biblioteca sobre registros otimistas lê campos de negócio diretamente das props e mantém seleção/medidas numa store comum por ID. Junção acontece na leitura.

Armadilha: copiar coleção inteira para normalizar ou mutar registros recebidos para guardar seleção mistura ciclos de vida. Não exponha todos os setters quando basta callback específico.

