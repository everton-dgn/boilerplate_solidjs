# Histórico da revisão

## 1.7.0: skill só com documentação, em 25/09/2026

- Retiradas as provas de runtime (`dev/proofs/`, 82 arquivos), o registro de casos `dev/evidence.json` e os testes e configs dos exemplos (`tasks.browser.test.tsx`, `cancellable-operation.test.mjs`, `task-validation.test.mjs`, `vitest.config.ts` e `tsconfig.json`). O harness Vitest da skill de testes (`../skill-solidjs-testing/dev/harness/`) saiu na mesma data. O corpus de avaliação (`dev/evals/`) já tinha sido retirado em 24/09/2026, na 1.6.0.
- Removidas as 122 linhas iniciadas por `Prova:` das referências 01 a 15. Nas referências 16 e 17, nas notas de `dev/`, nos exemplos, no `README.md` e no `SKILL.md`, as citações de caminho e ID de teste saíram do meio dos parágrafos, com o fato preservado como observação na rc.9.
- A rastreabilidade passa pela documentação oficial e pelo [mapa de código e testes do Solid](notes/upstream-code-and-tests.md). `VALIDATION.md` ganhou a seção "Provas retiradas em 25/09/2026" e mantém os números como históricos; `sources.json` registra a execução como retirada. A tabela de contratos do Solid 1 que continuam marca como `observado na rc.9` as linhas verificadas com testes retirados, e a matriz de regressões perdeu a coluna "Coberto por".
- Retirada a pasta `scripts/`: o auditor `audit-project.mjs`, o teste de contratos do Solid 1 `v1-contracts.test.mjs`, o verificador `verify-package.mjs`, as suítes dos dois primeiros e o README. As tabelas da referência 16 marcam as linhas antes conferidas pelo teste de contratos como `observado na rc.9`; a referência 01, a 15 e o protocolo de atualização descrevem a conferência manual de motor duplicado e versões.
- Arquivos da skill (`find` na raiz, só arquivos): 132 antes da retirada, 38 depois.

## 1.6.0: referências polidas e estrutura de manutenção

- Retirado `dev/evals/` (corpus de 27 tarefas, mutantes e avaliador, 345 arquivos) do repositório em 24/09/2026. Os resultados das campanhas seguem em `VALIDATION.md`; as menções a `dev/evals/` nas entradas abaixo são históricas.
- Recebidos da skill de testes, no polimento dela, trechos de contrato de runtime (lazy, actions, provideEvent e parser do corpo, router, medição de desempenho, condição de produção) nas referências 01, 06, 10, 13, 14 e 15, e o protocolo de avaliação da skill em `VALIDATION.md`.
- Corrigidos os 14 itens da revisão de perdas: diagnósticos literais conferidos no runtime, citações dos exemplos em inglês, R13 com `Empty`, limites de marcadores sintéticos, atributo `for` e registro histórico do router experimental.

Referências da skill principal consolidadas de 35 para 17 arquivos com nomes em inglês, de cerca de 423 KB para cerca de 204 KB. As referências de testes passaram de cerca de 98 KB para 85 KB. A trilha de auditoria, as provas e as avaliações ficam em `dev/`; o harness da skill de testes fica em `dev/harness/`. Exemplos e scripts usam nomes em inglês, com links e configurações ajustados à nova estrutura.

## 1.6.0, correção das regressões da migração para nomes em inglês

- Reescritos os links de `SKILL.md` (regras, tabela de roteamento e seção de ferramentas) e `README.md`, que ainda citavam o esquema antigo de referências numeradas em português (00 a 34) e os scripts e arquivos de manutenção com nome antigo; agora apontam para os 17 arquivos atuais de `references/` e para `dev/`.
- Corrigidos os links restantes encontrados pelo verificador (`verify-package.mjs --irma`) em `examples/README.md`, `examples/regression-matrix.md`, `references/15-diagnostics-checklists-and-recipes.md`, `dev/notes/upstream-code-and-tests.md` e `dev/proofs/README.md`, que citavam nomes de arquivo em inglês ainda não aplicados aos exemplos ou o esquema antigo de `references/`.
- Movido `tsconfig.examples.json`, solto na raiz da skill, para `examples/tsconfig.json`, ajustando `extends` e a lista `files`; atualizadas as duas citações em `dev/proofs/README.md` e `dev/VALIDATION.md`.
- Criado `dev/README.md` e adicionada a pasta à seção Organização do `README.md`, que não a mencionava.

