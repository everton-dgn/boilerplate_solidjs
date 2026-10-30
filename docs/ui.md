# Componentes, tema e estilos

[Voltar ao README](../README.md)

## Campos, diálogos e notificações

`Input` e `Textarea`, em `components/atoms/`, aceitam as props nativas,
incluindo `ref`, `name`, `required`, eventos, `value` e `defaultValue`. O valor
inicial também aparece no HTML do servidor. Use `value` com um signal para
controlar o campo, ou `defaultValue` para deixá-lo sob controle do navegador e
permitir o reset nativo do formulário. `Textarea` permite redimensionamento
vertical. Ambos aceitam `variant="destructive"`, que também define
`aria-invalid` quando o consumidor não fornece esse atributo. Associe um `label`
ao `id` e use `aria-describedby` para ligar a mensagem de ajuda ou de erro ao
campo. Os textos do formulário pertencem ao catálogo da página.

`Dialog`, em `components/molecules/`, usa o elemento nativo `dialog` com
`showModal()`. Recebe `open`, `onOpenChange`, `title`, `description` opcional e
`children`. O consumidor mantém o estado, por exemplo `open={open()}` e
`onOpenChange={setOpen}`. O título e a descrição são associados ao modal por
atributos ARIA; o botão de fechar já tem tradução. Escape e esse botão solicitam
o fechamento; clicar no fundo mantém o modal aberto. O navegador confina o foco
ao modal e o devolve ao controle de origem ao fechar. Um modal inicialmente
aberto entra na modalidade após a hidratação.

`Provider` já instala um `ToastProvider` para a aplicação. Chame `useToast()` de
`@/components/atoms/ToastProvider/useToast/index.ts` durante a criação do
componente e use a API nos eventos:

```ts
const toast = useToast()
const id = toast.show({ message: m.save_pending(), variant: 'loading' })
toast.update({ id, message: m.save_done(), variant: 'success' })
toast.dismiss(id)
```

As mensagens do exemplo devem existir no catálogo do consumidor nos três
idiomas. A API aceita texto simples e as variantes `info`, `success`, `warning`,
`error` e `loading`. O prazo padrão é de cinco segundos; `loading` sem prazo e
`duration: 0` permanecem até o fechamento. Atualizar a variante ou a duração
reinicia o prazo; atualizar apenas o texto preserva o tempo restante. Hover,
foco e aba oculta pausam o cronômetro. A fila mantém até cinco notificações e,
quando esse limite é excedido, remove a mais antiga que não esteja com hover nem
com foco. Os anúncios de leitores de tela são agrupados por prioridade; erros
usam a região assertiva. A notificação não desloca o foco ao aparecer. Se a
notificação removida contém o foco, ele passa ao botão de fechar da vizinha ou,
sem vizinha, volta ao elemento focado antes de entrar na região. Cada provider
tem estado próprio e libera os temporizadores ao desmontar.

## Menus suspensos

`DropdownMenu`, em `components/atoms/`, segue o padrão de menu do APG: setas,
`Home` e `End` navegam entre os itens, `Escape` fecha, e `Tab` fecha sem prender
o foco. Selecionar um item, pelo teclado ou pelo ponteiro, devolve o foco ao
gatilho; com o ponteiro, o navegador não mostra o anel de `:focus-visible`. Na
navegação por teclado, o item focado recebe o anel de foco global, além do fundo
de destaque. Clicar fora fecha o menu e preserva o destino do foco.

Os gatilhos de tema e de idioma incluem o estado atual no nome acessível: o de
idioma começa pelo código mostrado no botão, como "EN, select language", e o de
tema informa a preferência atual depois da hidratação. Os dois dependem de
JavaScript.

## Tema e persistência

