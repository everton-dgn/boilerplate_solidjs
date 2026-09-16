<h1 align="center">SolidJS 2 + Vite+ Boilerplate</h1>

<br />

# :memo: Sobre o Projeto

Boilerplate enxuto para iniciar projetos com SolidJS 2, renderização no servidor
(SSR), server functions e Vite+ como toolchain única. A base traz roteamento,
middleware, servidor Nitro e a esteira de qualidade (formatação, lint, tipos,
testes e hooks de git), sem aplicação de produto pronta.

<br />

---

# :globe_with_meridians: Tecnologias

| Categoria         | Tecnologia                                                |
| ----------------- | --------------------------------------------------------- |
| Framework         | SolidJS 2 (`solid-js` + `@solidjs/web`)                   |
| Roteamento        | `@solidjs/router` 2                                       |
| Renderização      | SSR com hidratação e server functions                     |
| Linguagem         | TypeScript 7 (modo estrito, `erasableSyntaxOnly`)         |
| Toolchain         | Vite+ (`vp`): Vite, Rolldown, Vitest, Oxlint, Oxfmt       |
| Servidor          | Nitro 3, com preset Vercel e preview local                |
| Testes            | Vitest com projetos `node`, `dom` (happy-dom) e `browser` |
| Testes no browser | Vitest Browser Mode + Playwright (Chromium)               |
| Lint              | Oxlint (type-aware) + `eslint-plugin-solid`               |
| Formatação        | Oxfmt                                                     |
| Hooks do Git      | Lefthook + Commitlint                                     |

<br />

---

# :triangular_flag_on_post: Funcionalidades

- [x] SSR com hidratação no cliente e `Document` próprio (`src/Document.tsx`)
- [x] Toolchain configurada para server functions com `'use server'`
- [x] Middleware de servidor: `server-timing`, cabeçalhos de segurança e
      `requestId` por requisição
- [x] Roteamento com lazy loading e rota 404 respondendo com status HTTP correto
- [x] Layout responsivo com Topbar, página inicial e páginas de erro
- [x] Botão, menu de tema e componentes de página com CSS Modules
- [x] Tema claro, escuro ou do sistema (padrão), aplicado antes da hidratação,
      com persistência e sincronização entre abas
- [x] Nitro para servir estáticos e SSR, com preset Vercel e preview local
- [x] Três projetos de teste separados por sufixo de arquivo:
      `*.node.test.{ts,tsx}`, `*.dom.test.{ts,tsx}` e `*.browser.test.{ts,tsx}`
- [x] Lint type-aware com regras de acessibilidade (`jsx-a11y`), promessas,
      imports e regras específicas do Solid 2
- [x] TypeScript com configurações para aplicação e ferramentas Node, com cache
      incremental
- [x] Hooks de git: format + lint no commit, typecheck, testes e build no push
- [x] Conventional Commits validados no `commit-msg`
- [x] Versões de Node e pnpm fixadas em `package.json` e baixadas
      automaticamente quando ausentes (`devEngines`)

<br />

---

# :open_file_folder: Estrutura do Projeto

