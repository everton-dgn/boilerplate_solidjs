# Releases automáticas

O workflow `Automatic release` é iniciado quando o CI de um push na `main`
termina com sucesso. Ele confere o repositório, o workflow e o SHA aprovado
antes de preparar qualquer alteração.

O processo cria uma branch `release/vX.Y.Z-<sha>` com mudanças somente em
`package.json` e `CHANGELOG.md`, abre um PR e executa o CI reutilizável nesse
commit. Após a validação, integra com merge normal, cria uma tag anotada e
publica as notas na GitHub Release. Não publica no npm nem faz deploy.

## Versionamento

| Commit                                                             | Incremento                 |
| ------------------------------------------------------------------ | -------------------------- |
| `feat`                                                             | Minor                      |
| `fix`, `perf`, `revert`                                            | Patch                      |
| `chore(deps)`, `chore(deps-dev)`, `build(deps)`, `build(deps-dev)` | Patch                      |
| `!` no cabeçalho ou rodapé `BREAKING CHANGE:`                      | Major                      |
| Outros tipos, sem mudança incompatível                             | Não geram release sozinhos |

A primeira release parte de `0.0.0` e gera `1.0.0`. Depois disso, a versão do
`package.json` deve coincidir com a última tag estável alcançável pelo commit.
Se houver mais de um tipo de mudança, vale o maior incremento.

As notas preenchidas manualmente em `## Unreleased` são preservadas. Quando essa
seção está vazia, as notas são geradas dos commits, agrupadas em `Added`,
`Changed` e `Fixed`. O Oxfmt do Vite+ formata os arquivos gerados.

## Ativação no GitHub