O tema começa em `system`. O cookie `app-theme` guarda a preferência por um ano,
com `Path=/`, `SameSite=Lax` e `Secure` em HTTPS, restrito ao host atual. O
`Document` lê esse cookie na requisição e entrega o tema explícito no HTML. O
script diretamente no `head` resolve a preferência do sistema antes da
hidratação, e `Provider` mantém uma instância de estado por árvore. O seletor
aplica a escolha imediatamente, antes de tentar persistir o cookie.
`BroadcastChannel` sincroniza abas da mesma origem; ao recuperar foco, ficar
visível ou receber `pageshow`, a aba relê o cookie. Sem o canal, a sincronização
acontece nesses eventos. Se o cookie não puder ser gravado, a escolha fica em
memória e ainda pode ser propagada pelo canal. Ela é preservada ao retornar à
aba enquanto o cookie não mudar e é perdida ao recarregar. O tema não usa
`localStorage`. `infra/adapters/themeStorage/` lê e grava o cookie,
`infra/adapters/applyTheme/` aplica o tema no DOM,
`infra/adapters/makeBroadcastChannel/` encapsula o canal entre abas para
qualquer domínio, `infra/adapters/makeThemeChannel/` concentra a regra de tema
sobre esse canal, `infra/adapters/makeSystemTheme/` observa a preferência do
sistema e `@types/theme.ts` define os tipos compartilhados, mantendo `theme/` só
com CSS. As cores usam `light-dark()` com `color-scheme` para definir cada par
uma vez e seguir o tema do documento.

## Regras de CSS

Execute `vp run lint:css` para verificar todos os arquivos CSS de `src/`. O
comando faz parte de `vp run lint` e `vp run check:ci`. O pre-push e o CI
executam essa verificação. O pre-commit usa `vp run check:fix`, que gera o i18n
e chama `vp check --fix` nos arquivos staged, sem executar o lint de CSS.
`vp lint` e `vp check` chamados diretamente continuam sendo os comandos internos
do Vite+.

- Classes de todo o projeto usam snake_case, como `.home_link` e `.sr_only`.
  Nomes de uma palavra, como `.btn` e `.page`, continuam válidos.
- Componentes com variantes e tamanhos usam classes independentes da classe
  base, com os prefixos `variant_` e `size_`, como `.variant_default` e
  `.size_sm`. Concatene o prefixo com o valor da prop no acesso ao CSS Module,
  sem mapas de constantes. Use nesting para estados e media queries de cada
  classe.
- Tokens usam nomes em kebab-case, como `--color-primary-hover`. A regra
  `custom-property-no-missing-var-function` detecta a ausência de `var()` para
  tokens declarados no mesmo arquivo. Nas propriedades protegidas pelo plugin de
  tokens, valores sem `var()` também são rejeitados.
- Seletores e media queries inválidos, seletores duplicados no mesmo contexto e
  etapas duplicadas em `@keyframes` geram erro.
- Nomes e valores desconhecidos em media features, operadores sem os espaços
  obrigatórios em `calc()` e `@import` em posição inválida geram erro.
- Fora de `src/theme/`, `color-mix()` e `light-dark()` são proibidos.
  `stylelint-declaration-strict-value` exige tokens nas propriedades de cor,
  `background`, `fill`, `stroke`, sombras, `font-size`, `font-weight`, `z-index`
  e `border-radius` (incluindo cantos físicos e lógicos), com análise das
  abreviações suportadas pelo plugin. Funções locais não são liberadas;
  gradientes compartilhados ficam nos tokens. Valores como `transparent`,
  `currentColor`, `inherit`, `none` e `auto` são permitidos. O tema pode definir
  os valores e manter as cores de sistema usadas no reset de alto contraste. O
  plugin não escolhe tokens nem aplica correções automáticas. Sua análise de
  abreviações é experimental e não cobre toda a sintaxe CSS.
- Propriedades, valores, unidades, cores hexadecimais, pseudoclasses e at-rules
  desconhecidos geram erro. `:global` e `:local` não são permitidos; os estilos
  globais ficam em `src/theme/`.
- Declarações duplicadas e abreviações que sobrescrevem propriedades anteriores
  geram erro. Fallbacks consecutivos com sintaxes diferentes são permitidos.
- Nomes de animação devem ter `@keyframes` no próprio arquivo ou nas referências
  compartilhadas, incluindo `src/theme/class/animation.css`.
- `no-unknown-custom-properties` rejeita `var(--token)` sem definição no próprio
  arquivo ou em `src/theme/tokens/**/*.css`. Por exemplo, `var(--backgroud)`
  gera erro; `var(--color-background)` é reconhecido. A regra nativa aceita
  variáveis desconhecidas com fallback, como `var(--opcional, red)`. As
  referências compartilhadas usam `referenceFiles`, recurso experimental do
  Stylelint.
- Fora de `src/theme/`, inclusive nas rotas, o nome obrigatório é
  `styles.module.css`. Em `src/theme/`, use nomes como `colors.css` e
  `zIndex.css`.
