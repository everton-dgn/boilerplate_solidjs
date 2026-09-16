<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Nomes de arquivos e pastas de módulos

- Quando um módulo exportar uma única função, componente ou classe, use o
  mesmo nome e capitalização no arquivo ou na pasta que contém seu `index`:
  `makeSystemTheme/index.ts`, `Button/index.tsx` ou `readBackend.ts`.
- Módulos com várias exportações relacionadas são exceção. Use um nome que
  descreva a responsabilidade compartilhada, como `themeStorage` para
  `readTheme` e `saveTheme`. Quando houver uma exportação principal e funções
  auxiliares relacionadas, o módulo pode manter o nome da principal, como
  `createMenuState` com `queryMenuItems`.
- Tipos e constantes auxiliares não tornam, por si só, um módulo de função
  única uma exceção. Funções internas não exportadas também não interferem
  na escolha do nome.
- Não separe exportações relacionadas apenas para satisfazer esta convenção
  nem acrescente exportações artificiais para evitar uma renomeação.
  Exportações sem responsabilidade comum devem ser avaliadas separadamente;
  a regra de nomes não autoriza uma reorganização automática.
- Preserve nomes exigidos pelo framework, pelo roteamento ou por ferramentas,
  além de arquivos gerados e módulos de suporte como `types.ts`, `constants.ts`
  e `context.ts`. Esta regra não exige renomear pastas organizacionais.
- Ao renomear um módulo, atualize seus imports, referências documentais e
  nomes dos testes correspondentes, preservando os sufixos de ambiente.

## Tipos TypeScript

- Nunca escreva tipagens inline grandes ou estruturadas em parâmetros,
  retornos, callbacks ou anotações de variáveis, inclusive nos testes. Extraia
  um `type` nomeado antes de usar. Considere estruturada uma tipagem com
  múltiplas propriedades, objetos aninhados ou membros que sejam funções;
  caber em uma linha não libera a tipagem inline.
- Por exemplo, use `create(context: Context): RuleListeners`, com
  `type RuleListeners = { Program: (node: object) => void }` declarado à parte.
  Não use `create(context: Context): { Program: (node: object) => void }`.
- Tipos simples como `string`, `Theme`, `Theme[]` e `string | undefined`
  podem permanecer inline. Antes de entregar, revise as assinaturas e
  anotações adicionadas para extrair estruturas inline. Lint aprovado não
  dispensa essa revisão. Siga a seção "Localização de tipos" ao extraí-las.
- Use `type` para declarar tipos de objetos, props e contratos em código e
  testes. O lint aplica `typescript/consistent-type-definitions` com `type`.
- Preserve `interface` quando houver necessidade de mesclagem de declarações,
  como `RequestEventLocals` em `src/@types/solid.d.ts`, que estende `@solidjs/web`.
  Mantenha a exceção do lint restrita ao arquivo que precisa desse comportamento.
- Não edite declarações geradas para trocar `interface` por `type`.
  `src/@types/routes.d.ts` pertence ao gerador `filesystem-routing` e permanece
  excluído do lint.

## Localização de tipos

- Declare tipos pequenos e exclusivos de um arquivo no próprio arquivo,
  próximos do código que os utiliza.
- O critério para criar `types.ts` é o número de arquivos que importam o tipo.
  Com um único consumidor, declare no próprio arquivo e não exporte. O
  `types.ts` começa a valer a partir de dois consumidores, ou quando o bloco
  passar de cerca de 30 linhas e atrapalhar a leitura da implementação.
- Não exporte um tipo local apenas para permitir que outro arquivo o importe
  de um componente, hook, serviço ou outra implementação.
- Quando um tipo precisar ser compartilhado, mova-o para um arquivo de tipos
  próximo da funcionalidade e atualize os consumidores.
- Separe também tipos extensos quando suas declarações dificultarem a leitura
  da implementação, mesmo que tenham apenas um consumidor.
- Não crie um arquivo separado para cada tipo pequeno nem concentre tipos
  sem relação em um `types.ts` global.
- Preserve os tipos que precisam ser exportados como parte de uma API pública
  intencional.

## Parâmetros de função

- Função com dois parâmetros ou mais recebe um único objeto nomeado:
  `makeBroadcastChannel({ name, receive })`, não `makeBroadcastChannel(name, receive)`.
  Desestruture na assinatura e nomeie o tipo do objeto conforme a seção
  "Localização de tipos".
- O motivo é o ponto de chamada. Com dois argumentos posicionais, um booleano
  ou uma string solta não dizem o que significam: `publish('dark', true)` exige
  abrir a assinatura, enquanto `publish({ theme: 'dark', persisted: true })` se
  explica sozinho.
- Um parâmetro só permanece posicional. Não crie objeto para envolver um
  argumento único.
- A regra vale para as funções do projeto. Assinaturas ditadas por terceiros
  ficam como o contrato exige, sem adaptação: middlewares `(request, next)` em
  `src/middleware.ts`, callbacks de teste e hooks de plugin do Vite.

## Nomes de signal

- O par desestruturado de `createSignal` usa `[x, setX]`: o nome do setter é o
  do getter com prefixo `set`. `[open, setOpen]`, `[ready, setReady]`.
  Nunca `[theme, setPreference]` nem `[systemTheme, setSystem]`.
- Quando o nome interno e o nome público divergem, renomeie o getter, não o
  setter, e exponha o alias no retorno. Em `createTheme` o signal interno é
  `[themePreference, setThemePreference]` e o retorno publica
  `theme: themePreference`.
- O mesmo vale para `createStore` e qualquer primitive que devolva o par.

## Classes CSS

- Use snake_case em todas as classes CSS do projeto, incluindo CSS Modules e
  utilitários globais: `.home_link`, `.radio_indicator` e `.sr_only`. Nomes de
  uma palavra, como `.btn`, continuam válidos.
- Em componentes com variantes ou tamanhos, use classes independentes da classe
  base, com os prefixos `variant_` e `size_`: `.variant_default`, `.size_sm`.
  Concatene o prefixo com o valor da prop no acesso ao CSS Module, sem criar
  mapas de constantes apenas para selecionar classes.
- Use nesting para estados e media queries de cada classe. As classes de
  variantes e tamanhos ficam no nível superior, fora da classe base.
- Importe CSS Modules como `S`. O Stylelint exige snake_case em `src/**/*.css`;
  valide mudanças com `pnpm lint:css` e `pnpm test:css`.
