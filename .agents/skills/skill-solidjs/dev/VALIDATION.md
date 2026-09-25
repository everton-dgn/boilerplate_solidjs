# Validação da skill

## Provas retiradas em 25/09/2026

As provas de runtime desta skill, os scripts (auditor, contratos do Solid 1 e verificador, com suas suítes), o harness Vitest da skill de testes e os testes dos exemplos foram executados para os resultados registrados abaixo e retirados do repositório em 25/09/2026; o corpus de avaliação (`dev/evals`) já tinha sido retirado em 24/09/2026. Os números deste arquivo são históricos. Para conferir uma regra, use a documentação oficial e o [mapa de código e testes do Solid](notes/upstream-code-and-tests.md).

## Revisão 1.4.0, 23/09/2026

Integração da varredura anual de comunidade sobre a base da revisão 1.3.0,
sem trocar o pacote-base (`solid-js`/`@solidjs/web` continuam em
2.0.0-rc.9). Comandos rodados na raiz do repositório, Node v24.20.0, nesta
sessão de integração.

### Estrutura das duas skills

| Verificação | Resultado |
| --- | --- |
| `node .agents/skills/skill-solidjs/scripts/verify-package.mjs --json --irma .agents/skills/skill-solidjs-testing` | 0 erros; 61 arquivos, 35 referências, 53 Markdown, 487 links internos, 116 fontes, 72 casos versionados |
| Tamanho do SKILL.md principal (`wc -c`) | 14.464 bytes, cerca de 3.616 tokens a 4 bytes por token, abaixo do teto de 4.000 |
| Versão nos metadados | principal 1.4.0; skill de testes mantida em 2.0.0 (corpo pertence à frente de testes; frontmatter e links já estavam corretos) |

### Execução dos testes novos desta rodada

Todos reexecutados nesta integração, cada um comparado contra a contagem já
relatada pela frente que o escreveu; nenhuma divergência encontrada.

| Grupo | Coletados | Aprovados |
| --- | ---: | ---: |
| Core, dev | 11 | 11 |
| Core, padrão | 2 | 2 |
| Async/DOM, grafo cliente | 11 | 11 |
| Async/DOM e filho falsy, Chromium | 11 em 2 arquivos | 11 |
| Server functions | 10 | 10 |
| Meta (8 arquivos `.mjs`) | 38 | 38 |
| Skill de testes, suíte inteira | 129 em 35 arquivos | 129 |

Soma: **212 testes aprovados, zero skips, zero falhas**, em 15 comandos.
Nenhum teste usa `sleep` fixo como oráculo; a seção "Confusões frequentes
refutadas" de `references/16-migration-from-solid-1.md`, no repositório de
origem, lista o que cada refutação mudou de conclusão.

### Não verificado nesta rodada

- Os 1.007 itens "novo, plausível, sem prova" da varredura anual não geraram
  teste; ficam para uma rodada futura.
- A maior parte dos itens `secondary` (407 no total, entre as cinco frentes) e
  `watch` (296, mudanças do branch `next`) não foi individualmente avaliada;
  critério e exceções aplicadas estão nas notas de cada frente.
- `vp lint` continua reprovando os arquivos `.test.mjs` e `.browser.test.tsx`
  por regras tipadas sem globais de Node/browser; confirmado como ruído
  pré-existente, reproduzido também em arquivos intocados desta rodada.
- As contagens de mensagens, threads, issues e posts da varredura (Discord,
  GitHub, Reddit, blogs) vêm do raspador da sessão de pesquisa; esta
  integração conferiu a ordem de grandeza pelos arquivos de trabalho (168
  threads, 333 blocos de extração e 4.179 vereditos batem exatamente), sem
  reprocessar a coleta.

## Revisão 1.3.0, 23/09/2026

Todos os comandos abaixo rodaram na raiz do repositório, com Node v24.20.0, na integração de 23/09/2026. As contagens vêm desta execução; `vitest` e `tsc` são os binários de `./node_modules/.bin/`.

### Estrutura das duas skills

| Verificação | Resultado |
| --- | --- |
| `node .agents/skills/skill-solidjs/scripts/verify-package.mjs --json` | 0 erros; 61 arquivos, 35 referências, 42 Markdown, 377 links internos, 105 fontes, 66 casos |
| Verificador da integração (fora do repositório): frontmatter pelo parser `yaml` estrito e regras do `quick_validate` do Codex, links e âncoras resolvidos por `.agents/skills` e por `.claude/skills`, travessões e recursos exclusivos de um agente | 0 problemas nas duas skills e nas duas raízes; principal com 377 links internos fora de blocos de código; testes com 87, dos quais 29 apontam para a principal |
| Controles negativos do mesmo verificador | 11 de 11 detectados: YAML com `: ` sem aspas, chave `when_to_use`, `<` na description, nome diferente da pasta, metadata numérica, `${CLAUDE_SKILL_DIR}` no corpo, link ausente, âncora ausente, âncora válida aceita, link para fora das skills e travessão |
| Tamanho do SKILL.md principal (`wc -c`) | 12.583 bytes, cerca de 3.146 tokens a 4 bytes por token, abaixo do teto de 4.000; 77 linhas. As sete regras começam em 11% do arquivo e a última começa em 36% |
| Tamanho do SKILL.md de testes | 8.593 bytes, cerca de 2.150 tokens |
| Description | principal com 199 caracteres; testes com 202 |