```text
project/
├── public/
│   ├── favicon/             # Ícones SVG, ICO e PNG
│   └── robots.txt           # Regras de rastreamento
├── src/
│   ├── @types/              # Tipos compartilhados, Solid e ícones
│   ├── App.tsx              # Componente raiz: Router + layout
│   ├── Document.tsx         # Shell HTML do SSR (head, HydrationScript)
│   ├── middleware.ts        # Middlewares do servidor
│   ├── router.ts            # Integração do manifesto de rotas por arquivo
│   ├── __tests__/           # Testes dos módulos da raiz de src
│   │   ├── App.dom.test.tsx       # Erro real da rota e recuperação pelo App
│   │   └── middleware.node.test.ts # Teste dos middlewares (projeto node)
│   ├── components/          # Componentes por atomic design
│   │   ├── atoms/           # Button, PageBadge, menu e tema
│   │   ├── molecules/      # Topbar
│   │   └── organisms/      # ErrorFallback
│   ├── constants/          # Constantes compartilhadas do tema
│   ├── helpers/            # Validação pura da preferência de tema
│   ├── infra/adapters/     # Persistência e comunicação entre abas
│   ├── primitives/         # createTheme: estado e ciclo de vida reativos
│   ├── theme/              # Somente CSS
│   │   ├── globalStyles.css # Entrada global, reset e acessibilidade
│   │   ├── class/          # utilities, animation e index.css
│   │   └── tokens/         # colors, fonts, grids, radius, shadows, sizes, zIndex
│   └── routes/
│       ├── index.tsx        # Página inicial
│       └── [...404].tsx     # Página 404 para caminhos desconhecidos
├── tooling/
│   ├── fmt.ts               # Configuração do Oxfmt
│   ├── lint.ts              # Configuração do Oxlint
│   └── release/
│       └── __tests__/       # Testes da automação de release (projeto node)
├── vercel.json              # Comando de build e headers da Vercel
├── vite.config.ts           # Vite+ (Solid, Nitro, fmt, lint, test)
├── .lefthook.yml            # Hooks de git
├── .commitlintrc            # Regras de Conventional Commits
├── pnpm-workspace.yaml      # Catálogo de versões e builds permitidos
└── AGENTS.md                # Instruções do Vite+ para agentes
```

As páginas em `src/routes` usam `export default` e são descobertas pelo
`filesystem-routing`. `index.tsx` define `/`, `[id].tsx` define um parâmetro
dinâmico e `[...404].tsx` captura caminhos desconhecidos. O `export const route`
define opções como `preload`, usado pelo fallback para responder com HTTP 404.
Componentes colocalizados podem ficar em pastas `components` dentro de `routes`:
use exportações nomeadas para que eles não sejam registrados como páginas. Não é
necessário editar `src/router.ts` ao adicionar uma página.

O plugin gera `src/@types/routes.d.ts` com os caminhos tipados durante o build
ou desenvolvimento. Mantenha essa declaração versionada e atualizada ao mudar as
rotas, para permitir typecheck antes de iniciar o Vite.

Tipos, estilos específicos, testes e primitives usados por um único componente
ficam junto dele, incluindo `Button/styles.module.css`. As utilidades globais
ficam em `theme/class/`, e `theme/tokens/` concentra os valores visuais
consumidos pelo CSS. `helpers/` contém funções puras compartilhadas;
`infra/adapters/` isola as APIs do navegador. O prefixo `make` identifica
utilitários sem estado reativo próprio, como `makeThemeChannel`, que devolve seu
descarte. O prefixo `create` identifica primitives com estado ou efeitos
reativos, como `createTheme`.

Imports de CSS Modules usam o nome `S`, por exemplo,
`import S from './styles.module.css'`. A regra local
`project/css-modules-import` do lint exige esse formato.

### Regras de CSS

Execute `pnpm lint:css` para verificar todos os arquivos CSS de `src/`. O
comando faz parte de `pnpm lint` e `pnpm check:ci`. O pre-push e o CI executam
essa verificação. O pre-commit usa apenas `vp check --fix` nos arquivos staged,
sem executar o lint de CSS. `vp lint` e `vp check` chamados diretamente
continuam sendo os comandos internos do Vite+.

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

`pnpm test:css` verifica o comportamento dos verificadores com casos em memória.
Execute manualmente ao alterar os verificadores, suas regras ou dependências.
Esse comando não roda nos hooks nem no CI. O lint do CSS real continua
automático, e suas violações bloqueiam a validação até serem corrigidas.

Quando houver consumidores de formatação de datas, moedas ou números, coloque
essas funções em `data/formatters/`, com testes junto delas. Normalização de
erros de domínio de APIs fica em `data/errorApi/`; requisições e persistência
continuam em `infra/`. Validação de tema continua em `helpers/isTheme/`.

### Falhas de backend e recuperação

