# Protocolo para atualizar a skill e validar novas versões

Material de manutenção da skill. Para implementar numa aplicação, basta o [recorte](sources-and-version.md#recorte).

## Quando acionar

Use este protocolo quando a aplicação instalar outra RC ou versão estável, a documentação contradizer os tipos locais, uma biblioteca trocar os peers ou a tarefa pedir a versão mais recente. Não atualize a skill só porque apareceu um artigo mais novo.

## Sequência

1. Identifique a versão resolvida do pacote alvo e registre lockfile e commit do projeto. Em pnpm 10.14+, o gate `minimumReleaseAge` (24h por padrão) pode bloquear a instalação de uma RC recém-publicada; declare `minimumReleaseAgeExclude: ['solid-js', '@solidjs/*']` em `pnpm-workspace.yaml` quando a tarefa exigir acompanhar releases da família Solid em lockstep.
2. Consulte releases oficiais e o manifesto do pacote publicado. Diferencie release, branch e dist-tag; `npm view <pacote> dist-tags` só lê o registro ([instalação e dist-tags](../../references/01-environment-imports-and-types.md)).
3. Fixe um tag ou commit para core e renderer. Leia a diferença em exports, tipos, release notes e testes relacionados.
4. Confira compilador, plugin e adapter separadamente. A versão mais recente do core não determina a do plugin ou do roteador.
5. Confira contra os exports e tipos da versão nova as tabelas de [ausentes](../../references/16-migration-from-solid-1.md#apis-do-solid-1-ausentes-na-base) e de [contratos que continuam](../../references/16-migration-from-solid-1.md).
6. Confira a resolução de `@solidjs/signals` e do compilador, e que cada pacote do motor resolve para um único diretório real. Depois de editar a skill, confira links relativos e âncoras.
7. Reavalie as regras de maior risco: imports, setter, fases de effect, For, async, action e `yield`, hidratação, erro e transporte de servidor. Percorra a lista de observação abaixo.
8. Atualize só as referências afetadas e o catálogo de riscos. Preserve a explicação quando uma restrição mudou de status.
9. Confira manualmente os exemplos e as regras afetadas contra a documentação oficial e o [mapa de código e testes do Solid](upstream-code-and-tests.md), com versões exatas e separando DOM, SSR e produção.
10. Atualize metadados do SKILL.md, sources.json, recorte, README e relatório de validação. Não mude a data sem nova verificação.

## Lista de observação: branch `next` depois da tag base

Leitura dos changesets em `.changeset/` da branch `next` do Solid, commit `45407d1`, em 23/09/2026. Nada disto está publicado. Quando uma RC nova sair, confirme cada item no pacote instalado antes de mudar a skill.

| Área | Mudança em `next` | Changeset | Referência a revisar |
| --- | --- | --- | --- |
| Cleanup | `onCleanup` na mesma owner passa a rodar em ordem inversa ao registro, como no Solid 1; em produção, o pai que registrou cleanup antes dos filhos passa a descartar depois deles, igual ao dev | `cleanup-unwind-order` (#3572) | [ordem de cleanup](../../references/02-reactivity-and-ownership.md#ordem-de-cleanup-e-hidratação) |
| `Loading.on` | Vira lista de dependências sem comparação de valor, o fallback segue o frame, `latest` em `on` fica documentado só como capacidade e `LOADING_ON_OUTSIDE_HOLD` só vale para a mesma fonte | `loading-on-follows-frame`, `loading-on-keyed-boundary-not-born-held`, `loading-on-latest-is-a-capability`, `loading-on-outside-hold-same-source-only` | [R03](../../references/17-known-risks.md#r03-on-e-boundary-criada-durante-hold), [boundaries](../../references/08-async-loading-errors-and-recovery.md) |
| Drafts | Draft de projection, store derivada e optimistic store vale até a próxima execução ou o descarte | `projection-draft-valid-until-superseded` (#3585) | [catálogo](../../references/17-known-risks.md), R10 |
| SSR assíncrono | Rejeição tardia não derruba o processo em `renderToString`; filho direto rejeitado de `Loading` conclui o stream | `fix-ssr-post-render-rejection-3570`, `fix-ssr-stream-bare-child-rejection-3569` | [catálogo](../../references/17-known-risks.md), R08 |
| `latest` | A sombra de `latest` deixa de abrir transação órfã em store derivada | `latest-shadow-rewrite-stays-ambient` | [catálogo](../../references/17-known-risks.md), R09 |
| Hidratação | Handoff `hybrid` espera a resposta do servidor; JSX passado por prop que não é `children` hidrata mesmo com outro buraco que aloca id depois dele | `fix-hybrid-*`, `scope-property-read-holes` (#3567) | [catálogo](../../references/17-known-risks.md), R12 |
| Compilador | `componentNames` vira `sourceNames` e o compilador rejeita o nome antigo; texto estático com spread é escapado no SSR | `compiler-source-names-option`, `ssr-spread-static-text-escape` (#3557) | [ambiente](../../references/01-environment-imports-and-types.md), R11 |
| Renderer | Zero ou NaN como filho único é removido ao trocar conteúdo; `useHead` com stylesheet não trava `hydrate`; `<a noscroll>` passa a ser o tipo | `fix-sole-child-falsy-primitive`, `fix-usehead-stylesheet-hydration`, `anchor-noscroll-attribute-type` | R13, [DOM](../../references/07-dom-events-and-refs.md) |
| Server functions | `csrf.origin` admite origem cruzada com CORS | `fix-csrf-origin-cross-site` (#3538) | [catálogo](../../references/17-known-risks.md), R05 |
| Diagnósticos | `@solidjs/web/performance-tracks` leva registros do Solid ao painel Performance do Chrome; `attribution.enable()` devolve a função que libera o hold | `performance-tracks-*`, `attribution-enable-release-token` | [diagnósticos](../../references/15-diagnostics-checklists-and-recipes.md) |
| Motor | Zumbi que recalcula continua zumbi; dispose de root durante action drena o frame; cleanup que descarta o próprio root roda uma vez | `fix-zombie-flag-survives-recompute`, `fix-root-dispose-drains-parked-frame`, `fix-oncleanup-reentrant-dispose-runs-once` | R01, [effects](../../references/03-effects-and-lifecycle.md) |
| Vitest | No plugin, `sharedViteServer` passa a ser desligado quando `test.projects` existe sem a opção declarada; sem commit registrado, confira na branch `next` do plugin | plugin, sem changeset | [postura por projeto](../../../skill-solidjs-testing/references/vitest-config.md#postura-decidida-por-projeto) |

## Como resolver conflito de fonte

Se um tutorial e um export discordam, o tutorial não torna a função importável. Se o tipo e a implementação divergem, reduza a reprodução, identifique se o bug é de tipos ou de runtime e registre a limitação. Não resolva instalando tipos de outra versão ou copiando internals.

Uma fonte de branch pode ter mudanças não publicadas. Quando só ela estiver disponível, marque o achado como observado em branch e não publique receita de instalação como se o pacote estivesse no registro.

## Critério para promover suporte

Diferencie três estados: documentação analisada, checagem de tipos concluída e execução de cenários concluída. Só o último permite dizer que aquele cenário funcionou, e mesmo ele não certifica todo o ecossistema.

Para APIs experimentais, registre o status e não remova o alerta só porque o major ficou estável. Consulte a promessa de estabilidade da superfície específica.

## Manutenção de referências

Prefira URLs imutáveis. Preserve o SKILL.md como ponto de decisão enxuto e coloque detalhes em arquivos temáticos.

## Atualizar evidências, não somente versões

Revise o [catálogo de riscos](../../references/17-known-risks.md), comentários de fechamento e commits de correção. Uma branch com package.json ainda na RC anterior pode conter código posterior. Confirme ancestralidade do commit na tag e publicação do pacote antes de aposentar um alerta; os comandos somente leitura estão no [mapa de investigação](upstream-code-and-tests.md).

Quando o mantenedor descartar uma hipótese, atualize também as referências que a mencionavam e preserve histórico suficiente para que uma busca futura não ressuscite a interpretação antiga.