Sem `--irma`, o verificador distribuído cobre só a skill principal e recusa links que saem da pasta dela; com `--irma ../skill-solidjs-testing`, ele soma os arquivos da skill de testes e valida os 29 links dela que voltam para a principal (0 erros, 464 links internos no total). Nesta revisão, a skill de testes também foi conferida pelo verificador da integração. Antes da correção, a description da skill de testes reprovava no parser estrito; o Claude Code desta sessão listava a skill mesmo assim.

### Execução

| Grupo | Coletados | Aprovados |
| --- | ---: | ---: |
| Grafo dev | 22 | 22 |
| Grafo padrão | 19 | 19 |
| SSR produção | 17 | 17 |
| SSR dev | 17 | 17 |
| Mutantes SSR, produção e dev | 9 e 9 | 9 e 9 |
| Hidratação no Chromium | 14 | 14 |
| DOM no Chromium | 18 | 18 |
| Mutantes DOM | 18 | 17 mutantes reprovados, 1 caso intacto aprovado |
| Projeto browser inteiro | 42 | 42 |
| Vitest da skill de testes | 75 | 75 |
| Controles do Vitest | 7 | 7 |
| Produção no Vitest (`NODE_ENV=production`) | 6 | 6 |
| Produção sem `NODE_ENV` (controle) | 6 | 1, com 5 falhas esperadas |
| Contratos do Solid 1 (`scripts/v1-contracts.test.mjs`) | 22 | 22 |
| Auditor (`scripts/audit-project.test.mjs`) | 31 | 31 |
| Verificador (`scripts/verify-package.test.mjs`) | 3 | 3 |
| Utilitários puros dos exemplos | 18 | 18 |
| Exemplo Tarefas no Chromium, com config temporária | 10 | 10 |
| Baseline anterior, em quatro grupos | 7, 8, 6, 4 | 7, 8, 6, 4 |

Zero skips, cancelados ou `todo` em todos os grupos. Os quatro typechecks (provas no cliente, provas no servidor, exemplos e harness da skill de testes) saíram com código 0 e sem saída.

### Provas das frentes que não reexecutei

- Mutantes do grafo (12 de 12 reprovados) e do auditor (17 de 18; o sobrevivente só afeta `export {} from`).
- Execução do halt no Chromium, que deve sair com código 1 com o teste verde.
- Receitas da skill de testes (26 de 26, produção 2 de 2) e `@solidjs/testing-library` 1.0.0-beta.3 (10 de 10), ambas em sandbox fora do repositório.
- Sondas de tipos (`tsc`) para retorno implícito no setter e no apply, opções do plugin e matchers do jest-dom, também fora do repositório.
- Sondas de open redirect (5 de 5) e documento autoral com `NoHydration` (6 de 6), fora do repositório.

### Não verificado

- Disparo automático das skills pelo modelo, no Claude Code e no Codex. A exibição da nova description no Codex não foi medida de novo; o corte de cerca de 208 caracteres vem da inspeção anterior.
- Checkout com `core.symlinks=false` e coleta dos testes da skill pelo Vitest de outro projeto.
- O teste de navegador do exemplo Tarefas não estava no `include` da config versionada do harness; rodou com config temporária.
- Hidratação de ponta a ponta dentro do Vitest, `edge-runtime`, jsdom, Vitest 5 e comportamentos só presentes em `next`.
- `vp lint` do projeto reprova antes desta rodada nos arquivos do harness e da skill (regras tipadas sem globais de Node); não foi corrigido.

## Revisão 1.2.0, 22/09/2026

Registro histórico. As contagens atuais estão na revisão 1.3.0 acima.

As duas skills passaram na validação de frontmatter. O verificador estrutural
da principal conferiu referências, links e IDs de fontes. Os 37 testes do
auditor e dos dois utilitários puros passaram novamente, com zero skips e
cleanup pela lixeira. Execução do agente principal: Node v24.20.0.

O typecheck dos seis exemplos que dependem de Solid passou contra os pacotes
instalados depois de corrigir três atributos ARIA que recebiam booleanos onde
o renderer exige valores textuais enumerados. O typecheck conjunto das
fixtures também passou. Parsing isolado não teria detectado esses erros.

