<h1 align="center">SolidJS 2 + Vite+ Boilerplate</h1>

<br />

# :memo: Sobre o Projeto

Boilerplate enxuto para iniciar projetos com SolidJS 2, renderização no
servidor (SSR), server functions e Vite+ como toolchain única. A base traz
roteamento, middleware, servidor Node de produção e a esteira de qualidade
(formatação, lint, tipos, testes e hooks de git), sem aplicação de produto
pronta.

<br />

---

# :globe_with_meridians: Tecnologias

| Categoria         | Tecnologia                                          |
| ----------------- | --------------------------------------------------- |
| Framework         | SolidJS 2 (`solid-js` + `@solidjs/web`)             |
| Roteamento        | `@solidjs/router` 2                                 |
| Renderização      | SSR com hidratação e server functions               |
| Linguagem         | TypeScript 7 (modo estrito, `erasableSyntaxOnly`)   |
| Toolchain         | Vite+ (`vp`): Vite, Rolldown, Vitest, Oxlint, Oxfmt |
| Servidor          | Node.js `http` nativo (`server.ts`)                 |
| Testes            | Vitest com projetos `node`, `jsdom` e `browser`     |
| Testes no browser | Vitest Browser Mode + Playwright (Chromium)         |
| Lint              | Oxlint (type-aware) + `eslint-plugin-solid`         |
| Formatação        | Oxfmt                                               |
| Hooks do Git      | Lefthook + Commitlint                               |

<br />

---

# :triangular_flag_on_post: Funcionalidades

- [x] SSR com hidratação no cliente e `Document` próprio (`src/Document.tsx`)
- [x] Server functions com `'use server'` e acesso ao evento da requisição
- [x] Middleware de servidor: `server-timing`, cabeçalhos de segurança e
      `requestId` por requisição
- [x] Roteamento com lazy loading e rota 404 respondendo com status HTTP correto
- [x] Servidor de produção em Node puro, servindo estáticos com cache imutável
      para `/assets/` e delegando o resto ao handler SSR
- [x] Três projetos de teste separados por sufixo de arquivo:
      `*.node.test.ts`, `*.dom.test.tsx` e `*.browser.test.tsx`
- [x] Lint type-aware com regras de acessibilidade (`jsx-a11y`), promessas,
      imports e regras específicas do Solid 2
- [x] TypeScript em project references (`app` e `node`) com `tsc --build`
- [x] Hooks de git: format + lint + typecheck no commit, testes e build no push
- [x] Conventional Commits validados no `commit-msg`
- [x] Versões de Node e pnpm fixadas em `package.json` e baixadas
      automaticamente quando ausentes (`devEngines`)

<br />

---

# :open_file_folder: Estrutura do Projeto