## Migração dos materiais de manutenção, 24/09/2026

Provas de runtime passaram a `dev/proofs/`; o corpus executável de agentes, a `dev/evals/`; o harness Vitest acompanha `../skill-solidjs-testing/dev/harness/`. Estudos brutos foram descartados, com fatos faltantes incorporados às referências e números históricos preservados em `VALIDATION.md`. Citações abaixo foram ajustadas aos destinos atuais. A campanha exclui essas três pastas das cópias entregues aos agentes.

## 1.5.0, refinamento pela campanha H

### Reforço após a campanha da 1.5.0

As duas notas abaixo de 1 com a 1.5.0 caíram em regras que a skill já tinha,
com redação que o agente não ligou ao caso: Astra limpou o input depois de
chamar a action no mesmo handler (H11) e Opus gravou o valor confirmado depois
do `yield` com envios sobrepostos (H06). O SKILL.md agora cita os dois casos
explicitamente; a referência 09 ganhou o caso do input (R3-ACTION-6, happy-dom
e Chromium).

Campanha com as tarefas difíceis H01 a H11, resolvidas por Claude Opus 5.5 e
GPT-6 Astra (esforço medium) sem skill, com a skill 1.1.1 (baseline) e com a
1.4.0 (candidata). Cada falha foi reproduzida regradando uma cópia do código do
agente com uma única correção por vez.

### Listas, foco, stores e sincronização

- Número como filho único em happy-dom (H11, "activity reorder preserves the
  conversation row..." e "open conversation reflects incoming message edit...",
  em Opus e Astra com a 1.1.1 e em Astra sem skill). A identidade das linhas
  estava certa: `<output>{c.unread}</output>` e o total começavam em 0,
  renderizavam vazios, e a atualização seguinte lançava
  `Cannot set properties of null (setting 'data')` e parava a reatividade. Com
  `String()` nos dois `<output>`, o código do Opus com a 1.1.1 passou de 18 para
  20 de 20. A skill de testes já registrava a falha (P0-12), mas a skill
  principal não dizia o que fazer no componente. A referência 11 ganhou
  "Número como filho único" e a regra 9 do SKILL.md, uma frase (R4-TEXT-1 e
  R4-TEXT-2, `../skill-solidjs-testing/dev/harness/tests/r4-numeric-text.{dom,browser}.test.tsx`).
- Momento da restauração de foco (H01, "moving focused middle input..." e
  "sort during an unrelated save...", Astra com a 1.1.1 nas duas rodadas). O
  agente restaurava o foco em `queueMicrotask`; o oráculo dá `flush()` logo
  após o clique e encontra o foco no `body`. A 1.4.0 já trazia a receita
  síncrona e o Astra passou com ela. A referência 10 agora diz por que a
  microtask falha quando alguém drena a fila antes (R4-FOCUS-1), que ela só
  funciona sem esse flush (R4-FOCUS-2) e que a receita síncrona vale com uma
  action pendente em outra linha, sem novo movimento no settle (R4-FOCUS-3,
  `../skill-solidjs-testing/dev/harness/tests/r4-focus-timing.{dom,browser}.test.tsx`).
  O SKILL.md passou a dizer "logo após `flush()`, no mesmo handler, não em
  microtask".
- Revisão da subseção: o SKILL.md dizia "não em microtask", o que contradizia
  a referência 09, que manda agendar o bloco inteiro (escrita, `flush()` e
  chamada) com `queueMicrotask` quando o comando nasce em effect ou
  `onSettled`. Agora diz "no mesmo bloco síncrono do handler, não numa
  microtask separada"; a restauração logo após o `flush()` dentro desse bloco
  devolveu o foco em happy-dom e Chromium (sonda local não versionada,
  PROBE-D em `dev/evals/.tmp/`).