A pesquisa acrescentou execução do grafo cliente, JSX compilado em DOM,
Chromium, SSR, hidratação e servidor HTTP compilado.
A avaliação comparativa de agentes tem protocolo e resultados próprios em
`VALIDATION.md#avaliação-com-agentes`; os testes do framework não aprovam por
inferência as soluções geradas pelos participantes.

Três testes adicionais de entrada passaram:
entrada autoral correta com SSR e bootstrap no HTML, handler avulso colocado
na entrada errada e ausência do par cliente/servidor. A entrada errada compila
sem aviso e falha no despacho. Essa reprodução não abre navegador; a prova
de interação após hidratação pertencia ao harness de hidratação.

Não foram executadas as suítes upstream nem a suíte inteira da aplicação.
Os gates de tooling com exclusão permanente de fixtures ficaram fora desta
rodada, conforme a regra explícita de lixeira. Não houve alteração de
dependências ou promoção automática das correções posteriores à base.

## Validação histórica da skill 1.1.1

Registro preservado da revisão anterior. As contagens abaixo não descrevem a revisão atual.

Data: 19/09/2026. Base documental preservada: SolidJS 2.0.0-rc.9. Revisão de nomenclatura e política de API, sem alterar aplicação ou dependências.

## Resultado e alcance

As verificações foram executadas novamente nesta revisão. Elas validam a estrutura do pacote, regras negativas sobre receitas e código independente de Solid. Não certificam runtime, integração ou todas as afirmações herdadas.

| Verificação | Resultado observado | Limite |
| --- | --- | --- |
| Frontmatter | YAML válido; nome solidjs-2; versão 1.1.1 | Não executa o agente que carrega a skill |
| Estrutura | 57 arquivos; 34 referências | Contagem de artefatos, não cobertura semântica |
| Links internos | 346 destinos e âncoras verificados | Não consulta disponibilidade de URLs externas |
| Inventário | 55 IDs de fontes únicos | Sem aumento de contagem; releituras parciais registradas |
| Registro de casos | 6 casos; fontes e metadados coerentes | Estados históricos preservados, não uma nova consulta de todos os casos |
| Sintaxe TypeScript/TSX | 9 arquivos sem erro de parsing | Não resolve os imports nem as sobrecargas Solid |
| Sintaxe JavaScript | 5 arquivos MJS sem erros em node --check | Não comprova a completude das regras textuais |
| Blocos da documentação | 29 blocos sem erros de parsing | Nem todos são programas autônomos |
| Regras negativas sobre receitas | 79 imports nomeados de Solid/renderer e 3 chamadas de createEffect inspecionados; nenhum achado | Inspeção AST local de padrões selecionados; não é catálogo completo de exports |
| Suíte do auditor | 19 testes aprovados | Fixtures, sem execução de Solid |
| Operação cancelável | 12 testes aprovados | Utilitário puro, não lifecycle Solid |
| Parser de tarefas | 6 testes aprovados | Dados sintéticos, não transporte real |
| TypeScript estrito | 3 arquivos puros aprovados | tipos-tasks.ts, validacao-tasks.ts e cancellable-operation.ts |

**Total executado: 37 testes locais, 0 falhas.** Ferramentas: Node.js 22.16.0, TypeScript 5.8.3 e PyYAML para frontmatter.

## Checagem de legado

A inspeção dos nove arquivos TS/TSX e dos 29 blocos de documentação não encontrou imports históricos selecionados, import do motor/internals, imports de APIs removidas ou depreciadas da lista auditada, componentes históricos selecionados, atributos DOM históricos selecionados nem createEffect com menos de duas fases explícitas.

Essa inspeção usa o parser TypeScript e regras negativas. Ela não demonstra que todo símbolo, subpath, assinatura ou comportamento esteja correto. As releituras de fonte descritas abaixo dão suporte às distinções específicas da política, não a uma certificação completa de toda API mencionada.

Os arquivos de testes do auditor contêm entradas legadas intencionalmente como strings de fixtures negativas. Elas não são receitas de aplicação. Os quatro casos novos verificam APIs públicas mantidas, import removido com alias, tipos de path distintos da função storePath e a opção onError distinta do registrador histórico.

## Comandos da revisão 1.1.1

Os resultados foram registrados com estes comandos, a partir da raiz da skill. O teste dos utilitários puros, que usava o type stripping experimental do Node, foi retirado em 25/09/2026.

```bash
node scripts/verify-package.mjs --json
node --test scripts/audit-project.test.mjs
```

O typecheck usou TypeScript:

```bash
tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --verbatimModuleSyntax --isolatedModules --target ES2022 --module ESNext --moduleResolution bundler examples/tipos-tasks.ts examples/validacao-tasks.ts examples/cancellable-operation.ts
```