`App` tem um único `Errored` global para exceções inesperadas. Seu fallback
substitui a aplicação inteira, inclusive o cabeçalho. Requisições usam `fetch`
diretamente; a função de carregamento verifica `response.ok` e lança o erro
quando a resposta falha. O boilerplate não acrescenta uma camada de sanitização
nem um contrato `Result`.

O link "Recarregar página" abre novamente a URL atual, preservando seus
parâmetros. Ele funciona sem JavaScript e não depende do cache do Router nem do
reset do boundary. A nova requisição volta a executar o carregamento inicial da
página; ações feitas pelo usuário depois disso precisam ser repetidas.

Uma página pode consumir a server function `readBackend` assim:

```tsx
const getBackend = query(readBackend, 'backend')

export default function Page() {
  const data = createMemo(() => getBackend('example'))
  return <h1>{data().message}</h1>
}
```

Os controles adicionais de `src/tests/fixtures/e2e/routes/backend-error.tsx`
servem para testar SSR, interação no navegador e streaming no mesmo arquivo.

O fallback pede status HTTP 500 durante SSR. Depois do envio inicial do
streaming, o status do documento permanece o que já foi enviado. O tratamento e
a serialização das exceções seguem o runtime do Solid. A mensagem genérica
visível não implica que o erro original esteja ausente do payload de hidratação.
No Solid 2.0.0-rc.8, a exceção de SSR também pode ser reportada no navegador
durante a hidratação do fallback. O link de recarregamento continua operável.

O tema começa em `system`. O cookie `app-theme` guarda a preferência por um ano,
com `Path=/`, `SameSite=Lax` e `Secure` em HTTPS, restrito ao host atual. O
`Document` lê esse cookie na requisição e entrega o tema explícito no HTML,
mesmo sem JavaScript. O script diretamente no `head` resolve a preferência do
sistema antes da hidratação, e `Provider` mantém uma instância de estado por
árvore. O seletor aplica a escolha imediatamente, antes de tentar persistir o
cookie. `BroadcastChannel` sincroniza abas da mesma origem; ao recuperar foco,
ficar visível ou receber `pageshow`, a aba relê o cookie. Sem o canal, a
sincronização acontece nesses eventos. Se o cookie não puder ser gravado, a
escolha fica em memória e ainda pode ser propagada pelo canal. Ela é preservada
ao retornar à aba enquanto o cookie não mudar e é perdida ao recarregar. O tema
não usa `localStorage`. `infra/adapters/themeStorage/` lê e grava o cookie,
`infra/adapters/applyTheme/` aplica o tema no DOM,
`infra/adapters/makeBroadcastChannel/` encapsula o canal entre abas para
qualquer domínio, `infra/adapters/makeThemeChannel/` concentra a regra de tema
sobre esse canal, `infra/adapters/makeSystemTheme/` observa a preferência do
sistema e `@types/theme.ts` define os tipos compartilhados, mantendo `theme/` só
com CSS. As cores usam `light-dark()` com `color-scheme`, para definir cada par
uma vez e seguir o sistema também quando JavaScript está desabilitado.

<br />

---

# :white_check_mark: Pré-requisitos

As versões exatas vivem no `package.json`, não nesta página:

- **Node**: a linha declarada em `engines.node`. O bloco `devEngines` fixa a
  versão exata e, com `onFail: download`, o pnpm baixa o runtime se a versão
  local não bater.
- **pnpm**: a versão fixada em `packageManager`. Instale qualquer versão recente
  (`brew install pnpm`) e o próprio pnpm troca para a versão fixada ao rodar
  dentro do projeto.
- **Chromium do Playwright**: só para `pnpm test:browser`. Não é baixado no
  `pnpm install`; instale uma vez com `pnpm test:browser:install`.

Ao subir a linha do Node, altere `engines` e `devEngines` no mesmo commit.

<br />

---

# :rocket: Primeiros Passos