- Sem mudança na skill: as falhas de H11 em `reconnect`, `sync merging`,
  `failed resync`, histórico, descarte e âncora de rolagem (Astra nas três
  condições) e as quatro de H09 (Astra sem skill) vêm de adiar a chamada ao
  transporte ou ao `save` com `Promise.resolve().then(...)` ou
  `await Promise.resolve()`, para compartilhar a operação antes de invocar
  código externo. O oráculo espera a chamada no mesmo tick. É hábito de
  JavaScript e momento não explícito no enunciado, sem contrato do Solid 2
  envolvido: com a chamada síncrona, o código do Astra sem skill passou de 11
  para 20 de 20 em H11 (junto com `String()`) e de 16 para 20 em H09, e o da
  1.4.0 de 17 para 20 em H11.

### Actions, otimismo, boundaries de erro e regiões live

- Derivação que lança sob `Show`/`Switch` sem `Errored` (H02, "panel retries
  from Errored and recovers", Astra com a 1.4.0): o agente condicionou o
  ramo de erro pelo status e deixou o memo `read()` sem boundary; o memo é
  recomputado na fase pura antes da troca de ramo e o erro sem boundary
  registra `REACTIVITY_HALTED`, então o alerta nunca montou. A referência 08 ganhou "Derivação que lança exige Errored acima do
  leitor", com a receita `Errored` + retry no fallback; a 28 registra que,
  depois do retry, o fallback de erro fica até chegar valor, com ou sem
  `reset`. O SKILL.md ganhou a cláusula curta (R4-ERR-1 a R4-ERR-6,
  `../skill-solidjs-testing/dev/harness/tests/r4-throwing-read.dom.test.tsx`).
- Região live sob `Show` (H01, "failed rename rolls back locally" e "retry
  clears its error immediately", Opus com a 1.1.1 e com a 1.4.0): os dois
  envolveram `[role=alert]` em `Show when={erro()}`, e o nó não existia antes
  da falha nem depois do retry que limpou o erro. A referência 23 manda montar a região uma vez com texto
  reativo, e o SKILL.md tem a cláusula (R4-LIVE-1 e R4-LIVE-2,
  `../skill-solidjs-testing/dev/harness/tests/r4-live-region.dom.test.tsx`).
- Revisão da subseção: halt restrito a memo criado acima do condicional (dentro do ramo, `Show` e `Switch` o descartam sem halt, R4-ERR-7) e cláusula do SKILL.md restrita ao JSX; R4-ERR-6 cobre o pendente sem `reset`; a 28 exige `Errored` acima do leitor, não do memo; a regra de região live, que contradizia a receita da 08 e o exemplo Tarefas (TAR01), virou orientação de anúncio com base no MDN, e a presença do nó, contrato da UI; o SKILL.md perdeu a frase do retry, já presente na 08 e na 28.
- Sem mudança: o valor confirmado gravado dentro de actions sobrepostas (H06,
  "overlapping form submissions...", Opus sem skill e com a 1.1.1) fica retido
  até todas assentarem; a 1.4.0 já mandava gravá-lo depois da Promise da
  action (R3-ACTION-4 e R3-ACTION-5) e o Opus passou com ela. A troca de fonte
  que segurou o conteúdo antigo em `Loading` sem `on` (H02, "panel removes
  stale output...", Astra sem skill) já está na referência 27 (R1D16 a
  R1D18); com a skill, o Astra passou.


## 1.4.0, SKILL.md enxuto, em 24/09/2026

O SKILL.md passou de cerca de 3.920 para 3.600 tokens (bytes/4). As regras 4,
8 e 9 ficaram com a ação e o link; o detalhe por build de `MISSING_EFFECT_FN`,
a sanitização de `throw` e o crescimento de nós de texto seguem nas
referências 18, 13 e 30. Também encurtaram o escopo, a regra 6, o item de
`validate` e a seção de ferramentas; a frase sobre execução silenciosa sem o
build dev foi para a referência 02. A otimização passou a mirar Claude Opus
5.5 e GPT-6 Astra, ambos com esforço medium.

## 1.4.0, ajustes da campanha de execução, em 23/09/2026

A campanha que manda agentes resolverem 16 tarefas com a skill mostrou duas
leituras erradas da versão anterior e um contrato de foco sem prova. As três
correções têm provas em happy-dom e Chromium
(`../skill-solidjs-testing/dev/harness/tests/r3-focus-action.{dom,browser}.test.tsx`):

- Escrita comum no mesmo tick da action: a regra antiga dizia só que ela
  publica no settle, e um agente passou a adiar a chamada da action com
  `await`, atrasando a prévia otimista. Agora o SKILL.md e a referência 09
  mandam chamar a action de forma síncrona e, quando a escrita comum precisa
  aparecer já, fazer `flush()` antes da chamada (R3-ACTION-1 a R3-ACTION-3).
- Actions sobrepostas: o valor confirmado escrito dentro da action fica retido
  até as outras assentarem. A referência 09 ganhou a seção "Actions
  sobrepostas e confirmação", com wrapper e guarda de geração (R3-ACTION-4 e
  R3-ACTION-5); a 32 remete a ela.
- Foco ao reordenar `<For>` com chave: o nó focado que se move perde o foco.
  A referência 26 dizia que o foco segue o registro. A 10 ganhou "Foco ao
  reordenar", com a restauração de `document.activeElement` (R3-FOCUS-1 e
  R3-FOCUS-2), e a skill de testes registra o mesmo resultado nos dois
  ambientes.