```text
project/
├── public/
│   └── favicon.svg          # Estáticos servidos na raiz
├── src/
│   ├── App.tsx              # Componente raiz: Router + layout
│   ├── Document.tsx         # Shell HTML do SSR (head, HydrationScript)
│   ├── api.ts               # Server functions ('use server')
│   ├── api.node.test.ts     # Teste da server function (projeto node)
│   ├── middleware.ts        # Middlewares do servidor
│   ├── router.ts            # Definição das rotas (createRouter)
│   ├── style.css            # Estilos globais
│   └── routes/
│       ├── index.tsx        # Página inicial
│       ├── index.dom.test.tsx     # Teste em jsdom
│       ├── index.browser.test.tsx # Teste em Chromium real
│       └── not-found.tsx    # Página 404
├── tooling/
│   ├── fmt.ts               # Configuração do Oxfmt
│   └── lint.ts              # Configuração do Oxlint
├── server.ts                # Servidor Node de produção
├── vite.config.ts           # Vite+ (plugin Solid, fmt, lint, test)
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
- **pnpm**: a versão fixada em `packageManager`. Instale qualquer versão
  recente (`brew install pnpm`) e o próprio pnpm troca para a versão fixada
  ao rodar dentro do projeto.
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

Disponível em http://localhost:5173

Para rodar como produção:

```bash
pnpm build && pnpm start
```

Disponível em http://localhost:3000. As variáveis `PORT` e `HOST` são lidas
de `.env` (se existir) ou do ambiente.

<br />

---

# :wrench: Scripts

| Script                      | Descrição                                         |
| --------------------------- | ------------------------------------------------- |
| `pnpm dev`                  | Servidor de desenvolvimento com HMR               |
| `pnpm build`                | Build de produção (cliente + servidor em `dist/`) |
| `pnpm preview`              | Pré-visualizar o build pelo Vite                  |
| `pnpm start`                | Servidor Node de produção (`server.ts`)           |
| `pnpm typecheck`            | Verificação de tipos (`tsc --build`)              |
| `pnpm lint`                 | Lint com Oxlint                                   |
| `pnpm format`               | Formatar código com Oxfmt                         |
| `pnpm check:ci`             | Formatação + lint sem alterar arquivos            |
| `pnpm check:fix`            | Formatação + lint corrigindo o que for possível   |
| `pnpm test`                 | Todos os projetos de teste                        |
| `pnpm test:unit`            | Só os projetos `node` e `jsdom`                   |
| `pnpm test:browser`         | Só o projeto `browser` (Chromium headless)        |
| `pnpm test:browser:install` | Baixar o Chromium do Playwright                   |
| `pnpm test:watch`           | Testes em modo de observação                      |
| `pnpm validate`             | typecheck + check:ci + test + build               |
| `pnpm commitlint`           | Validar mensagem de commit                        |

Os scripts chamam o binário local `vp` (Vite+). `vp <comando>` executa um
comando embutido; `vp run <script>` executa um script do `package.json`. Os
dois podem divergir, então confira o `package.json` antes de rodar direto.

<br />

---

# :test_tube: Testes

O `vite.config.ts` define três projetos do Vitest, escolhidos pelo sufixo do
arquivo:

| Sufixo               | Ambiente      | Uso                                         |
| -------------------- | ------------- | ------------------------------------------- |
| `*.node.test.ts`     | Node          | Server functions, middleware, utilitários   |
| `*.dom.test.tsx`     | jsdom         | Componentes sem dependência de browser real |
| `*.browser.test.tsx` | Chromium real | Interação, layout e APIs de browser         |

Nos testes, importe de `vite-plus/test` em vez de `vitest` (a regra
`vite-plus/prefer-vite-plus-imports` bloqueia o import direto). Server
functions são testadas com `provideRequestEvent` de `@solidjs/web/storage`,
como em `src/api.node.test.ts`.

<br />

---

# :shield: Hooks de Git

Instalados pelo Lefthook no `pnpm install` (habilitado em `allowBuilds` do
`pnpm-workspace.yaml`):

| Hook         | O que roda                                                   |
| ------------ | ------------------------------------------------------------ |
| `pre-commit` | `check:fix` nos arquivos staged (com re-stage) + `typecheck` |
| `commit-msg` | `commitlint` (header até 50 caracteres, corpo até 100)       |
| `pre-push`   | `check:ci`, `test` e `build` em paralelo                     |

O `pre-commit` é pulado durante `merge` e `rebase`. Em CI o Lefthook não
instala os hooks.

<br />

---

# :rotating_light: Considerações Importantes

- SolidJS 2, `@solidjs/router` 2 e `@solidjs/vite-plugin` estão em versões
  pré-lançamento (`rc` e `next`). As versões são fixadas sem `^` (`savePrefix`
  vazio) para evitar quebras silenciosas.
- `vite` e `vitest` vêm do catálogo em `pnpm-workspace.yaml`; `vite` resolve
  para o core do Vite+. Atualize os dois lá, não no `package.json`.
- Commits devem seguir Conventional Commits.
- O lint é type-aware e roda com `typeCheck: true`; erros de tipo aparecem
  no `pnpm lint` além do `pnpm typecheck`.
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
