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
`vp run start --port 3001` ou `vp run start --host 0.0.0.0`. No servidor de
desenvolvimento a flag `--port` não muda a porta; use `PORT=3001 vp run dev`.

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

O worker SSR do Nitro é isolado e busca a CSS das rotas lazy numa ponte HTTP do
servidor de desenvolvimento. O plugin do Solid descobre a URL dessa ponte depois
que o servidor começa a escutar, mesmo quando o Nitro importa o manifest antes,
e limpa o cache da ponte no worker depois de cada edição. Sem isso, o primeiro
HTML sai sem estilos até o JavaScript carregar, ou traz estilos antigos que só
são trocados na hidratação.

Os E2E rodam no build de produção e não cobrem esse caminho. Ao atualizar o
plugin do Solid ou o Nitro, confira com `vp run dev` que o primeiro HTML de uma
página, pedido logo depois de o servidor subir, traz os
`<style data-vite-dev-id>` das rotas, e que uma edição num CSS de rota aparece
no HTML da requisição seguinte.

## Scripts

| Comando                                                       | Descrição                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `vp run dev`                                                  | Servidor de desenvolvimento com HMR                                               |
| `vp run dev:phone`                                            | Expor o servidor de desenvolvimento na rede local                                 |
| `vp run build`                                                | Build Nitro para Vercel em `.vercel/output/`                                      |
| `vp run start`                                                | Pré-visualizar o build pelo Vite                                                  |
| `vp run i18n:generate`                                        | Validar catálogos e gerar mensagens e tipos                                       |
| `vp run typecheck`                                            | Tipos da aplicação e das ferramentas Node                                         |
| `vp run typecheck:node`                                       | Tipos das ferramentas no ambiente Node                                            |
| `vp run lint`                                                 | CSS, lint e tipos com cache do Vite+                                              |
| `vp run lint:css`                                             | Verificar as regras de CSS                                                        |
| `vp run format`                                               | Formatar código com Oxfmt                                                         |
| `vp run check:ci`                                             | Formatação, lint e tipos da aplicação                                             |
| `vp run check:fix`                                            | Formatação + lint corrigindo o que for possível                                   |
| `vp run test`                                                 | Todos os projetos de teste da aplicação                                           |
| `vp run test:tooling`                                         | Testes de tooling em Node, exceto release                                         |
| `vp run test:release`                                         | Testar a automação de release com Bun                                             |
| `vp run i18n:generate && vp test --ui --coverage`             | Vitest UI com cobertura; use a URL impressa (traz o token)                        |
| `vp run test:ci`                                              | Rodar Vitest com cobertura e parar na primeira falha                              |
| `vp run test:coverage`                                        | Rodar Vitest com cobertura                                                        |
| `vp run test:unit`                                            | Só os projetos `node` e `dom` (happy-dom)                                         |
| `vp run i18n:generate && vp test watch`                       | Testes em modo de observação                                                      |
| `vp run test:shuffle`                                         | Testes em ordem aleatória, para achar dependência de ordem                        |
| `vp run test:browser`                                         | Só o projeto `browser` (Chromium headless)                                        |
| `vp run test:browser:install`                                 | Baixar o Chromium do Playwright                                                   |
| `vp run test:e2e`                                             | Testar a aplicação com fixtures E2E                                               |
| `vp run test:e2e:production`                                  | Testar as rotas reais de produção                                                 |
| `vp exec playwright test --config tooling/playwright.ts --ui` | Abrir a interface interativa dos E2E                                              |
| `vp exec playwright codegen`                                  | Abrir o gerador de testes do Playwright                                           |
| `bunx taze newest -l -I`                                      | Selecionar atualizações de dependências                                           |
| `vp run bun:update`                                           | Atualizar o Bun fixado e reinstalar dependências                                  |
| `vp run detect:duplicates`                                    | Procurar código duplicado em `src`                                                |
| `vp run dead-code`                                            | Verificar código sem uso com Knip                                                 |
| `vp run dead-code:fix`                                        | Aplicar as correções do Knip                                                      |
| `vp run scan:secrets`                                         | Procurar segredos com Kingfisher (requer instalação)                              |
| `vp run validate`                                             | check:ci + typecheck:node + dead-code + test:coverage + tooling + release + build |
| `vp run commitlint`                                           | Validar mensagem de commit                                                        |