- Owner por fase: o apply de `createEffect` roda com `getOwner() === null`,
  e um agente assinou uma fonte externa ali esperando owner. A referência 04
  ganhou "Owner em cada fase" e o SKILL.md a regra curta: `onCleanup` no
  apply nunca dispara e a assinatura que exige owner usa `runWithOwner` com o
  owner capturado no setup (R3-OWNER-1 a R3-OWNER-3,
  `../skill-solidjs-testing/dev/harness/tests/r3-effect-owner.graph.test.ts`).

A revisão adversarial desses trechos (Astra e M3) trouxe três correções
confirmadas: a receita de owner separa assinatura que devolve cancelamento de
assinatura que limpa por `onCleanup`, que precisa de um root por execução
(R3-OWNER-4); o `flush()` antes da action vale para handler de evento, e não
para `onSettled` nem apply de effect; e `MISSING_EFFECT_FN` só existe no build
dev, com `TypeError` sem código no padrão. O achado de que o `mergeProps` de
`@solidjs/web` seria público foi refutado: o `.d.ts` o marca `@internal`.

Na skill de testes, a captura de console dos testes com `codes()` exato agora
também afirma `uncoded()`. Isso expôs que o browser mode registra
`Error: Uncaught Error: <mensagem>` sem código quando o teste escuta `error`;
o fato está em `mount-dispose-diagnostics.md`.

## 1.4.0, em 23/09/2026

Integração da varredura anual de comunidade (Discord, GitHub, Reddit e blogs),
descrita em `references/16-migration-from-solid-1.md`, no repositório de
origem (fora desta pasta de skill). Cinco frentes de trabalho (core, async e
DOM, server functions, meta e ambiente, testes) verificaram 4.179 afirmações
contra o pacote instalado e só aplicaram mudança depois de reproduzir o
comportamento com teste ou sonda própria. Esta revisão integra o resultado na
skill principal.

### SKILL.md

Quatro regras novas na lista "Regras que evitam código errado" e nos
"Contratos que exigem atenção", cada uma citando o teste que a confirmou:

- Nomes ausentes de `solid-js` que geram erro de import, além dos já
  listados: `isSomePending`, `isRefreshing`, `pending`, `createAsync` e
  `setOptimistic` (regra 4).
- `GET(fn)` desliga o gate de origem por padrão numa server function; `throw`
  de um erro é sanitizado, `return` do mesmo erro não é (regra 8, nova).
- Filho único que alterna entre `0`/`NaN` e outro conteúdo acumula nós de
  texto sem limite na rc.9 instalada (regra 9, nova, remete ao risco R13).
- O compilador recusa HTML malformado no build por padrão, em vez de deixar
  quebrar em runtime (novo item em "Contratos que exigem atenção").

