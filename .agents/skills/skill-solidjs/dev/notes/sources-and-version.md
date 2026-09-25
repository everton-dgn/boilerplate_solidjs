# Fontes, versão e confiança

## Recorte

A base verificada é `solid-js` e `@solidjs/web` `2.0.0-rc.9`, tag de 18/09/2026 no commit `9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb`. É uma release candidate. Os pacotes instalados foram conferidos em 22 e 23/09/2026: `@solidjs/router` `2.0.0-next.26`, `@solidjs/vite-plugin` `3.0.0-next.44` e Vitest `4.1.11` via vite-plus `0.3.3`. Antes de citar número de linha de qualquer um desses pacotes, confira essas versões contra o lockfile de quem instala a skill; elas podem divergir das deste repositório.

A branch `next` do Solid tem correções e mudanças de contrato posteriores à tag. Enquanto não houver pacote publicado com elas, trate-as como não publicadas. O `main` do repositório e a dist-tag `latest` de `solid-js` pertencem ao Solid 1. Não use nenhum desses atalhos para decidir a API de uma aplicação. Instalação e dist-tags: [ambiente](../../references/01-environment-imports-and-types.md).

O template oficial `solid-v2/basic` do repositório `solidjs/templates` lista `vitest ^5.0.0`; este repositório fixa `4.1.11` no catálogo pnpm. Confira `pnpm-workspace.yaml` antes de assumir a versão do template como a instalada.

## Hierarquia de evidência

1. Versão resolvida da aplicação, exports e declarações de tipos distribuídos nela.
2. Implementação e testes da mesma tag, em especial quando um exemplo contradiz a API.
3. Release notes e documentação versionada da linha 2.
4. Documentação móvel de plugin ou integração, cruzada com peers e release correspondente.
5. Documentação geral, artigos e discussões: contexto, nunca decisão de assinatura v2.