## Execução e cache

O Knip executa em Bun pelo binário `knip-bun`, inclusive em `dead-code:fix`. Com
Node, o carregamento deste `vite.config.ts` pelo Jiti falha ao avaliar as
factories de `lazyPlugins`. O carregador nativo do Bun aceita a configuração.

Os scripts chamam o binário local `vp` (Vite+). `vp <comando>` executa um
comando embutido; `vp run <script>` executa um script do `package.json` ou uma
tarefa do `vite.config.ts`. Os dois podem divergir, então confira o
`package.json` antes de rodar direto.

Execute comandos interativos diretamente. Para selecionar atualizações, use
`bunx taze newest -l -I`; sem `-I`, o taze apenas lista as versões disponíveis.
O `vp update --latest` e o `vp outdated` comparam cada pacote só com a dist-tag
`latest` e omitem versões publicadas apenas em outra tag, como as RCs do Solid
na `next`. O modo `newest` também oferece pré-releases de pacotes estáveis, e o
`-l` é necessário porque o `package.json` fixa versões exatas. O seletor abre
com todas as atualizações marcadas, inclusive o Node do `devEngines` e as GitHub
Actions; tecle `a` para desmarcar tudo antes de escolher. Observado no macOS:
sob `vp run`, o script recebe o stdin em modo não bloqueante quando o bloco
`run` deste `vite.config.ts` usa constantes, como `CSS_CACHE_INPUTS`. Segundo o
mantenedor, o Vite+ carrega configurações dinâmicas e estáticas por caminhos
diferentes, e a carga dinâmica lê `process.isTTY`, momento em que o Node passa o
stdin para o modo não bloqueante. Uma leitura bloqueante falha na hora com
`EAGAIN`, e o seletor do `vp update` fecha com zero pacotes selecionados antes
de receber entrada. O do taze desenha a lista, mas não recebe as teclas.
`bun run <script>` não tem o problema. O defeito está registrado em
[vite-plus#3155](https://github.com/voidzero-dev/vite-plus/issues/3155); retire
esta orientação quando `vp run deps:update` voltar a receber a seleção. A tabela
acima também mantém Vitest em observação, interfaces de teste e o gerador do
Playwright fora desse runner. Os scripts `deps:update`, `test:ui`, `test:watch`,
`test:e2e:ui` e `test:e2e:codegen` continuam no `package.json` para
compatibilidade: rode-os com `bun run <script>`, como `bun run test:watch`, ou
use o comando direto da tabela, nunca `vp run`.

`vp run lint`, `vp run lint:css`, `vp run check:ci` e `vp run dead-code` usam as
tarefas com cache `lint-project`, `lint-css`, `check-project` e
`dead-code-project` do `vite.config.ts`. `lint-project` e `check-project`
declaram `dependsOn: ['lint-css']`: o lint de CSS roda antes, com cache e
entradas próprias, e uma mudança só em TypeScript não o executa de novo. As duas
tarefas compartilham as entradas da constante `PROJECT_CHECK_INPUTS`.
`vp run typecheck` usa `typecheck-app` e `typecheck-node`, e
`vp run typecheck:node` executa somente a segunda tarefa; `vp run test:tooling`
usa a tarefa `test-tooling`, sem cache, porque os testes dependem de diretórios
temporários que o cache não rastreia. O Vite+ reaproveita resultados
bem-sucedidos quando os arquivos lidos, as listagens de diretórios, os
argumentos e as variáveis de ambiente selecionadas continuam iguais. As tarefas
de lint incluem `NODE_ENV` na chave do cache; `PATH` e `NODE_OPTIONS` chegam ao
processo sem invalidar o resultado. O Vite também registra as variáveis que
carrega. A configuração do servidor limita `loadEnv` aos prefixos `HOST` e
`PORT`, para não registrar todo o ambiente.

O rastreamento automático registra os arquivos que o lint type-aware lê,
inclusive os tipos em `node_modules`, mas não vê as leituras do `tsc` nativo.
Por isso `typecheck-app` e `typecheck-node` declaram as entradas explicitamente,
incluindo fontes, configurações, `package.json` e `bun.lock`. De `src/` entram
só os arquivos `.ts`, `.tsx` e `.json`, que o `tsc` lê; CSS, imagens e fontes
chegam por declarações de módulo e não invalidam a checagem. O lockfile
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
`vp run build` para executar esses scripts. A automação de release e seus testes
(`vp run test:release`) rodam em Bun. Node continua nos testes da aplicação, nos
demais testes de tooling e no SSR de produção: o `RuleTester` do Oxlint recusa
Bun, e a suíte Vitest apresentou incompatibilidades no carregamento de módulos
do Solid. O job `Quality` restaura `node_modules/.vite/task-cache`,
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

No CI, só `Quality` envia o cache de pacotes, e apenas quando a chave do
lockfile não existe e o job termina com sucesso. `Tooling` e E2E passam
`cache-save: false` à ação `setup-project` e só restauram. `Reuse proof` e
deploy passam também `install-dependencies: false`: a ação prepara Vite+, Node e
Bun do `package.json`, sem cache de pacotes nem `vp install`. O deploy só
executa `vp dlx` sobre o artefato testado. Com `cache: false`, o `setup-vp` não
restaura nem salva o cache, e `cache-save` e `cache-dependency-path` não têm
efeito. Num run experimental, sem token nem deploy real, o preparo somado à
primeira chamada `vercel --version` levou 8,1 s contra 18,6 s do preparo
completo, cerca de 10 s a menos, com as mesmas versões de Node, Bun, Vite+ e
Vercel CLI e sem `node_modules`. Foi uma única amostra, que mede só essa chamada
do CLI; acompanhe o tempo do deploy real depois do merge. A automação de release
usa a mesma ação: o job de plano, sem permissão de escrita, instala as
dependências e restaura o cache sem enviá-lo; os jobs com escrita passam
`install-dependencies: false` e não instalam nem importam pacotes, conforme o
[guia de release](../tooling/release/README.md#ativação-no-github).

A tarefa `lint-css` combina os arquivos lidos automaticamente com entradas
explícitas para CSS, ferramentas de CSS, `package.json`, `bun.lock` e
`bunfig.toml`. Assim, a invalidação do lint de CSS não depende do rastreamento
de leituras do runtime em cada sistema operacional. `lint-project` e
`check-project` declaram fontes, declarações, configurações do TypeScript e os
arquivos de dependências. A checagem de tipos também tem entradas explícitas
para fontes, declarações e configurações do TypeScript. O Bun usa o linker
isolado definido em `bunfig.toml`; somente os pacotes de `trustedDependencies`
podem executar os scripts de instalação autorizados. Os comandos documentados
usam `vp`, e o Vite mantém seu carregamento de variáveis por modo. `env = false`
no `bunfig.toml` também evita que `bun run` antecipe a leitura do `.env` antes
de iniciar essas ferramentas. O `bunfig.toml` do projeto não define
`minimumReleaseAge`, cujo padrão no Bun é desligado: uma quarentena de versões
configurada no bunfig global do desenvolvedor continua valendo, e o bunfig local
só a anularia se repetisse a chave. Com essa quarentena, versões publicadas há
menos tempo que o limite ficam fora das atualizações.

O CI distribui as verificações entre quatro runners independentes: `Quality`,
`Tooling`, E2E com fixtures e E2E de produção. No push da `main`, os três
primeiros podem ser dispensados pela prova descrita abaixo. `Quality` executa
formatação, lint, tipos, código sem uso (Knip) e cobertura, além dos testes de
release em Bun quando houver mudanças relevantes. Em PRs, também valida com o
commitlint do projeto as mensagens de todos os commits entre a base e o head.
`Tooling` executa os demais testes de tooling em Node após a instalação, sem
aguardar os checks de `Quality` nem compartilhar CPU com a cobertura. Os quatro
jobs rodam em paralelo, cada um com seu checkout, portas e artefatos de build
isolados; no push da `main`, os três reutilizáveis começam depois do
`Reuse proof`, e o E2E de produção não espera por ele. A ação local
`setup-project` compartilha a instalação entre os jobs e o deploy. Esse
paralelismo reduz a espera, mas repete a preparação nos runners e pode aumentar
o consumo de minutos do GitHub Actions. O build de produção aprovado nos E2E é
transferido ao deploy na mesma execução do CI. Assim, tanto o PR quanto o push
para `main` compilam duas aplicações: uma com fixtures e outra com as rotas
reais. Os testes de tooling também compilam suas próprias fixtures menores.

`CI required` aguarda todos os jobs e exige sucesso de `Quality`, `Tooling`,
`E2E (fixtures)` e `E2E (production)`; falhas, cancelamentos e jobs pulados
impedem sua aprovação. O resultado do `Reuse proof` não é exigido como job: ele
fica pulado em todo PR e, no push da `main`, só autoriza aceitar como `skipped`
os jobs que a prova aprovada dispensou (`Quality` apenas quando a prova não
pediu sua execução). `E2E (production)` nunca é dispensado. O deploy depende
desse resultado. A release reaproveita o CI aprovado da `main` e confere apenas
o commit de versão e changelog, conforme o
[guia de release](../tooling/release/README.md). O filtro de release condiciona
somente um passo de `Quality`, mantendo o job e o agregador obrigatórios. Os
testes da aplicação e os demais testes de tooling rodam em toda execução do CI,
exceto no push da `main` com prova aprovada, que dispensa `Quality`, `Tooling` e
`E2E (fixtures)`; o cache do Vitest guarda transformações de módulos. Em
`CI=true`, o Vitest usa no máximo dois workers e o runner Node dos testes de
tooling, no máximo três.

### Reutilização da validação do PR na main

O push da `main` é um merge commit criado pelo GitHub a partir de um PR
atualizado com a base, exigido pela proteção da branch. Quando o run desse PR já
testou a mesma árvore, o job `Reuse proof` dispensa `Quality`, `Tooling` e
`E2E (fixtures)`. `E2E (production)`, o build do artefato e o deploy executam
sempre, sem depender da prova.

No PR, o `Quality` publica o artifact `ci-reuse-evidence-<tentativa>` com o SHA
do merge sintético que o checkout testou, sua árvore e seus parents, o head e a
base do evento, o número do PR, o run, a tentativa e o `workflow_ref`. No push,
`tooling/ciReuse/prove-reuse.ts` roda no Node declarado no projeto, sem instalar
dependências, e aprova a reutilização somente quando todas estas condições
valem:

- o commit da `main` tem exatamente dois parents e não altera `.github/` nem
  `tooling/ciReuse/`, inclusive por renomeação para fora dessas pastas. Assim, o
  run do PR usou o mesmo workflow da `main` e executou os testes do verificador;
  o PR não executa a prova, que só roda no push da `main`;
- há um único PR integrado com esse merge commit, do próprio repositório, com
  base `main`, base e head iguais aos parents, sem outro PR com o mesmo head
  testado e sem mudança de base na timeline;
- há um único run `pull_request` de `ci.yml` para o head, concluído com sucesso,
  do mesmo repositório e branch;
- na tentativa desse run, `Quality`, `Tooling` e `E2E (fixtures)` existem, são
  da mesma tentativa e terminaram com sucesso. Re-run parcial que não repita os
  três jobs não serve como prova;
- a evidência da mesma tentativa pertence ao run e ao head, descreve o run, o PR
  e a base `main`, e o commit sintético consultado na API do GitHub tem os
  mesmos parents e a mesma árvore do merge da `main`.

Qualquer ausência, ambiguidade, timeout, erro de API ou PR anterior à evidência
resulta em CI completo. O gate aceita `skipped` somente com a prova aprovada no
mesmo run. Checks sintetizados pela release não contam como prova.

`Quality` também roda quando o merge altera `bun.lock`, `package.json` ou
`bunfig.toml`, ou quando a `main` não tem as entradas de cache de pacotes e de
validação para o lockfile e a toolchain atuais. Ele é o único job que grava
esses caches. A chave de pacotes e o prefixo de restauração da validação só
mudam nesses casos; com o `Quality` dispensado, os PRs continuam restaurando a
última entrada de validação da `main` com o mesmo prefixo, que envelhece
conforme a árvore muda e pode reduzir os acertos do Vite Task e do Vitest até a
próxima mudança de lockfile.

O verificador e o workflow continuam sendo código revisado da `main`: um merge
que altere `.github/` ou `tooling/ciReuse/` sempre executa o CI completo. A
reutilização também dispensa a segunda execução que, às vezes, reprovava na
`main` um teste instável que tinha passado no PR com a mesma árvore. Para
repetir toda a validação de um commit, dispare o workflow manualmente
(`workflow_dispatch`). Esse modo não publica na Vercel e usa outro grupo de
concorrência, para não substituir um push pendente.

### Como medir uma otimização da CI

Separe consumo de runner e tempo de espera. O primeiro é a soma das durações dos
jobs, calculadas entre `started_at` e `completed_at`, dividida por 60; jobs
`skipped` não entram nessa soma. O tempo de espera vai da criação do run até a
conclusão do último job. Jobs paralelos contam separadamente no consumo, mas
seus tempos não devem ser somados para calcular a espera. Ao calcular o consumo
diário, inclua tentativas refeitas e jobs que falharam ou foram cancelados
depois de começar; considerar só o último run verde subestima o uso de runners.

Para atribuir um ganho à mudança, compare base e candidato no mesmo runner, com
instalações congeladas e a mesma suíte. O
[benchmark controlado de tooling](https://github.com/everton-dgn/boilerplate_solidjs/actions/runs/39179789819)
intercalou duas execuções da base `73f5eec` com duas do candidato `a3064b9`. As
médias do comando de testes foram 132,8015 s e 92,578 s, uma redução de 40,2235
s (30,3%), sem incluir instalação e preparação do job. O candidato combina a
divisão das suítes, três workers no tooling e a espera pelo evento `ready` do
watcher; o benchmark mede o efeito conjunto dessas mudanças. Essas medições
cobrem os 114 testes anteriores à inclusão de `ciReuse`; não constituem uma
comparação controlada da suíte ampliada. Os detalhes e a execução intermediária
estão na [PR #85](https://github.com/everton-dgn/boilerplate_solidjs/pull/85).

Para conferir o reaproveitamento após um merge, verifique o run de origem
registrado por `Reuse proof`, os jobs dispensados e os resultados de
`CI required` e `E2E (production)`. Confira também que o passo
`Deploy tested production artifact` realmente executou. Um job de deploy que
recusou um commit antigo pela guarda de freshness não publicou esse commit.

O status global verde, sozinho, não comprova a publicação. No
[run 39185269805](https://github.com/everton-dgn/boilerplate_solidjs/actions/runs/39185269805),
a prova aprovou o reaproveitamento e o E2E de produção passou, mas o GitHub
pulou o deploy por causa do `success()` implícito na cadeia de dependências.
Essa execução não deve ser contada como economia do fluxo completo.

Uma mudança no próprio workflow força o CI completo e inclui o custo da prova.
Meça esse caminho separadamente dos merges elegíveis ao reaproveitamento. Ao
projetar minutos por dia, informe a janela e a frequência observadas; não some a
economia de um job mais rápido com a economia de dispensar esse mesmo job na
mesma execução.

## Hooks de Git

Instalados pelo Lefthook no `vp install`, autorizado em `trustedDependencies` do
`package.json`:

| Hook         | O que roda                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | `check:fix` nos arquivos staged (com re-stage) + `scan:secrets --staged` quando Kingfisher está disponível                                                |
| `commit-msg` | `commitlint` (header até 100 caracteres; linha em branco antes do rodapé; aviso para linhas do corpo e rodapé acima de 100)                               |
| `pre-push`   | `check:ci`, `typecheck:node` e `test:ci` em sequência; depois, `test:tooling` e `test:release` em paralelo; a primeira falha interrompe os jobs seguintes |

O `pre-commit` é pulado durante `merge` e `rebase`. Em CI o Lefthook não instala
os hooks; o job `Quality` repete o commitlint nos commits de cada PR. O
`pre-push` usa `piped: true`, porque sem ele o Lefthook continua os jobs
seguintes depois de uma falha.

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

- SolidJS: https://v2.solidjs.com
- Solid Router: https://v2.solidjs.com/routing/solid-router
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