Tamanho do SKILL.md: 14.464 bytes, cerca de 3.616 tokens a 4 bytes por token,
abaixo do teto de 4.000. Versão nos metadados: 1.4.0; data de verificação
mantida em 23/09/2026, mesma base do pacote (rc.9). A skill de testes manteve
seu SKILL.md sem alteração: versão 2.0.0 e data 23/09/2026 já registravam esta
integração; só o corpo dela pertence à frente de testes.

### Referências

As cinco frentes editaram diretamente as referências por responsabilidade,
sem passar pelo SKILL.md para cada afirmação: 02 a 07 (reatividade, memo e
stores, incluindo uma correção a uma afirmação errada preexistente sobre
`snapshot` de store), 08 a 11, 25 e 28 (async, DOM e Loading), 12 a 15, 29 e 33
(server functions, router e transporte), 00, 01, 16 a 18, 20, 22, 30 e 34
(ambiente, instâncias duplicadas, inventário de APIs e riscos, com um novo
risco R14 sobre `createEffect` no SSR), e as oito referências da skill de
testes (mocks e tipos, reatividade, ambientes e as demais).

### Registros

- `evidence.json`: seis casos novos (R14 e um agregado por frente: R2-CORE,
  R2-ASYNCDOM, R2-SERVER, R2-META, R2-TESTING), citando os 15 comandos
  reexecutados nesta integração (212 testes, zero falhas); total 72 casos.
- `sources.json`: S106 a S116, onze fontes novas. S106 a S110 agregam
  arquivo:linha do pacote instalado (server functions, signals, DOM, plugin de
  Vite, router); S111 a S116 são fontes comunitárias (uma PR, três issues, uma
  discussion e o registro de dois commits citados como "orientação oficial"
  que não existem no repositório); total 116 fontes.

### Confusões refutadas nesta rodada

`createOptimisticStore` não perde dados após um refetch maior contra a rc.9
instalada; `<input value={undefined}>` não mostra mais a string
`"undefined"`; reusar o mesmo nó entre `fallback` e `children` de `Show` não
lança mais `HierarchyRequestError`; o payload de erro do SSR só vaza detalhes
no build de desenvolvimento, por design; `createEffect` aciona um
`ErrorBoundary` ancestral quando ele existe; escrever numa dependência do
próprio `createMemo` não entra em loop; e duas cópias de `solid-js` não fazem
todo efeito cruzado parar de reagir. Detalhe de cada uma, com a fonte, está em
`references/16-migration-from-solid-1.md`, seção "Confusões frequentes
refutadas", no repositório de origem.

## 1.3.0, em 23/09/2026

Rodada de provas por frente (grafo, DOM, SSR, Vitest e manutenção) e integração das duas skills. Cada afirmação nova cita teste executado, arquivo:linha do pacote instalado ou página de documentação; o que ficou sem prova está marcado como não verificado nas referências e em [VALIDATION.md](VALIDATION.md).

### SKILL.md e frontmatter

- As regras que geram código errado viraram uma lista numerada logo depois da introdução: setter de store e apply de effect com corpo em chaves, valor no ponto de chamada e handler ligado na montagem, APIs do Solid 1 ausentes com o substituto, fases de effect no SSR, falha síncrona de render sem `onError` e `start` com `ssr` lado a lado no plugin.
- A tabela de roteamento inclui a nova referência 34 (contratos do Solid 1 que continuam) e separa riscos conhecidos e manutenção da skill (22, 24, 31) das tarefas de aplicação. O detalhe de `textContent` e zero saiu do SKILL.md e fica na 11 e nos riscos R07 e R13.
- O corpo declara a base verificada, porque o Claude Code não entrega o frontmatter ao modelo. A skill de testes é citada pela pasta irmã, sem link: o verificador da skill recusa links que saem da pasta.
- Description reduzida de 302 para 199 caracteres, com os termos de gatilho no início, a divisão com a skill de testes e as exclusões, para caber no corte de cerca de 208 caracteres que o Codex aplicou nesta máquina. O valor fica entre aspas no YAML.
- Na skill de testes, a description sem aspas tornava o YAML inválido (`BLOCK_AS_IMPLICIT_KEY` no parser `yaml` estrito, por causa de `: ` dentro do texto). O Claude Code listava a skill mesmo assim; o efeito no Codex não foi medido. A description passou a ficar entre aspas, e as chaves de metadata seguem as da principal, com `vitest-verificado`.
- README com instalação e uso no Claude Code e no Codex: pastas, precedência, invocação explícita, symlinks, conferência do carregamento e limites não verificados.