RFCs e o guia de migração da tag descrevem a prévia e preservam trechos antigos. Consulte as [divergências documentais](../../references/16-migration-from-solid-1.md#divergências-encontradas-na-própria-documentação) antes de copiar um exemplo.

## Como provar uma afirmação

Cada regra da skill se apoia em uma destas provas: arquivo e linha no pacote instalado, teste executado (testes locais que não acompanham a skill, retirados em 25/09/2026) ou página da documentação v2 identificada como documentação. Sem prova, a regra diz "não verificado" ou fica fora.

Status de issue e presença de correção em `next` ficam só no [catálogo de riscos](../../references/17-known-risks.md). As demais referências apontam para a entrada R do catálogo. Para discussões e relatos, use a [classificação de evidências](evidence-classification.md).

## Desalinhamento de versão entre pacotes Solid

`solid-js` e `@solidjs/signals` precisam estar na mesma rc. `solid-js` `2.0.0-rc.9` declara `@solidjs/signals: ^2.0.0-rc.9` (`node_modules/solid-js/package.json:130`) e importa símbolos como `ROOT_ERROR_HOOK`, `configureClientErrors` e `isStatic`; uma cópia órfã de `@solidjs/signals` numa rc anterior não exporta esses nomes e produz `MISSING_EXPORT` em runtime. Antes de investigar esse erro, rode `pnpm why solid-js` e `pnpm why @solidjs/signals`.

Compilador e runtime também precisam da mesma rc para eventos delegados: `@solidjs/web` rc.9 grava o handler delegado em `node._$$click`; um compilador rc.6 que ainda emita `node.$$click` faz o handler nunca disparar, sem erro de build.

Patch mode (`patchDriver`, `wrapPatchMode`, `registerPatch`, `registerRowOps`, `registerSlotPatch`, `patchableRaw`) foi removido do compilador e da runtime em rc.9, sem substituto público equivalente; nenhum desses símbolos aparece em `dist/solid*.js` nem em `types/index.d.ts`.

## Atribuição

Solid é um projeto de Ryan Carniato e colaboradores, sob licença MIT ([S29](#s29)). Este material é um guia independente, sem endosso dos mantenedores, e não inclui binários do framework.

## Índice de fontes

As âncoras abaixo são o destino dos links S01 a S76 das outras referências. Tipo, data de consulta e nível de leitura de cada fonte estão em [sources.json](../sources.json). S30 a S32 tratam do formato de skill e ficam só nesse arquivo.

| ID | Fonte | Nota |
| --- | --- | --- |
| <a id="s01"></a>S01 | [Release solid-js 2.0.0-rc.9](https://github.com/solidjs/solid/releases/tag/solid-js%402.0.0-rc.9) | Mudanças da RC; retirada de `storePath` público |
| <a id="s02"></a>S02 | [Manifesto de solid-js](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/solid/package.json) | Versão, engines, dependências e exports |
| <a id="s03"></a>S03 | [Manifesto de @solidjs/web](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/web/package.json) | Condições de resolução cliente e servidor |
| <a id="s04"></a>S04 | [Exports do core](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/solid/src/index.ts) | Autoridade para imports; o bloco `Not Implemented` é comentário |
| <a id="s05"></a>S05 | [Exports do renderer web](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/web/src/index.ts) | dynamic, Portal, tipos JSX e superfície DOM |
| <a id="s06"></a>S06 | [CHEATSHEET do pacote](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/solid/CHEATSHEET.md) | Visão operacional, sujeita às divergências |
| <a id="s07"></a>S07 | [Guia de migração](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/MIGRATION.md) | Mapa Solid 1 para 2; conferir contra a tag |
| <a id="s08"></a>S08 | [RFC 01: reatividade e effects](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/01-reactivity-batching-effects.md) | Rastreamento, agendamento e fases |
| <a id="s09"></a>S09 | [RFC 02: signals e ownership](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/02-signals-derived-ownership.md) | Fontes derivadas, roots e contexto |
| <a id="s10"></a>S10 | [RFC 03: controle de fluxo](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/03-control-flow.md) | For, Show, Loading, Errored, Reveal e clientOnly |
| <a id="s11"></a>S11 | [RFC 04: stores](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/04-stores.md) | Draft, reconcile, projections, snapshot, merge e omit |
| <a id="s12"></a>S12 | [RFC 05: dados assíncronos](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/05-async-data.md) | Pending, loadingValue, refresh, resolve e until |
| <a id="s13"></a>S13 | [RFC 06: actions e otimismo](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/06-actions-optimistic.md) | Geradores, transações e convergência |
| <a id="s14"></a>S14 | [RFC 07: DOM](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/07-dom.md) | Atributos, classes, refs e eventos |
| <a id="s15"></a>S15 | [RFC 08: diagnósticos](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/08-dev-diagnostics.md) | OBSERVE, atribuição e medições |
| <a id="s16"></a>S16 | [RFC 09: TypeScript e JSX](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/09-typescript-jsx.md) | Origem de tipos e configuração JSX |
| <a id="s17"></a>S17 | [RFC 10: server functions](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/10-server-functions.md) | RPC, validação, metadados e transporte |
| <a id="s18"></a>S18 | [RFC 11: server components](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/11-server-components.md) | Superfície experimental |
| <a id="s19"></a>S19 | [RFC 12: SSR e HTTP](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/documentation/solid-2.0/12-ssr-http.md) | Hidratação, streams, request, cabeçalhos e erros |
| <a id="s20"></a>S20 | [Implementação de signals e effects](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/signals/src/signals.ts) | Overloads, effects em duas fases, createTrackedEffect depreciado |
| <a id="s21"></a>S21 | [Overloads de For](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/solid/src/client/flow.ts) | Callbacks por modo de keying |
| <a id="s22"></a>S22 | [Entradas de stores](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/signals/src/store/index.ts) | Exports do motor não são exports do core |
| <a id="s23"></a>S23 | [Optimistic store](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/signals/src/store/next/optimistic.ts) | Formas estática e derivada |
| <a id="s24"></a>S24 | [Skill oficial de diagnósticos](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/solid/skills/reactivity-diagnostics/SKILL.md) | Também em `node_modules/solid-js/skills/` |
| <a id="s25"></a>S25 | [README do plugin Vite, branch next](https://github.com/solidjs/vite-plugin-solid/blob/next/README.md) | Fonte móvel; o pacote instalado prevalece |
| <a id="s26"></a>S26 | [Manifesto do plugin Vite, branch next](https://github.com/solidjs/vite-plugin-solid/blob/next/package.json) | Fonte móvel; conferir dist-tags e lockfile |
| <a id="s27"></a>S27 | [Manifesto do monorepo na tag](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/package.json) | Ferramentas do monorepo, não requisitos da aplicação |
| <a id="s28"></a>S28 | [Componentes, lazy e tipos do core](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/solid/src/client/component.ts) | Component, ParentComponent, FlowComponent e lazy |
| <a id="s29"></a>S29 | [Licença do Solid](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/LICENSE) | MIT, Copyright (c) 2016-2025 Ryan Carniato |
| <a id="s33"></a>S33 | [Discussão: estado próprio sobre dados otimistas](https://github.com/solidjs/solid/discussions/3085) | Resposta do mantenedor sobre estado visual por identidade |
| <a id="s34"></a>S34 | [Discussão: callbacks async em effects e setters](https://github.com/solidjs/solid/discussions/3316) | Respostas da comunidade confrontadas com S20 |
| <a id="s35"></a>S35 | [Discussão: erros, sanitização e retry](https://github.com/solidjs/solid/discussions/3415) | Anterior à rc.9; os hooks de erro já estão publicados |
| <a id="s36"></a>S36 | [Discussão: custo de reexecução assíncrona](https://github.com/solidjs/solid/discussions/3020) | Cenário da comunidade, sem benchmark |
| <a id="s37"></a>S37 | [Discussão: otimismo e estado persistente](https://github.com/solidjs/solid/discussions/3032) | RC inicial; workaround sem teste na base |
| <a id="s38"></a>S38 | [Discussão: async e pending](https://github.com/solidjs/solid/discussions/2791) | Leitura parcial; helpers que engolem NotReadyError rejeitados |
| <a id="s39"></a>S39 | [Anúncio da RC do Solid 2](https://github.com/solidjs/solid/discussions/2995) | Direção do projeto, não setup de aplicação |
| <a id="s40"></a>S40 | [Issue 3540: Loading `on` e boundary sob hold](https://github.com/solidjs/solid/issues/3540) | Status em R03 |
| <a id="s41"></a>S41 | [Issue 3543: assinaturas retidas sob action](https://github.com/solidjs/solid/issues/3543) | Status em R01 |
| <a id="s42"></a>S42 | [Comentário de correção da 3543](https://github.com/solidjs/solid/issues/3543#issuecomment-5736396036) | Merge não é publicação |
| <a id="s43"></a>S43 | [PR 3547](https://github.com/solidjs/solid/pull/3547) | Commit `0ba30d374` posterior à tag |
| <a id="s44"></a>S44 | [Teste da correção do vazamento em Show](https://github.com/solidjs/solid/blob/0ba30d374befd6b31cf7c27496b817fb3b3072d2/packages/web/test/zombie-show-leak-3543.spec.tsx) | Lido, não executado; fora da tag |
| <a id="s45"></a>S45 | [Issue 3548: duplicação em listas otimistas](https://github.com/solidjs/solid/issues/3548) | Status em R02 |
| <a id="s46"></a>S46 | [Issue 3542: suspeita de hidratação](https://github.com/solidjs/solid/issues/3542) | Hipótese revisada; ver R04 |
| <a id="s47"></a>S47 | [Conclusão da 3542](https://github.com/solidjs/solid/issues/3542#issuecomment-5734833623) | Setup do adapter, não bug do core |
| <a id="s48"></a>S48 | [Issue 3538: chamadas entre origens](https://github.com/solidjs/solid/issues/3538) | Status em R05 |
| <a id="s49"></a>S49 | [Issue 3534: compilador no teste de integração](https://github.com/solidjs/solid/issues/3534) | Ver R06 |
| <a id="s50"></a>S50 | [Hook de erros do cliente](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/signals/src/core/error-hooks.ts) | Deduplicação, hook por root e contexto |
| <a id="s51"></a>S51 | [Server functions no servidor](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/web/server-functions/src/server.ts) | Leitura por trechos, sem auditoria de segurança |
| <a id="s52"></a>S52 | [Testes de refresh aguardável](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/signals/tests/refresh-await.test.ts) | Lidos em parte, não executados |
| <a id="s53"></a>S53 | [Testes de until](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/signals/tests/until.test.ts) | Lidos em parte, não executados |
| <a id="s54"></a>S54 | [Teste de campos entre pacotes](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/solid/test/cross-package-fields.spec.ts) | Lido; exige build do monorepo |
| <a id="s55"></a>S55 | [Conclusão do gate de integração](https://github.com/solidjs/solid/issues/3534#issuecomment-5733829529) | Correção do gate em `next` |
| <a id="s56"></a>S56 | [Documentação do Solid 2](https://v2.solidjs.com/llms-full.txt) | Documentação; fatos incorporados nas referências temáticas |
| <a id="s57"></a>S57 | [Contrato de textContent](https://v2.solidjs.com/reference/solid-web/jsx-properties/text-content) | Documentação; zero diverge no SSR da base (R07) |
| <a id="s58"></a>S58 | [Ryan: texto puro e compilação](https://x.com/RyanCarniato/status/2080321913403089174) | Post social; não é fonte de regra |
| <a id="s59"></a>S59 | [Ryan: correção do exemplo JSX](https://x.com/RyanCarniato/status/2080340956403163284) | O exemplo não era benchmark |
| <a id="s60"></a>S60 | [Ryan: limite de inferência do compilador](https://x.com/RyanCarniato/status/2080682770570129814) | Valores arbitrários não são texto conhecido |
| <a id="s61"></a>S61 | [Ryan: divisão dos effects](https://dev.to/playfulprogramming/two-react-design-choices-developers-dont-like-but-cant-avoid-d6g) | Artigo conceitual; pseudocódigo não é API |
| <a id="s62"></a>S62 | [Ryan: derivações mutáveis](https://dev.to/playfulprogramming/mutable-derivations-in-reactivity-2ffl) | Artigo de 2024, contexto para projections |
| <a id="s63"></a>S63 | [Reddit: anúncio da RC](https://www.reddit.com/r/solidjs/comments/1vni5jo/solid_20_rc_the_big_reveal/) | Comentários visíveis do autor |
| <a id="s64"></a>S64 | [Discord: canal next](https://discord.com/channels/722131463138705510/780502110772658196) | Mensagens de 18 a 22/09/2026 |
| <a id="s65"></a>S65 | [Discord: reatividade e ownership](https://discord.com/channels/722131463138705510/751355413701591120) | Proposta comunitária, não contrato |
| <a id="s66"></a>S66 | [Discord: testing-library](https://discord.com/channels/722131463138705510/1040109629520216084) | Trecho de abril a junho; não prova compatibilidade atual |
| <a id="s67"></a>S67 | [PR 3558: lanes otimistas sobrepostas](https://github.com/solidjs/solid/pull/3558) | Posterior à tag; ver R02 |
| <a id="s68"></a>S68 | [PR 3549: allowlist entre origens](https://github.com/solidjs/solid/pull/3549) | Posterior à tag; ver R05 |
| <a id="s69"></a>S69 | [Issue 3570: rejeição após renderToString](https://github.com/solidjs/solid/issues/3570) | Status em R08 |
| <a id="s70"></a>S70 | [Issue 3569: rejeição em renderToStream](https://github.com/solidjs/solid/issues/3569) | Status em R08 |
| <a id="s71"></a>S71 | [Compilador SSR de texto](https://github.com/solidjs/solid/blob/9a29b1a07aa3e06ee32afd1fc4c18414b4a558bb/packages/compiler/src/ssr/transform.rs#L2176) | Fallback falsy do `textContent` (R07) |
| <a id="s72"></a>S72 | [Contrato de createEffect](https://v2.solidjs.com/reference/solid-js/reactivity/create-effect) | Documentação; compute, apply, cleanup e erros |
| <a id="s73"></a>S73 | [Issue 3576: leitura após escrita em store derivada](https://github.com/solidjs/solid/issues/3576) | Status em R09 |
| <a id="s74"></a>S74 | [PR 3556: Loading.on em next](https://github.com/solidjs/solid/pull/3556) | Não publicado; ver R03 |
| <a id="s75"></a>S75 | [PR 3575: on e latest em next](https://github.com/solidjs/solid/pull/3575) | Não publicado; ver R03 |
| <a id="s76"></a>S76 | [APIs de dados do router](https://v2.solidjs.com/reference/solid-router/data) | Documentação lida e conferida com os tipos instalados |
