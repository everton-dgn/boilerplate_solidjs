# Skill de testes de SolidJS 2

A entrada é [SKILL.md](SKILL.md). A skill é centrada em Vitest e depende da `skill-solidjs`, instalada na pasta irmã: a principal contém os contratos da API e a proveniência; esta contém a configuração do Vitest, a escolha de ambiente e o desenho das provas. Empacotada sozinha, ela perde os links para os contratos; o SKILL.md diz o que fazer nesse caso.

A cópia canônica deste repositório fica em `.agents/skills/skill-solidjs-testing`, lida nativamente pelo Codex; `.claude/skills/skill-solidjs-testing` é um symlink relativo para ela, usado pelo Claude Code. A skill não é dependência de runtime e não entra no bundle.

## Instalação e uso

Instale junto com a `skill-solidjs`, na mesma pasta de skills: os links desta skill para a principal usam `../skill-solidjs/`. Locais, precedência, symlinks e como conferir o carregamento em cada CLI estão no [README da skill principal](../skill-solidjs/README.md#instalação). Invocação explícita: `/skill-solidjs-testing` no Claude Code e `$skill-solidjs-testing` no Codex. No Codex, cite a skill de novo quando o pedido de teste vier num turno seguinte ("agora escreve o teste"), porque ela não passa sozinha de um turno para o outro.

O frontmatter usa só `name`, `description` e `metadata` com valores em texto, aceitos pelas duas CLIs. A base verificada (Solid e Vitest) fica em `metadata` e na skill principal; no Claude Code o frontmatter não chega ao modelo.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| [SKILL.md](SKILL.md) | Regras que reprovam um teste, camadas, fluxo e roteamento |
| [references/vitest-config.md](references/vitest-config.md) | Projetos, postura do plugin, contagem, canário, produção e Vite+ |
| [references/settle-and-wait.md](references/settle-and-wait.md) | Tabela de assentamento, espera assíncrona e fake timers |
| [references/mount-dispose-diagnostics.md](references/mount-dispose-diagnostics.md) | Montagem, contexto, captura de console e halt |
| [references/reactivity.md](references/reactivity.md) | Primitives, stores, actions com otimismo e sequências que discriminam erro |
| [references/pages-and-routes.md](references/pages-and-routes.md) | Páginas com router em memória e e2e com Playwright |
| [references/environments.md](references/environments.md) | happy-dom, jsdom e browser mode, com seus limites |
| [references/server-hydration.md](references/server-hydration.md) | SSR, stream, request scope e server functions |
| [references/mocks-coverage-types.md](references/mocks-coverage-types.md) | Mocks de fronteira, `vi.resetModules`, bibliotecas auxiliares e testes de tipo |
| [dev/CHANGELOG.md](dev/CHANGELOG.md) | Histórico de versões desta skill |

As receitas de código das referências foram executadas contra a base registrada na skill principal, exceto a de e2e; os testes usados nessa execução não acompanham a skill. As listas desta skill são critérios de seleção, não alegações de que todos os cenários passaram.

Peça: "Use skill-solidjs-testing para verificar este comportamento na versão instalada; execute o teste e informe projeto, contagem e limites".
