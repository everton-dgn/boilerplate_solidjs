# Desenvolvimento e entrega

[Voltar ao README](../README.md)

## Pré-requisitos

As versões exatas vivem no `package.json`, não nesta página:

- Vite+: instale o CLI global conforme o
  [guia oficial](https://viteplus.dev/guide/). Ele seleciona o Node e o
  gerenciador de pacotes declarados no projeto.
- Node: o runtime do Vitest, testes de tooling e SSR de produção.
  `devEngines.runtime` fixa a versão exata, dentro da linha declarada em
  `engines.node`.
- Bun: o instalador e runtime de desenvolvimento, build, Knip, lint de CSS e
  automação de release, fixado em `packageManager`. O Vite+ seleciona essa
  versão para a instalação e para o comando `bun`.
- Chromium do Playwright: usado pelos testes de navegador e E2E. Não é baixado
  no `vp install`; instale uma vez com `vp run test:browser:install`.

No CI, os testes usam o Chrome já instalado no runner.

Ao subir a linha do Node, confirme que a Vercel aceita o runtime de destino e
altere `engines` e `devEngines` no mesmo commit.

## Ambiente e preview

Para clonar e iniciar o projeto, siga os
[primeiros passos](../README.md#primeiros-passos).

Para conferir o build de produção localmente, incluindo SSR e server functions:

```bash
vp run build && vp run start
```

O preview usa o Vite+ com a integração do Nitro. O `.env` versionado contém os
valores locais de `HOST` e `PORT`, usados tanto pelo dev quanto pelo preview, e
`VITE_SITE_URL`, a URL pública obrigatória dos metadados de SEO. Ele também é
carregado durante o build; variáveis já definidas no ambiente têm prioridade.
Para escolher outra porta ou interface no preview, use
`vp run start --port 3001` ou `vp run start --host 0.0.0.0`.

`vp run start` é um alias do preview local. Em produção, configure as variáveis
na plataforma de hospedagem; o comando `preview` é destinado à conferência
local.

## Build e deploy

O Nitro usa `preset: 'vercel'` no `vite.config.ts` e gera a função SSR e os
estáticos em `.vercel/output/`. A entrada SSR do build é o handler nativo do
plugin do Solid, que lê o nonce de `event.nonce` após a cadeia de middleware.
Ele renderiza pelas entradas autorais `src/entry-server.tsx` e
`src/entry-client.tsx`, mantidas em par para configurar o idioma antes da
hidratação. As requisições de server functions usam a integração nativa entre
Solid e Nitro/srvx.

A entrada do cliente publica o marcador de testes com `onHydrationEnd`, dentro
da passagem raiz de `hydrate()`. Ele acompanha o fim da fase, inclusive quando
há recuperação de erro. O contrato e os cenários de parser, preload e streaming
estão em
[testes da aplicação completa](testing.md#testes-da-aplicação-completa).

Para gerar o artefato da Vercel:

```bash
vp run build
```

Esse comando gera `.vercel/output/`, incluindo estáticos e a função SSR com
runtime Node. O build executa em Bun; o destino da função é explícito no Nitro e
acompanha `devEngines.runtime`. Gerar o artefato localmente não publica a
aplicação.

### Runtime do SSR

O SSR de produção permanece em Node porque respostas de `fetch()` no Bun
declarado no projeto permitem alterar os headers. `Response.redirect()` já
preserva o corpo nulo, mas a proteção do servidor também depende da
imutabilidade dos headers de respostas de rede. Não remova o runtime explícito
do Nitro: a detecção automática escolheria Bun por causa do processo que executa
o build. Antes de migrar o SSR, preserve os contratos de
[erros de servidor](server-errors.md) e rode os testes da fronteira no runtime
de destino, além dos E2E completos.

### Publicação

O deploy de produção sai do job `deploy` do
[workflow do CI](../.github/workflows/ci.yml), só em push na `main` e depois do
job `check`. No push para `main`, o job de E2E de produção roda
`vercel pull --environment=production` e `vercel build --prod`, testa esse
output sem recompilar e envia o artefato ao job `deploy`. Este publica o mesmo
build com `vercel deploy --prebuilt --prod`, usando a variável `VERCEL_ORG_ID`,
a variável `VERCEL_PROJECT_ID` e o secret `VERCEL_TOKEN` cadastrados no GitHub.
O `vercel.json` desativa os deploys pela integração Git
(`git.deploymentEnabled: false`) e guarda o cache imutável de `/images/` e os
cabeçalhos `nosniff` e `Cross-Origin-Resource-Policy` dos estáticos; os demais
cabeçalhos de segurança saem do middleware. A configuração da Vercel e o fluxo
de releases automáticas estão no
[guia de releases](../tooling/release/README.md).

O Nitro é definido no [package.json](../package.json). Ao atualizá-lo, valide o
build Vercel, o preview local e os E2E. Os diretórios gerados `.output/`,
`.nitro/` e `.vercel/` são ignorados pelo Git.

## Estilos no primeiro carregamento em desenvolvimento

`tooling/devAssetManifest` espera o servidor HTTP começar a escutar antes de
carregar `virtual:solid-manifest`. Ele precisa aparecer antes do plugin do Solid
em `appPlugins`. O Nitro pode importar esse módulo durante a inicialização; sem
a espera, o Solid grava uma URL de ponte nula e o worker SSR deixa de enviar a
CSS das rotas lazy. Isso causa texto sem estilo até o JavaScript carregar.

A espera ocorre só em `serve`, uma vez por inicialização, sem atraso por página
nem alteração no build. Em modo middleware, sem servidor HTTP próprio, o plugin
não espera um evento `listening`; o encerramento antes do bind também libera
qualquer importação pendente. O teste em `tooling/devAssetManifest` antecipa a
importação ao bind, ocupa a porta inicial e confere a URL efetiva e a CSS
devolvida pela ponte após a troca automática de porta. Ao atualizar Solid ou
Nitro, revalide essa ordem antes de retirar a integração.

Após uma edição de módulo carregado no servidor, o plugin também invalida o
manifest e avisa o runner SSR pelo canal de HMR do servidor. O cache de CSS da
ponte vive no worker isolado do Nitro e não acompanha sozinho as edições vistas
pelo Vite. Sem essa invalidação, o HTML pode trazer estilos antigos que só são
substituídos na hidratação, causando deslocamentos ao recarregar. O cache
continua disponível entre os passes da mesma renderização e entre requisições
sem edições; o plugin não envia esse aviso ao navegador nem altera o build de
produção. A regressão usa um runner com contexto global isolado, edita CSS com o
servidor ligado e confere o conteúdo atualizado e as respostas síncronas do
cache.

## Scripts

| Script                        | Descrição                                                   |
| ----------------------------- | ----------------------------------------------------------- |
| `vp run dev`                  | Servidor de desenvolvimento com HMR                         |
| `vp run dev:phone`            | Expor o servidor de desenvolvimento na rede local           |
| `vp run build`                | Build Nitro para Vercel em `.vercel/output/`                |
| `vp run start`                | Pré-visualizar o build pelo Vite                            |
| `vp run i18n:generate`        | Validar catálogos e gerar mensagens e tipos                 |
| `vp run typecheck`            | Tipos da aplicação e das ferramentas Node                   |
| `vp run typecheck:node`       | Tipos das ferramentas no ambiente Node                      |
| `vp run lint`                 | CSS, lint e tipos com cache do Vite+                        |
| `vp run lint:css`             | Verificar as regras de CSS                                  |
| `vp run format`               | Formatar código com Oxfmt                                   |
| `vp run check:ci`             | Formatação, lint e tipos da aplicação                       |
| `vp run check:fix`            | Formatação + lint corrigindo o que for possível             |
| `vp run test`                 | Todos os projetos de teste da aplicação                     |
| `vp run test:tooling`         | Testes de tooling em Node, exceto release                   |
| `vp run test:release`         | Testar a automação de release com Bun                       |
| `vp run test:ui`              | Vitest UI com cobertura; use a URL impressa (traz o token)  |
| `vp run test:ci`              | Rodar Vitest com cobertura e parar na primeira falha        |
| `vp run test:coverage`        | Rodar Vitest com cobertura                                  |
| `vp run test:unit`            | Só os projetos `node` e `dom` (happy-dom)                   |
| `vp run test:watch`           | Testes em modo de observação                                |
| `vp run test:shuffle`         | Testes em ordem aleatória, para achar dependência de ordem  |
| `vp run test:browser`         | Só o projeto `browser` (Chromium headless)                  |
| `vp run test:browser:install` | Baixar o Chromium do Playwright                             |
| `vp run test:e2e`             | Testar a aplicação com fixtures E2E                         |
| `vp run test:e2e:production`  | Testar as rotas reais de produção                           |
| `vp run test:e2e:ui`          | Abrir a interface interativa dos E2E                        |
| `vp run test:e2e:codegen`     | Abrir o gerador de testes do Playwright                     |
| `vp run deps:update`          | Selecionar atualizações de dependências                     |
| `vp run bun:update`           | Atualizar o Bun fixado e reinstalar dependências            |
| `vp run detect:duplicates`    | Procurar código duplicado em `src`                          |
| `vp run dead-code`            | Verificar código sem uso com Knip                           |
| `vp run dead-code:fix`        | Aplicar as correções do Knip                                |
| `vp run scan:secrets`         | Procurar segredos com Kingfisher (requer instalação)        |
| `vp run validate`             | check:ci + typecheck:node + test:coverage + tooling + build |
| `vp run commitlint`           | Validar mensagem de commit                                  |

## Execução e cache

O Knip executa em Bun pelo binário `knip-bun`, inclusive em `dead-code:fix`. Com
Node, o carregamento deste `vite.config.ts` pelo Jiti falha ao avaliar as
factories de `lazyPlugins`. O carregador nativo do Bun aceita a configuração.

Os scripts chamam o binário local `vp` (Vite+). `vp <comando>` executa um
comando embutido; `vp run <script>` executa um script do `package.json`. Os dois
podem divergir, então confira o `package.json` antes de rodar direto.

`vp run lint`, `vp run lint:css`, `vp run check:ci` e `vp run dead-code` usam as
tarefas com cache `lint-project`, `lint-css`, `check-project` e
`dead-code-project` do `vite.config.ts`. `vp run typecheck` usa `typecheck-app`
e `typecheck-node`, e `vp run typecheck:node` executa somente a segunda tarefa;
`vp run test:tooling` usa a tarefa `test-tooling`, sem cache, porque os testes
dependem de diretórios temporários que o cache não rastreia. O Vite+ reaproveita
resultados bem-sucedidos quando os arquivos lidos, as listagens de diretórios,
os argumentos e as variáveis de ambiente selecionadas continuam iguais. As
tarefas de lint incluem `NODE_ENV` na chave do cache; `PATH` e `NODE_OPTIONS`
chegam ao processo sem invalidar o resultado. O Vite também registra as
variáveis que carrega. A configuração do servidor limita `loadEnv` aos prefixos
`HOST` e `PORT`, para não registrar todo o ambiente.

O rastreamento automático registra os arquivos que o lint type-aware lê,
inclusive os tipos em `node_modules`, mas não vê as leituras do `tsc` nativo.
Por isso `typecheck-app` e `typecheck-node` declaram as entradas explicitamente,
incluindo fontes, configurações, `package.json` e `bun.lock`. O lockfile
representa as dependências que `vp install --frozen-lockfile` instala. O Knip
combina rastreamento automático com entradas explícitas de fontes, ferramentas e
dependências, incluindo a descoberta de novas rotas. Ao criar uma tarefa com
cache, confira com duas execuções que uma mudança num arquivo lido invalida o
resultado.

O cache mantém `typeAware` e `typeCheck` ativos e identifica na saída quando
reproduz um resultado anterior. Para executar tudo novamente, use
`vp run --no-cache lint` ou `vp run --no-cache check:ci`. Para ignorar o cache
das outras tarefas, use `vp run --no-cache typecheck`,
`vp run --no-cache lint:css` ou `vp run --no-cache dead-code`. `check:fix`,
build e as suítes do Vitest mantêm seus comandos próprios.

## Runtimes e CI

No CI e na automação de release, o `setup-vp` fornece o Node e o Bun declarados
no projeto e reaproveita o cache de pacotes. `vp install --frozen-lockfile`
instala com Bun sem permitir mudanças no lockfile. Os scripts `dev` e `build`
chamam o CLI local do Vite+ explicitamente com Bun, porque o `vp` global e os
filhos de `vp run` podem selecionar Node novamente. Use `vp run dev` e
`vp run build` para executar esses scripts. Node continua nos testes da
aplicação, nos testes de tooling e no SSR de produção: o `RuleTester` do Oxlint
recusa Bun, e a suíte Vitest apresentou incompatibilidades no carregamento de
módulos do Solid. O job `Quality` restaura `node_modules/.vite/task-cache`,
`node_modules/.vitest-cache` e `.tsbuild`, com uma chave por execução e um
prefixo de restauração restrito ao sistema operacional, arquitetura, Node, Bun e
lockfile. Vite Task, Vitest e TypeScript conferem suas entradas antes de
reaproveitar os dados. Depois dos testes com cobertura, o cache é enviado ao
GitHub, inclusive quando uma verificação anterior falha. Vite Task só guarda
resultados bem-sucedidos e Vitest guarda transformações, então uma falha não
vira um resultado de teste reaproveitado. O workflow aguarda o upload antes de
encerrar; falhas de cache não dispensam nem reprovam as verificações. Uma
execução sem cache faz as mesmas verificações. A reutilização do Vite Task entre
runners é experimental: confira os hits nos logs e compare o tempo economizado
com o custo de transferir o cache.

As tarefas de lint combinam os arquivos lidos automaticamente com entradas
explícitas para CSS, ferramentas de CSS, `package.json`, `bun.lock` e
`bunfig.toml`. Assim, a invalidação do lint de CSS não depende do rastreamento
de leituras do runtime em cada sistema operacional. A checagem de tipos também
tem entradas explícitas para fontes, declarações e configurações do TypeScript.
O Bun usa o linker isolado definido em `bunfig.toml`; somente os pacotes de
`trustedDependencies` podem executar os scripts de instalação autorizados. Os
comandos documentados usam `vp run`, e o Vite mantém seu carregamento de
variáveis por modo. `env = false` no `bunfig.toml` também evita que `bun run`
antecipe a leitura do `.env` antes de iniciar essas ferramentas.

O CI distribui as verificações entre quatro runners independentes: `Quality`,
`Tooling`, E2E com fixtures e E2E de produção. `Quality` executa formatação,
lint, tipos e cobertura, além dos testes de release em Bun quando houver
mudanças relevantes. `Tooling` executa os demais testes de tooling em Node após
a instalação, sem aguardar os checks de `Quality` nem compartilhar CPU com a
cobertura. Os quatro jobs começam juntos, cada um com seu checkout, portas e
artefatos de build isolados. A ação local `setup-project` compartilha a
instalação entre os jobs e o deploy. Esse paralelismo reduz a espera, mas repete
a preparação nos runners e pode aumentar o consumo de minutos do GitHub Actions.
O build de produção aprovado nos E2E é transferido ao deploy na mesma execução
do CI. Assim, tanto o PR quanto o push para `main` compilam duas aplicações: uma
com fixtures e outra com as rotas reais. Os testes de tooling também compilam
suas próprias fixtures menores.

`CI required` aguarda todos os jobs e só passa se todos tiverem sucesso; falhas,
cancelamentos e jobs pulados impedem sua aprovação. O deploy depende desse
resultado. A release reaproveita o CI aprovado da `main` e confere apenas o
commit de versão e changelog, conforme o
[guia de release](../tooling/release/README.md). O filtro de release condiciona
somente um passo de `Quality`, mantendo o job e o agregador obrigatórios. Os
testes da aplicação e os demais testes de tooling rodam em toda execução do CI;
o cache do Vitest guarda transformações de módulos. Em `CI=true`, Vitest e o
runner Node dos testes de tooling usam no máximo dois workers cada.

## Hooks de Git

Instalados pelo Lefthook no `vp install`, autorizado em `trustedDependencies` do
`package.json`:

| Hook         | O que roda                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `pre-commit` | `check:fix` nos arquivos staged (com re-stage) + `scan:secrets --staged` quando Kingfisher está disponível |
| `commit-msg` | `commitlint` (header até 100 caracteres; aviso para linhas do corpo e rodapé acima de 100)                 |
| `pre-push`   | `check:ci` e `typecheck:node` em sequência; depois, `test:ci`, `test:tooling` e `test:release` em paralelo |

O `pre-commit` é pulado durante `merge` e `rebase`. Em CI o Lefthook não instala
os hooks.

## Convenções de manutenção

- As versões de dependências são fixadas sem `^` (`install.exact` no
  `bunfig.toml`) para evitar quebras silenciosas. Consulte os arquivos de
  dependências para saber quais estão instaladas.
- Os overrides de `@solidjs/compiler` e `@solidjs/babel-plugin` mantêm o
  compilador alinhado ao runtime do Solid. Atualize os dois junto com `solid-js`
  e `@solidjs/web`, respeitando a compatibilidade do plugin do Vite.
- `vite-plus`, `vite`, `vitest` e os pacotes `@vitest/*` vêm do catálogo em
  `workspaces.catalog` do `package.json`; `vite` resolve para o core do Vite+.
  Atualize as versões nesse catálogo e mantenha os `@vitest/*` na versão exata
  do Vitest embutido no Vite+. O CI lê a versão do Vite+ desse catálogo.
- Commits devem seguir Conventional Commits.
- O lint é type-aware e roda com `typeCheck: true`; erros de tipo aparecem no
  `vp run lint` além do `vp run typecheck`.
- O CI, o pre-push e `vp run validate` combinam `check:ci` com `typecheck:node`
  para verificar a aplicação uma vez e preservar a checagem das ferramentas sem
  os tipos do DOM. `vp run typecheck` continua verificando os dois projetos.
- Use as versões de Node e Bun definidas em `package.json`. O `bun.lock` é o
  único lockfile do projeto.

## Referências externas

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
