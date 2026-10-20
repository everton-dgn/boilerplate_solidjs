# Releases automáticas

O workflow `Automatic release` é iniciado quando o CI de um push na `main`
termina com sucesso. Ele confere o repositório, o workflow e o SHA aprovado
antes de preparar qualquer alteração.

O processo cria uma branch `release/vX.Y.Z-<sha>` com mudanças somente em
`package.json` e `CHANGELOG.md` e abre um PR. A publicação reaproveita o CI
aprovado da origem e verifica o conteúdo exato do commit de release antes do
merge normal. Depois cria uma tag anotada e publica as notas na GitHub Release.
Não publica no npm nem faz deploy.

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
validação. O job `publish` consulta novamente o CI de origem e exige que o
commit de release seja seu filho direto. Aceita somente os dois arquivos
previstos, com tipos e permissões preservados. O `package.json` deve manter
todos os campos da origem, exceto a versão calculada; o changelog deve
corresponder ao conteúdo gerado pelo plano. Mudanças em dependências, scripts,
outros arquivos ou no conteúdo esperado impedem a publicação.

Depois dessas verificações, `publish`, com `checks: write`, registra
`CI required` no SHA exato da release. O resultado identifica a validação de
metadados e aponta para o CI aprovado da origem. A release não repete cobertura,
tooling nem E2E. Os testes específicos da automação executam em Bun no pre-push
e no CI quando houver mudanças relevantes; a publicação não os repete.

O script confere as regras ativas da `main` antes de criar qualquer artefato de
release e repete a conferência imediatamente antes do merge. Se faltar a
exigência de CI estrito, a preparação para sem criar commit, branch ou PR. As
versões de Node e Vite+ vêm do `package.json`; as dependências são instaladas
com lockfile congelado.

Os testes mantêm os projetos node, dom e browser. No CI, o provider usa o canal
`chrome` disponível no runner definido no
[workflow do CI](../../.github/workflows/ci.yml), sem baixar Chromium.
Localmente, continua usando o Chromium gerenciado pelo Playwright. O checkout
usa o SHA do evento.

Novos PRs podem cancelar seu CI anterior. Pushes não cancelam o workflow em
andamento, preservando o deploy. A release aceita somente a branch `main` no
gatilho `workflow_run`. Execuções elegíveis compartilham um grupo de
concorrência; as inelegíveis usam grupos exclusivos por execução e não
substituem uma release pendente. Entre releases elegíveis, a mais recente
substitui a pendente anterior, preservando a execução já em andamento.

## Integração com a Vercel

O projeto `boilerplate-solidjs`, no escopo `verton-toffanettos-projects`, recebe
deploys de produção pelo job `deploy` do CI. Ele depende de `check` e do E2E de
produção e executa somente em push na `main`. O CI de PRs valida o código sem
publicar na Vercel.

No push para `main`, o job de E2E de produção consulta uma vez a versão `latest`
do pacote `vercel` no registry do npm, aceita somente uma versão numérica
`x.y.z` e usa essa mesma versão em `pull`, `build` e no `deploy`, que a recebe
como output do job. Em seguida, carrega as configurações da Vercel e executa
`vercel build --prod` uma vez. O Playwright testa esse output sem recompilar,
recebendo apenas as variáveis públicas `VITE_*` daquele arquivo, sem as
credenciais de backend. O job empacota somente `.vercel/output` em tar,
preservando permissões e links, e compara o conteúdo e a listagem dos arquivos
após os testes antes de enviá-lo ao GitHub Actions. O build recusa links que
saiam do output e funções com `filePathMap`, pois essas referências exigiriam
publicar arquivos fora do artefato testado. O Nitro atual gera a função com suas
dependências dentro do output.

O job `deploy` roda sob o grupo de concorrência `vercel-production`. Antes de
qualquer preparo, consulta o head da `main` pela API e só publica se ele ainda
for o SHA validado pelo run; um run mais antigo que termine depois de outro mais
novo registra o motivo no resumo e não publica. Falha na consulta reprova o job.
Em seguida, faz checkout do mesmo SHA, prepara a toolchain do `package.json` sem
instalar dependências e baixa o artefato da mesma execução do CI. A verificação
de integridade do download causa erro se o digest divergir. O nome inclui o SHA
e o upload substitui apenas o artefato desse nome na execução atual, permitindo
repetir jobs que falharam. A retenção é de um dia; após expirar, execute
novamente o job que gera e testa o build. Arquivos de ambiente e
`.vercel/project.json` ficam fora do tar.

