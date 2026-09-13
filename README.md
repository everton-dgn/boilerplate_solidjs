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
- [x] Server functions com `'use server'` e acesso ao evento da requisição
- [x] Middleware de servidor: `server-timing`, cabeçalhos de segurança e
      `requestId` por requisição
- [x] Roteamento com lazy loading e rota 404 respondendo com status HTTP correto
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
│   ├── @types/              # Declarações de tipos do Solid e dos ícones
│   ├── App.tsx              # Componente raiz: Router + layout
│   ├── Document.tsx         # Shell HTML do SSR (head, HydrationScript)
│   ├── api.ts               # Server functions ('use server')
│   ├── api.node.test.ts     # Teste da server function (projeto node)
│   ├── middleware.ts        # Middlewares do servidor
│   ├── router.ts            # Definição das rotas (createRouter)
│   ├── style.css            # Estilos globais
│   └── routes/
│       ├── index.tsx        # Página inicial
│       ├── index.dom.test.tsx     # Teste em happy-dom
│       ├── index.browser.test.tsx # Teste em Chromium real
│       └── not-found.tsx    # Página 404
├── tooling/
│   ├── fmt.ts               # Configuração do Oxfmt
│   └── lint.ts              # Configuração do Oxlint
├── vercel.json              # Comando de build e headers da Vercel
├── vite.config.ts           # Vite+ (Solid, Nitro, fmt, lint, test)
├── .lefthook.yml            # Hooks de git
├── .commitlintrc            # Regras de Conventional Commits
├── pnpm-workspace.yaml      # Catálogo de versões e builds permitidos
└── AGENTS.md                # Instruções do Vite+ para agentes
```

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
| `pnpm test`                 | Todos os projetos de teste                      |
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

O `vite.config.ts` define três projetos do Vitest, escolhidos pelo sufixo do
arquivo:

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
`vite-plus/prefer-vite-plus-imports` bloqueia o import direto). Server functions
são testadas com `provideRequestEvent` de `@solidjs/web/storage`, como em
`src/api.node.test.ts`.

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
botão "Chamar o servidor" demonstra
`import IconServer from '~icons/hugeicons/server'`. Apenas os ícones importados
entram no build.

## Testes da aplicação completa

`pnpm test:e2e` executa os testes em `src/tests/pages/*.e2e.test.ts` com
Chromium. O Playwright gera o build e inicia o servidor de produção em
`http://127.0.0.1:4317`, encerrando-o ao terminar. A porta precisa estar livre.
Os cenários cobrem a página inicial, hidratação do contador, chamada ao servidor
e resposta 404 com navegação de volta ao início.

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
| `pre-push`   | `check:ci`, `typecheck`, `test:ci` e `build` em paralelo                                                   |

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