```bash
# Clonar o repositório
git clone git@github.com:everton-dgn/boilerplate_solidjs.git
cd boilerplate_solidjs

# Instalar o pnpm (se ainda não tiver)
brew install pnpm

# Instalar dependências (instala os hooks do Lefthook)
pnpm i

# Instalar o Chromium para os testes de browser (uma vez)
pnpm test:browser:install

# Iniciar servidor de desenvolvimento
pnpm dev
```

Disponível em http://127.0.0.1:3000, conforme `HOST` e `PORT` no `.env`.

Para conferir o build de produção localmente, incluindo SSR e server functions:

```bash
pnpm build && pnpm start
```

O preview usa o Vite+ com a integração do Nitro. O `.env` versionado contém os
valores locais de `HOST` e `PORT`, usados tanto pelo dev quanto pelo preview.
Ele também é carregado durante o build; variáveis já definidas no ambiente têm
prioridade. Para escolher outra porta ou interface no preview, use
`pnpm start --port 3001` ou `pnpm start --host 0.0.0.0`.

`pnpm start` é um alias do preview local. Em produção, configure as variáveis na
plataforma de hospedagem; o comando `preview` é destinado à conferência local.

O Nitro usa `preset: 'vercel'` no `vite.config.ts` e gera a função SSR e os
estáticos em `.vercel/output/`. O plugin do Solid gera a entrada SSR, que o
Nitro usa diretamente. O `@solidjs/web` a partir da versão `2.0.0-rc.8` corrige
a compatibilidade das requisições de server functions com Nitro/srvx,
dispensando o adaptador manual.

Para gerar o artefato da Vercel:

```bash
pnpm build
```

Esse comando gera `.vercel/output/`, incluindo estáticos e a função SSR com
runtime Node 24. O `vercel.json` define esse comando como build do projeto. Na
Vercel, importe o repositório e deixe o diretório de saída sem override manual
para usar a Build Output API. Gerar o artefato localmente não publica a
aplicação.

O Nitro está fixado na versão beta declarada em `package.json`. Ao atualizá-lo,
valide o build Vercel, o preview local e os E2E. Os diretórios gerados
`.output/`, `.nitro/` e `.vercel/` são ignorados pelo Git.

<br />

---

# :wrench: Scripts

| Script                      | Descrição                                       |
| --------------------------- | ----------------------------------------------- |
| `pnpm dev`                  | Servidor de desenvolvimento com HMR             |
| `pnpm build`                | Build Nitro para Vercel em `.vercel/output/`    |
| `pnpm start`                | Pré-visualizar o build pelo Vite                |
| `pnpm typecheck`            | Tipos da aplicação e das ferramentas Node       |
| `pnpm lint`                 | Lint com Oxlint                                 |
| `pnpm format`               | Formatar código com Oxfmt                       |
| `pnpm check:ci`             | Formatação + lint sem alterar arquivos          |
| `pnpm check:fix`            | Formatação + lint corrigindo o que for possível |
| `pnpm test`                 | Todos os projetos de teste da aplicação         |
| `pnpm test:release`         | Testes dos scripts de release, execução manual  |
| `pnpm test:unit`            | Só os projetos `node` e `dom` (happy-dom)       |
| `pnpm test:browser`         | Só o projeto `browser` (Chromium headless)      |
| `pnpm test:browser:install` | Baixar o Chromium do Playwright                 |
| `pnpm test:watch`           | Testes em modo de observação                    |
| `pnpm validate`             | typecheck + check:ci + test + build             |
| `pnpm commitlint`           | Validar mensagem de commit                      |

Os scripts chamam o binário local `vp` (Vite+). `vp <comando>` executa um
comando embutido; `vp run <script>` executa um script do `package.json`. Os dois
podem divergir, então confira o `package.json` antes de rodar direto.

<br />

---

# :test_tube: Testes

Os arquivos de teste ficam em pastas `__tests__` ao lado do código que exercitam
(`src/__tests__/`, pastas dos módulos, `tooling/release/__tests__/`). Os testes
E2E são a exceção e vivem em `src/tests/pages/`, fora dos projetos do Vitest.

