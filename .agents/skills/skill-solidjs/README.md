# Skill SolidJS 2

A skill orienta implementação, revisão e diagnóstico de SolidJS 2 pela API
pública instalada. O [SKILL.md](SKILL.md) é a entrada curta, com as regras que
evitam código errado e o roteamento; as referências são abertas por assunto.
Solid 1 e SolidStart ficam fora. Testes ficam na skill irmã
`skill-solidjs-testing`, que depende desta.

## Instalação

A fonte versionada de cada skill fica em `.agents/skills/<nome>/`. O nome da
pasta precisa ser igual ao `name` do frontmatter. Instale as duas lado a lado:
a skill de testes aponta para referências desta por caminho relativo
(`../skill-solidjs/`).

| Item | Claude Code | Codex CLI |
| --- | --- | --- |
| Pasta no projeto | `.claude/skills/<nome>/SKILL.md`; neste repositório, symlink relativo para `.agents/skills/<nome>` | `.agents/skills/<nome>/SKILL.md`, procurado em cada diretório do cwd até a raiz do repositório |
| Pasta do usuário | `~/.claude/skills/<nome>` | `$HOME/.agents/skills/<nome>` |
| Mesmo nome em dois lugares | a cópia pessoal vence a do projeto | as duas aparecem, sem mescla |
| Invocação explícita | `/skill-solidjs` | `$skill-solidjs` ou o nome no pedido |
| Conferir o carregamento | a lista de skills da sessão mostra a description | `codex debug prompt-input "x"` lista a skill e a description exibida |
| Frontmatter | não chega ao modelo; por isso a base verificada também está no corpo | o modelo lê o arquivo inteiro |

Fontes: [documentação do Claude Code](https://code.claude.com/docs/en/skills)
e [documentação do Codex](https://developers.openai.com/codex/skills/), lidas
em 23/09/2026, mais a inspeção do Codex CLI 0.156.1 e do Claude Code 2.1.280
nesta máquina (S31 e S32 em [sources.json](dev/sources.json)).

Para outro repositório:

1. Copie as pastas completas `skill-solidjs` e `skill-solidjs-testing` para
   `.agents/skills/`. Preserve personalizações locais antes de substituir
   arquivos.
2. Para o Claude Code, crie `.claude/skills/skill-solidjs` como symlink para
   `../../.agents/skills/skill-solidjs` (e o mesmo para a skill de testes), ou
   copie as pastas. Em checkout com `core.symlinks=false` o symlink vira um
   arquivo de texto; nesse caso copie. Esse cenário não foi testado.
3. Confira o carregamento pela tabela acima.

O Codex aceita um `agents/openai.yaml` opcional por skill, com nome de
exibição, descrição curta e política de invocação implícita. Estas skills não
trazem esse arquivo; sem ele, a invocação implícita fica no padrão do Codex.

A skill não entra no bundle e não instala dependências da aplicação.

## Uso

Peça pelo nome quando a tarefa exigir a skill: "Use skill-solidjs para revisar
este componente contra a versão instalada". No Codex, uma skill não passa
sozinha para o turno seguinte; cite `$skill-solidjs` de novo quando a conversa
continuar no mesmo assunto. Para testes, peça `skill-solidjs-testing`, que
consulta os contratos desta.

Sem rede, confira exports e assinaturas nos `package.json` e `.d.ts` de
`node_modules`.

O disparo automático, com o modelo escolhendo a skill pela description, não
foi medido em nenhuma das duas CLIs. As descriptions das duas skills têm até
202 caracteres para caber no corte de cerca de 208 caracteres que o Codex
aplicou nesta máquina com 80 skills instaladas.

## Organização

- `SKILL.md`: regras, contratos e roteamento.
- `references/`: 17 referências temáticas de aplicação, uma por assunto.
- `examples/`: [exemplos](examples/README.md) adaptáveis.
- `dev/`: validação, histórico, evidência e fontes, fora de tarefa de
  aplicação, em [README](dev/README.md).

## Evidência e limites

A base cruza documentação oficial, pacote instalado, issues e testes executados
contra as dependências deste repositório. Uma fixture aprovada não certifica
todas as rotas de uma aplicação. Relato social só vira recomendação depois da
conferência técnica. Correção em `next` não é atribuída ao pacote instalado.

Consulte [validação](dev/VALIDATION.md), [histórico](dev/CHANGELOG.md) e o
[protocolo de atualização](dev/notes/update-protocol.md).

Os contratos foram verificados com testes locais que não acompanham a skill, retirados em 25/09/2026; para conferir uma regra, use a documentação oficial e o [mapa de código e testes do Solid](dev/notes/upstream-code-and-tests.md).