### Referências, exemplos e scripts

- Grafo (02 a 07): lista das escritas que lançam `REACTIVE_WRITE_IN_OWNED_SCOPE`, escrita retida só quando um render effect lê a fonte pendente, ordem de cleanup divergente entre dev e build padrão, retorno do apply, identidade do proxy de store e seleção por chave com `createProjection`.
- DOM (08 a 11, 23, 25 a 28, 32 e exemplos): `Loading.on` com valor, handler por ternário, `style` em kebab-case, atributos booleanos, callbacks de `Show` e `For`, `Reveal`, `Portal`, `select` e o exemplo Tarefas reescrito com teste de navegador de 10 casos.
- SSR (12 a 15, 29, 33): fases de effect no servidor, handler protegido, stream vazio, escape, `httpStatus` e `httpHeader`, hidratação sem comparação de texto, #3567 com contorno, `clientOnly`, open redirect, `useHead` e Router 2.
- Manutenção (00, 01, 17 a 22, 24, 30, 31, 34 e scripts): dist-tags, tabela de APIs ausentes, catálogo de diagnósticos como recorte, status de issues só na 30 (R01 a R13), auditor com `MOTOR_DUPLICADO` e regras de padrões do Solid 1, teste `v1-contracts.test.mjs` e testes do verificador.
- Skill de testes 2.0.0: SKILL.md centrado em Vitest e cinco referências novas (config, assentamento, montagem e diagnósticos, oráculos, mocks e tipos), com receitas executadas.

### Registros

- sources.json: S77 a S105. As fontes de pacote instalado (S77 a S87) guardam arquivo:linha e usam a página da versão no npm como URL. S26, S30 a S32, S40, S41, S45, S48, S69, S70 e S73 tiveram a observação atualizada.
- evidence.json: R03, R08 e R09 fechadas em `next` sem publicação; R10 a R13 novos; 53 casos de prova das frentes (prefixos G, VT, R1, DOM, TAR, SRC e META).

### Afirmações corrigidas

- O compute de `createEffect` executa no SSR (a 11 dizia o contrário).
- `renderToStream` lança na chamada numa falha síncrona sem boundary; não havia Promise nem readable para rejeitar.
- O exemplo de risco com `push` no setter de store era inofensivo; o risco real é atribuir array ou objeto sem chaves.
- `muted={false}` não ilustra remoção de atributo: `muted` é propriedade.
- Registrar o cleanup antes dos filhos não fixa a ordem no build padrão.
- A retenção de escrita numa transição depende de render effect lendo a fonte; não vale como regra geral.
- `resetErrorHalt` não restaura a escrita feita durante o halt.
- O rascunho de formulário dentro de `Errored` volta após o reset; o defeito do exemplo antigo era o formulário sumir durante a carga e a falha.

## 1.2.0, em 22/09/2026

- A instalação no repositório usa `skill-solidjs`, com fonte em `.agents` e symlink local em `.claude`. A skill complementar `skill-solidjs-testing` segue a mesma estrutura.
- Entrada reduzida e organizada por responsabilidade, com catálogo único de exemplos. As 34 referências foram preservadas após inspeção de seus consumidores.
- Contratos corrigidos por execução: effects, owners descartados, memo lazy, stores otimistas, reentrada de actions, Loading, textContent, SSR e transporte HTTP.
- Fontes atuais e casos versionados distinguem documentação, conversa, código publicado e reprodução. Novos riscos incluem zero no SSR de texto, leitura imediata de store derivada e rejeições tardias no servidor.
- A skill de testes cobre seleção de ambiente, descoberta, diagnósticos, compilação real, servidor HTTP e método de avaliação de agentes.
- O exemplo de SSR distingue handler avulso, entrada autoral e handler construído. A reprodução confirma o par de entradas e a falha de despacho que um build aprovado pode esconder.
- Limpeza das fixtures do auditor passou a usar a lixeira e propaga falhas. Pesquisa e resultados reproduzíveis ficam em `references/` e `dev/proofs/` no repositório. As validações anteriores permanecem históricas.