Teste regras e resultados observáveis: recuperação após erro, navegação,
seleção, persistência e sincronização. Componentes de apresentação simples não
precisam de suíte própria para conferir montagem, textos estáticos, classes ou o
funcionamento nativo de botões. Escolha o ambiente que cobre o comportamento e
evite repetir o mesmo cenário em outro nível.

O `vite.config.ts` define três projetos do Vitest, escolhidos pelo sufixo do
arquivo:

Os testes de `tooling/release/__tests__/` usam o executor nativo `node:test`,
sem configuração adicional, e rodam somente com `pnpm test:release`. Execute
esse comando ao alterar os scripts de release. Essa suíte não participa dos
comandos gerais de teste, cobertura, UI, watch, `validate`, hooks ou CI.

| Sufixo                    | Ambiente      | Uso                                         |
| ------------------------- | ------------- | ------------------------------------------- |
| `*.node.test.{ts,tsx}`    | Node          | Server functions, middleware, utilitários   |
| `*.dom.test.{ts,tsx}`     | happy-dom     | Componentes sem dependência de browser real |
| `*.browser.test.{ts,tsx}` | Chromium real | Interação, layout e APIs de browser         |

Os projetos `node` e `dom` usam `pool: 'threads'` e `css: false`. O projeto
`node` não carrega happy-dom nem os plugins de componentes. O projeto `dom`
carrega happy-dom, Solid e ícones, sem Nitro ou a configuração de SSR. O projeto
`browser` usa Chromium com CSS habilitado e o mesmo PostCSS da aplicação.
Importe o CSS no teste quando precisar validar estilos.

A configuração compartilhada limpa o histórico de mocks entre testes e exclui
arquivos E2E, `node_modules` e `playwright`. `passWithNoTests: false` faz a
execução falhar quando nenhum teste é encontrado. Os projetos declaram suas
opções sem `extends`, pois no Vitest 4.1 a herança da configuração raiz exige
`extends: true`.

Nos testes, importe de `vite-plus/test` em vez de `vitest` (a regra
`vite-plus/prefer-vite-plus-imports` bloqueia o import direto). O contexto de
requisição dos middlewares é testado com `provideRequestEvent` de
`@solidjs/web/storage` em `src/__tests__/middleware.node.test.ts`.

<br />

---

## Processamento de CSS

`vite.config.ts` usa `postcss-preset-env` com stage 3, Autoprefixer e custom
properties habilitados, seguindo as opções do DevInsights. O Vite+ cuida dos
imports de CSS e da minificação no build. A configuração é carregada em
`css.postcss` e também se aplica aos builds Nitro para Node e Vercel.

## SVGs locais como componentes

O `unplugin-icons` carrega a coleção `my-images` de `src/assets/images/` com
`FileSystemIconLoader`. A home demonstra a importação do logo do Solid:

```tsx
import SolidLogo from '~icons/my-images/solid'

<SolidLogo width="96" height="90" aria-hidden="true" />
```

Adicione arquivos `.svg` nessa pasta e importe pelo nome, sem extensão. As cores
originais são preservadas. PNG, JPEG e WebP continuam sendo imagens comuns.
`src/@types/icons.d.ts` declara os componentes com os tipos de `@solidjs/web`
para Solid 2, pois os tipos fornecidos pelo plugin ainda usam a API do Solid 1.