- O limite é de dois níveis de nesting dentro de uma regra. O Stylelint
  desconsidera at-rules na raiz ao contar essa profundidade.
- `stylelint-use-nesting` aponta seletores e media queries adjacentes que podem
  ser aninhados. Essa regra não encontra toda oportunidade de nesting entre
  blocos distantes. Os comandos do projeto não aplicam correção automática de
  CSS, para preservar a ordem da cascata.

A regra `project/css-filename` do plugin local do Oxlint valida os nomes dos
arquivos CSS referenciados por imports e reexportações em JS/TS. O comando
`lint:css` reutiliza essa validação para todos os arquivos CSS em `src/`,
inclusive aqueles sem imports em JS/TS.

`vp run test:tooling` verifica o comportamento dos verificadores com casos em
memória e roda nos hooks e no CI. O lint do CSS real continua automático, e suas
violações bloqueiam a validação até serem corrigidas.

## Processamento de CSS

`vite.config.ts` usa o Lightning CSS (`css.transformer: 'lightningcss'`) para
transpilar nesting, `light-dark()` e prefixos para os navegadores do Baseline
padrão do Vite, rebaixando cores modernas só quando o alvo exigir.
`light-dark()` vira variáveis `--lightningcss-light`/`--lightningcss-dark`,
alternadas pela media query `prefers-color-scheme` e pelas regras
`.light`/`.dark` de `src/theme/tokens/colors.css`. O `color-scheme` inline
aplicado por `applyTheme` não altera essas variáveis: a troca manual de tema
depende das classes no `<html>`, então mantenha a declaração de `color-scheme`
nessas regras. O Vite+ cuida dos imports de CSS e da minificação no build, e a
mesma configuração vale para os builds Nitro e para o projeto `browser` do
Vitest.

As classes dos CSS Modules seguem o padrão `[content-hash]_[local]`
(`css.lightningcss.cssModules.pattern`). O `[hash]` padrão do Lightning CSS
inclui a query do módulo, e o SSR de desenvolvimento do plugin do Solid importa
cada folha com `?inline` para entregar o estilo no primeiro HTML: com o padrão,
o componente e a folha inline gerariam classes diferentes
([vitejs/vite#23735](https://github.com/vitejs/vite/issues/23735)). Não use
`[name]_[local]`, porque todos os módulos se chamam `styles.module.css` e as
classes colidiriam, nem `[content-hash]` sem `[local]`, que junta todas as
classes da folha num nome só. Como o nome vem do conteúdo, editar um CSS muda as
classes geradas e o hash do chunk JS que importa a folha, e duas folhas com
conteúdo idêntico compartilham os nomes; isso só é seguro sem `url()`, `@import`
ou `composes` relativos, que apontariam para alvos diferentes.
`tooling/lightningCssModules/` carrega o `vite.config.ts` real e confere que o
import normal e o `?inline` usam a mesma classe e que as classes continuam
distintas entre seletores e entre módulos. Quando uma versão do Vite+ trouxer o
[vitejs/vite#23736](https://github.com/vitejs/vite/pull/23736), o padrão pode
voltar ao `[hash]` do Lightning CSS, desde que esse teste continue passando.

## SVGs locais como componentes

O `unplugin-icons` carrega a coleção `my-images` de `src/assets/images/` com
`FileSystemIconLoader`. A home demonstra a importação do logo do Solid:

```tsx
import SolidLogo from '~icons/my-images/solid'

<SolidLogo width="96" height="90" />
```

Adicione arquivos `.svg` nessa pasta e importe pelo nome, sem extensão. As cores
originais são preservadas. PNG, JPEG e WebP continuam sendo imagens comuns. A
configuração do plugin já adiciona `aria-hidden="true"` aos SVGs importados; não
repita o atributo em cada uso do componente. `src/@types/icons.d.ts` declara os
componentes com os tipos de `@solidjs/web` para manter os ícones alinhados à API
usada pelo projeto.

O
[SVG do Solid vem do template oficial do Vite](https://github.com/vitejs/vite/blob/main/packages/create-vite/template-solid/src/assets/solid.svg).

Os ícones prontos usam a coleção `@iconify-json/hugeicons` pelo mesmo plugin. O
seletor de tema usa, por exemplo,
`import IconSun from '~icons/hugeicons/sun-01'`. Apenas os ícones importados
entram no build.