## 1.1.1, em 19/09/2026

A skill e a pasta passam a se chamar `solidjs-2`. Foram retirados o rótulo de idioma, a palavra guia do identificador e o campo de idioma do frontmatter. O texto técnico não foi traduzido nesta revisão.

A política de geração exige o export público, a assinatura e o contrato da versão instalada. Blocos comentados de APIs não implementadas, tipos com nomes semelhantes e imports de motor não comprovam que uma função esteja disponível à aplicação. APIs removidas não são receitas; compatibilidade depreciada não é opção para código novo. APIs mantidas, como onCleanup, não são classificadas como removidas apenas por também existirem no Solid 1.

A migração passou a ser leitura opcional, fora do percurso padrão de implementação. Mantiveram-se avisos de rejeição de legado e fixtures negativas do auditor. Não foi necessário substituir imports dos nove arquivos TS/TSX de exemplos: a inspeção não encontrou imports históricos nesses arquivos.

Foram relidos S04, o trecho inicial de S05 e os contratos relevantes de S20. O escopo parcial está registrado em sources.json. Nenhuma dependência de aplicação foi alterada. Quatro testes de não regressão foram acrescentados ao auditor; o relatório atual é VALIDATION.md.

## 1.1.0, em 19/09/2026

Alvo mantido: SolidJS 2.0.0-rc.9. O pacote anterior foi preservado e esta revisão não altera aplicações nem dependências.

### Pesquisa incorporada

Foram acrescentadas 23 entradas ao inventário, totalizando 55, com sete discussões, seis issues, três comentários conclusivos, um PR, dois arquivos de implementação e quatro arquivos de testes. Há leituras parciais indicadas no inventário; contagem de fontes não equivale a documentos integralmente revisados.

A revisão relê os tipos relevantes de signals e cruza os relatos com a tag base. Não afirma que todos os arquivos originais foram reexaminados nesta rodada. Fontes móveis e status de issues são fotografias da data da pesquisa.

### Conteúdo novo

Dez referências foram adicionadas: classificação de evidências; async imperativo e cancelamento; estado local separado; boundaries compartilhadas; recuperação e cache; hidratação e adapters; riscos da RC.9; navegação no código; confirmação e ordenação; transporte, hooks e fontes vivas.

A integração das novas referências no SKILL.md e nos capítulos antigos evita que o agente precise ler tudo para uma tarefa pequena. O registro evidence.json conserva seis casos, incluindo hipótese descartada, correção posterior à tag e relato ainda aberto.

### Correções de interpretação

A issue #3542 não é apresentada como bug de core: prevalece a conclusão final do mantenedor. A correção de #3543 não é atribuída à RC.9. A duplicação visual de #3548 permanece separada desse vazamento. Loading.on não é descrito como reset imperativo. Retry de boundary não é apresentado como invalidação universal de cache. A discussão histórica de erros não é usada para negar hooks já publicados.

### Código e verificação

Foram adicionados três exemplos TS/TSX, uma suíte de 12 casos para operação cancelável, uma suíte reproduzível de seis casos para o parser existente e uma matriz de regressões da aplicação. O auditor ganhou cinco testes e verificações adicionais de compilador/runtime e callbacks suspeitos. O verificador estrutural da skill é somente leitura.

Resultados exatos e limites estão em VALIDATION.md. Nenhum teste de runtime Solid ou suíte upstream é apresentado como executado localmente.

## 1.0.0

Primeira edição com 24 referências temáticas, seis arquivos TS/TSX de exemplos, auditor somente leitura e 32 entradas de fontes oficiais. Consulte a edição original para o relatório histórico. A validação desta revisão registra o estado atual do pacote, sem herdar resultados automaticamente.