O
[SVG do Solid vem do template oficial do Vite](https://github.com/vitejs/vite/blob/main/packages/create-vite/template-solid/src/assets/solid.svg).

Os ícones prontos usam a coleção `@iconify-json/hugeicons` pelo mesmo plugin. O
seletor de tema usa, por exemplo,
`import IconSun from '~icons/hugeicons/sun-01'`. Apenas os ícones importados
entram no build.

## Testes da aplicação completa

`pnpm test:e2e` executa os testes em `src/tests/pages/*.e2e.test.ts` com
Chromium. O Playwright gera o build e inicia o servidor de produção em
`http://127.0.0.1:4317`, encerrando-o ao terminar. A porta precisa estar livre.
Os cenários cobrem a página inicial, hidratação do seletor de tema, teclado,
persistência e sincronização entre abas, cores sem JavaScript, layout e resposta
404 com navegação de volta ao início. Também cobrem HTTP 500 de um backend
local, feedback na página, recarregamento ainda com falha e recuperação após o
backend voltar. O teste verifica SSR inicial, chamada pelo navegador e
streaming. O SSR inicial também é verificado com JavaScript desativado.

O build E2E usa `--mode e2e` com otimizações de produção e acrescenta a página
de teste pelo diretório `src/tests/fixtures/e2e/routes/`. O backend simulado
escuta somente em `127.0.0.1:4318` e é iniciado e encerrado pelo Playwright. O
build normal (`pnpm build`) usa apenas `src/routes/` e não inclui essa página
nem o backend simulado. As portas 4317 e 4318 precisam estar livres.

Use `pnpm test:e2e:ui` para abrir a interface interativa do Playwright. Com
`CI=true`, os E2E usam um único worker; localmente, mantêm o paralelismo padrão.

O relatório HTML fica em `playwright-report/` e os traces de falhas E2E em
`test-results/e2e/`. Os testes do Vitest Browser Mode guardam traces de falhas
em `test-results/browser-traces/`. Esses artefatos são ignorados pelo Git. Os
E2E têm comando separado e não fazem parte de `pnpm test` ou `pnpm validate`.

Para conferir a interface em um celular na mesma rede, execute `pnpm dev:phone`
e abra a URL de rede exibida pelo Vite. Esse comando disponibiliza o servidor de
desenvolvimento nas interfaces de rede da máquina.

# :shield: Hooks de Git

Instalados pelo Lefthook no `pnpm install` (habilitado em `allowBuilds` do
`pnpm-workspace.yaml`):

| Hook         | O que roda                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `pre-commit` | `check:fix` nos arquivos staged (com re-stage) + `scan:secrets --staged` quando Kingfisher está disponível |
| `commit-msg` | `commitlint` (header até 50 caracteres, corpo até 100)                                                     |
| `pre-push`   | `check:ci`, `typecheck` e `test:ci` em paralelo                                                            |

O `pre-commit` é pulado durante `merge` e `rebase`. Em CI o Lefthook não instala
os hooks.

<br />

---

# :rotating_light: Considerações Importantes

- SolidJS 2, `@solidjs/router` 2 e `@solidjs/vite-plugin` estão em versões
  pré-lançamento (`rc` e `next`). As versões são fixadas sem `^` (`savePrefix`
  vazio) para evitar quebras silenciosas.
- `vite` e `vitest` vêm do catálogo em `pnpm-workspace.yaml`; `vite` resolve
  para o core do Vite+. Atualize os dois lá, não no `package.json`.
- Commits devem seguir Conventional Commits.
- O lint é type-aware e roda com `typeCheck: true`; erros de tipo aparecem no
  `pnpm lint` além do `pnpm typecheck`.
- Use as versões de Node e pnpm definidas em `package.json`.

<br />

---

# :link: Referências

- SolidJS: https://docs.solidjs.com
- Solid Router: https://docs.solidjs.com/solid-router
- Vite+: https://viteplus.dev/guide/
- Vite: https://vite.dev
- Vitest: https://vitest.dev
- Vitest Browser Mode: https://vitest.dev/guide/browser/
- Playwright: https://playwright.dev
- Oxlint: https://oxc.rs/docs/guide/usage/linter
- Oxfmt: https://oxc.rs/docs/guide/usage/formatter
- eslint-plugin-solid: https://github.com/solidjs-community/eslint-plugin-solid
- Commitlint: https://commitlint.js.org
- Lefthook: https://github.com/evilmartians/lefthook
- TypeScript: https://www.typescriptlang.org/docs

<br />

---

# :technologist: Autor

Por [Éverton Toffanetto](https://devinsights.dev).

:link: LinkedIn: https://www.linkedin.com/in/everton-toffanetto

:link: YouTube: https://youtube.com/@toffanettodev