Os cinco MJS passaram por node --check. A checagem AST de TS/TSX e Markdown foi uma inspeção local desta revisão, não uma nova função do verificador estrutural distribuído. Este continua sem dependências, somente leitura e sem acesso à rede.

## Fonte reexaminada

Foram relidos S04, o trecho inicial de S05 até a assinatura de dynamic, S20 nas linhas 430 a 620 para effects e 670 a 900 para resolve/refresh. O retorno de S05 foi truncado, portanto não se declara leitura integral do renderer nesta rodada.

S04 distingue exports executáveis de um bloco comentado Not Implemented e conserva alguns tipos de path sem exportar a função storePath. S20 marca createTrackedEffect como compatibilidade depreciada. S05 identifica DynamicProps como depreciado e mantém dynamic como fábrica. O escopo está registrado em sources.json; as entradas anteriores não foram todas relidas.

## Não executado

Não foram executados typecheck dos seis exemplos dependentes de Solid contra os pacotes reais, compilação JSX Solid, montagem em DOM, hidratação, streaming SSR, server functions, adapters ou build de produção. Não houve atualização ou execução de aplicação. As suítes upstream não foram executadas.

As descrições históricas de riscos e correções preservam o status registrado na pesquisa anterior. Nenhuma correção posterior à tag foi incorporada à versão-base por inferência. A matriz de regressões continua sendo um plano de teste, não uma suíte aprovada.

Ao aplicar esta skill, confira a versão resolvida e execute tipos, lint, testes e build do projeto. O auditor sem achados não comprova ausência de incompatibilidade, erro de lifecycle, regressão do runtime ou falha de concorrência.

## Avaliação com agentes

O corpus de avaliação reunia 16 tarefas I/T e 11 H e foi retirado do repositório em 24/09/2026; os números abaixo são históricos. Nas I/T, os 36 mutantes só contam como mortos se a mesma suíte passa na correta e falha no mutante sem erro de infraestrutura. H exige cinco repetições integrais da referência; H09 e H11 aceitam chamadas adiadas por microtask quando o enunciado não exige o mesmo tick.

Na rodada completa r4, Sonnet obteve 11,67 / 12,90 / 13,30 de 16 e Astra 16 / 15,50 / 16 nas condições sem skill, baseline e candidata. A repetição das sete tarefas discriminantes somou 7,67 / 9,90 / 11,30 de 14 para Sonnet e 14 / 13,50 / 14 para Astra. Opus 5.5 medium obteve 15/16, 14/16 e 16/16; Astra medium, 16/16, 15,5/16 e 16/16. As 24 repetições de I04/I08 passaram. A campanha motivou chamada síncrona da action em I04, owner por fase em I08 e o enunciado explícito de output em I03.

Nas 11 H, duas rodadas por célula: Opus obteve 99,4%, 97,9%, 99,4% e 99,7%; Astra 98,9%, 97,9%, 99,8% e 99,8%, respectivamente sem skill, baseline 1.1.1, candidata 1.4.0 e 1.5.0. São amostras pequenas, próximas do teto; não sustentam diferença estatística. A candidata e alguns enunciados mudaram entre rodadas; as notas afetadas por defeitos dos oráculos foram recalculadas.

No estudo v3 anterior, inéditas: Astra 7/8 para 8/8 e Opus 3/8 para 7/8; conhecidas: Astra 19/24 para 20/24 e Opus 11/24 para 13/24. O runtime pareado teve 6/6 e 4/6. Os eixos estático e runtime permanecem separados, sem taxa única. Os artefatos brutos desse estudo foram descartados; estes números são históricos.

Teste de framework e avaliação de agente respondem perguntas diferentes: o primeiro executa um contrato do runtime; o segundo mede se o agente escolhe ou implementa a solução certa com as instruções dadas. Concordância de dois modelos não transforma afirmação em fato.

Compare três braços: sem skill, baseline congelada e candidata congelada, com as mesmas tarefas, modelo, ferramentas, versões e limite de resposta, cada braço em contexto novo. Grave prompt, resposta, critérios, comandos, resultado e digest dos materiais; alternância de ordem e repetições pareadas ajudam com ruído; ao agrupar tarefas numa sessão, registre a contaminação possível. Defina a rubrica antes das respostas; exija código ou decisão concreta e reprove respostas incompletas; rotule nota de análise textual como tal; só alegue execução quando o código da resposta foi compilado e exercitado (testes escritos à parte não o certificam). Depois de congelar a candidata, um avaliador independente cria cenários inéditos fora do contexto do autor e roda os três braços neles; resultado que orientar edição da skill vira treino, exigindo nova candidata e novos casos. Preserve falhas e regressões no relatório.