Depois da aprovação de todos os checks, o deploy publica esse output com
`vercel deploy --prebuilt --prod`, sem outro build. PRs não usam credenciais da
Vercel e mantêm os builds locais de teste. O script `build` chama o CLI local do
Vite+ com Bun explicitamente; para executá-lo, use `vp run build`.

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

O build usa Bun e mantém `ENABLE_EXPERIMENTAL_COREPACK=0`: no ambiente do passo
`vercel build` do CI e em `build.env` no `vercel.json`. O Corepack não gerencia
Bun. O valor no passo impede que configurações antigas baixadas por
`vercel pull` reativem o Corepack no CLI; `build.env` cobre o ambiente do build
remoto. Preserve também `LEFTHOOK=0` no deploy. As variáveis `HOST`, `PORT` e
`BASE_URL_TEST` pertencem à execução local e aos testes. O contrato atual em
`env.ts` não exige segredos de aplicação.

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

Uma release já integrada pode retomar a publicação mesmo se a proteção da `main`
tiver mudado depois do merge, pois essa retomada não altera a branch. Continuam
obrigatórias a identidade do PR, a validação do conteúdo preparado e a igualdade
dos pais e da árvore do merge com o resultado validado.

Se a versão do `package.json` estiver à frente da última tag estável, recupere a
execução original antes de iniciar outra release. Não integre manualmente um PR
de release bloqueado: uma base diferente ou alterações no merge impedem a
retomada automática. Nesse caso, é necessário revisar o SHA validado e o estado
da publicação antes de corrigir os metadados; não crie uma tag na ponta atual da
`main` apenas para fazer as versões coincidirem.

Após confirmar a publicação, a automação exclui a branch de release somente se
ela ainda aponta para o SHA validado. A exclusão usa uma comparação atômica de
SHA; uma atualização concorrente impede a limpeza. Se a branch já foi excluída,
a recuperação usa o PR integrado e não recria a branch. O PR e a tag permanecem.

Se a `main` avançar antes do merge, a execução para. Aguarde o CI do novo commit
e use essa execução como origem. O PR antigo permanece para inspeção; não há
exclusão automática de branches ou PRs abandonados antes do merge.

Se a `main` avançar entre a última conferência e a chamada de merge, a exigência
de branch atualizada do ruleset bloqueia a integração no GitHub. O script mantém
a verificação posterior dos pais e da árvore antes de criar a tag como defesa
adicional. A proteção remota precisa permanecer ativa durante a release.

Se alguém fechar o PR de release sem integrá-lo, reabra o mesmo PR antes de
reexecutar com o mesmo `source_run_id`. A automação respeita o fechamento
manual.

## Validação local e no CI

```sh
vp run test
vp run test:release
vp run typecheck
actionlint .github/workflows/auto-release.yml
```

`vp run test:release` executa apenas `tooling/release` em Bun, com isolamento
entre arquivos e timeout de 60 segundos. A suíte com subprocessos mantém o
limite de 30 segundos por teste. O comando roda em todo pre-push e faz parte de
`vp run validate`. `vp run test:tooling` mantém os demais módulos em Node.

No CI, um passo do job `Quality` compara os commits e decide se roda essa suíte.
PRs usam o ancestral comum da base com o SHA testado; pushes comparam `before`
com esse SHA. Histórico indisponível, SHA inválido ou erro de comparação fazem
os testes rodar. Renomeações são tratadas como exclusão e adição para preservar
os caminhos de origem e destino na seleção.

O filtro em `shouldTestRelease/index.ts` cobre `tooling/release/`,
`tooling/fmt.ts`, `package.json`, `bun.lock`, `bunfig.toml`, `vite.config.ts`,
`tsconfig.json`, `tsconfig.node.json`, os workflows de CI e release e as ações
locais em `.github/actions/`. Ao acrescentar uma dependência local da automação,
atualize essa lista e os testes do filtro. Mudanças somente na aplicação ou em
guias fora da pasta de release não executam a suíte no CI.

A seleção não pula o workflow nem o job `Quality`. `CI required` exige sucesso
de todos os jobs, exceto quando o push da `main` reaproveita a validação do PR,
conforme o
[guia de desenvolvimento](../../docs/development.md#reutilização-da-validação-do-pr-na-main).
A recuperação manual também mantém as verificações reais de origem, commit e
publicação; ela não repete os testes.

Os testes de integração substituem `git` e `gh` por executáveis sintéticos e
isolam o `PATH` dos subprocessos. Não usam credenciais reais nem criam releases
remotas. As fixtures ficam no diretório temporário do sistema e a suíte as
descarta ao terminar. Se uma execução interrompida deixar resíduos, use `trash`.