Em Settings > Actions > General > Workflow permissions, habilite a opção
"Permitir que o GitHub Actions crie e aprove pull requests" ("Allow GitHub
Actions to create and approve pull requests"). O workflow solicita
`contents: write` e `pull-requests: write` somente nas etapas de preparação e
publicação. Ele não aprova o próprio PR nem ignora regras de proteção.

O ruleset `.github/main-ruleset.json` protege a `main`: exige PR, merge normal,
conversas resolvidas e o check `CI required` do GitHub Actions, com a branch
atualizada antes do merge. Bloqueia exclusão e force push, sem atores com
bypass, inclusive administradores. Não exige aprovação humana, para permitir a
release automática e o trabalho individual no repositório.

O JSON é o contrato versionado da configuração remota. Alterá-lo no Git não
atualiza o GitHub automaticamente; mudanças precisam ser aplicadas ao ruleset
pela API ou pela interface do repositório.

PRs criados pelo `GITHUB_TOKEN` não dependem de um novo evento de PR para
validação: a automação chama `ci.yml` diretamente com o SHA preparado. Esse job
tem apenas `contents: read`. Após seu sucesso, o job `publish`, com
`checks: write`, associa o resultado ao SHA exato preparado usando a API de
check runs. Antes disso, o script confere as regras ativas da `main` e recusa o
merge se faltar a exigência de CI estrito. As versões de Node e Vite+ vêm do
`package.json`; as dependências são instaladas com lockfile congelado.

Os testes mantêm os projetos node, dom e browser. No CI, o provider usa o canal
`chrome` disponível no runner `ubuntu-24.04`, sem baixar Chromium. Localmente,
continua usando o Chromium gerenciado pelo Playwright. O checkout usa o SHA do
evento ou o SHA explícito da chamada reutilizável.

Novos PRs podem cancelar seu CI anterior. Pushes não cancelam o workflow em
andamento, preservando o deploy. A release aceita somente a branch `main` no
gatilho `workflow_run`. Execuções elegíveis compartilham um grupo de
concorrência; as inelegíveis usam grupos exclusivos por execução e não
substituem uma release pendente. Entre releases elegíveis, a mais recente
substitui a pendente anterior, preservando a execução já em andamento.

## Integração com a Vercel

O projeto `boilerplate-solidjs`, no escopo `verton-toffanettos-projects`, recebe
deploys de produção pelo job `deploy` do CI. Ele depende de `check` e executa
somente em push na `main`. PRs e chamadas reutilizáveis usadas pela release
validam o código sem publicar na Vercel.

O job faz checkout do SHA validado, prepara Node e Vite+ com as versões do
`package.json` e instala com `vp install --frozen-lockfile`. A CLI Vercel
`59.11.7` carrega as configurações de produção, executa `vercel build --prod` e
publica o resultado com `vercel deploy --prebuilt --prod`. O script `build` do
projeto continua usando `vp build`.

O GitHub precisa destas configurações em Settings > Secrets and variables >
Actions:

| Tipo     | Nome                | Finalidade                                 |
| -------- | ------------------- | ------------------------------------------ |
| Secret   | `VERCEL_TOKEN`      | Autorizar build e deploy no projeto Vercel |
| Variable | `VERCEL_ORG_ID`     | Identificar a equipe da conta pessoal      |
| Variable | `VERCEL_PROJECT_ID` | Identificar o projeto de destino           |

Os IDs e o secret `VERCEL_TOKEN` estão cadastrados no GitHub. A credencial
`github-boilerplate-solidjs-ci` está restrita ao projeto `boilerplate-solidjs`,
sem expiração. Ela pode ser gerenciada em
[Tokens da Vercel](https://vercel.com/account/tokens). O valor fica somente no
secret do repositório, sem ser adicionado aos arquivos de ambiente.

O vínculo Git também foi desconectado no projeto remoto. O `vercel.json`
desativa deploys disparados pela integração Git com
`git.deploymentEnabled: false`. Isso preserva a exigência de publicar pelo CI
mesmo se o repositório for reconectado à Vercel.

Na Vercel, `ENABLE_EXPERIMENTAL_COREPACK=1` está configurado para Production,
Preview e Development; `LEFTHOOK=0`, para Production e Preview. As variáveis
`HOST`, `PORT` e `BASE_URL_TEST` pertencem à execução local e aos testes. O
contrato atual em `env.ts` não exige segredos de aplicação.

A automação de release usa o token automático do GitHub. Ela só começa após o CI
completo passar, incluindo o deploy. O merge de versionamento feito pelo
`GITHUB_TOKEN` não dispara um segundo CI: a release publica a tag e as notas,
sem um segundo deploy para a mudança de `package.json` e `CHANGELOG.md`.

## Recuperação

Na aba Actions, execute manualmente `Automatic release`, na branch `main`,
informando em `source_run_id` o ID do CI de push que originou a release. Uma
nova execução reutiliza a branch e o PR existentes, valida novamente o commit e
retoma após merge ou criação da tag, se necessário. Tags existentes com outro
SHA e releases com notas divergentes provocam erro; não são sobrescritas.

Se a `main` avançar antes do merge, a execução para. Aguarde o CI do novo commit
e use essa execução como origem. O PR antigo permanece para inspeção; não há
exclusão automática de branches ou PRs.

Se a `main` avançar entre a última conferência e a chamada de merge, a exigência
de branch atualizada do ruleset bloqueia a integração no GitHub. O script mantém
a verificação posterior dos pais e da árvore antes de criar a tag como defesa
adicional. A proteção remota precisa permanecer ativa durante a release.

Se alguém fechar o PR de release sem integrá-lo, reabra o mesmo PR antes de
reexecutar com o mesmo `source_run_id`. A automação respeita o fechamento
manual.

## Validação local

```sh
pnpm test
pnpm typecheck
actionlint .github/workflows/ci.yml .github/workflows/auto-release.yml
```

Os testes de release integram o projeto `node` do Vitest e executam junto com os
demais em `pnpm test` e `pnpm test:ci`. A suíte com subprocessos tem timeout de
30 segundos por teste. Para executar somente os testes de release, use
`pnpm test --project node tooling/release`.

Os testes de integração substituem `git` e `gh` por executáveis sintéticos e
isolam o `PATH` dos subprocessos. Não usam credenciais reais nem criam releases
remotas. As fixtures ficam no diretório temporário do sistema para inspeção;
quando necessário, remova-as com `trash`.
