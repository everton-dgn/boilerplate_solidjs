# Histórico da revisão

## 2.3.0: skill enxuta e cobertura de páginas, actions e contexto, em 25/09/2026

- Cortado o conteúdo que o modelo já infere (sabedoria genérica de teste, básico de `vi.mock`, cobertura), as repetições entre SKILL.md e referências (tabela de camadas, halt, zero no happy-dom) e o nicho de mantenedor (notas do Vitest 5, `edge-runtime`, `isolate`, `_$HY`, `sharedConfig.hydrating`, parser do corpo, `unhandledRejection`, subprocessos, patrulha de import, `createReaction`, fingerprint de build por stack e ordem de cleanup, caminhos deste repositório).
- `oracles.md` saiu; o essencial virou a regra 9 do SKILL.md e as armadilhas de `reactivity.md`.
- Novas receitas: `pages-and-routes.md` (rota com parâmetro e dados por `query`, navegação por link com `aria-current`, cache de `query` entre testes, e2e com Playwright), store com contagem por folha, action com otimismo nos desfechos de sucesso e falha, componente e primitive com provider de contexto.
- As 25 receitas Vitest foram extraídas dos Markdown e executadas no projeto `dom` deste repositório, com `tsc` limpo; a de e2e segue o formato dos testes de página do repositório e não foi executada, porque o navegador do Playwright não está instalado nesta máquina.
- SKILL.md e referências: de cerca de 84 KB para cerca de 56 KB.

## 2.2.0: skill só com documentação, em 25/09/2026

- Harness Vitest (`dev/harness/`) retirado da skill.
- Linhas `Prova:` removidas das 8 referências; as menções inline a caminhos e IDs de teste foram reescritas sem a citação, mantendo o fato observado.
- A rastreabilidade passa pela documentação oficial e pelo [mapa de código e testes upstream](../../skill-solidjs/dev/notes/upstream-code-and-tests.md) da skill principal.
- Arquivos da skill: 80 antes, 11 depois.

## 2.1.0: pente fino das referências, em 25/09/2026

- A `description` passou a excluir SolidStart, alinhada ao corpo do SKILL.md e à skill-solidjs.
- Aplicados 137 vereditos de uma revisão por arquivo, verificados um a um contra o texto, o harness e a skill-solidjs: cortes de duplicação com o SKILL.md e com a skill principal, sete contradições corrigidas (troca de `0` por `String(0)`, `afterEach` contra `onTestFinished`, `hydrate()` e o campo `done`, retração de status sob `Errored`, `resetErrorHalt` também em dev-reload, casamento parcial na receita de browser, escopo da description) e citações de prova consertadas (corpus H08 retirado, arquivo inexistente em `settle-and-wait.md`, `r2-vitest-vite-dependency.graph.test.ts` passou a ser citado).
- Onze trechos de contrato de runtime que não falavam de teste foram para a skill-solidjs (referências 01, 06, 08, 10, 13, 14, 15 e 16), com suas provas; o protocolo de avaliação da skill foi para `../skill-solidjs/dev/VALIDATION.md`. As seções desta skill mantêm os títulos para não quebrar links.
- Dois revisores compararam o resultado com o backup; nove perdas pequenas foram repostas. Ficou de fora a frase sobre avançar o relógio falso e chamar `flush()` no mesmo passo síncrono, que contradizia o próprio arquivo e não tinha controle no harness.
- Harness: removidas dez cópias `.js` derivadas dos `.ts/.tsx` que nenhum teste importava, e o `exclude` de uma pasta inexistente em `tsconfig.json`. Resultado inalterado: 170 casos no config principal, 7 nos controles e 7 em produção.
- SKILL.md e referências passaram de cerca de 96 KB para cerca de 88 KB.

## 2.0.0, em 23/09/2026

SKILL.md centrado em Vitest e referências reorganizadas em oito arquivos. O registro completo dessa versão fica no [histórico da skill principal](../../skill-solidjs/dev/CHANGELOG.md), que acompanhava as duas skills até esta data.
