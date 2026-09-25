# Skill de testes de SolidJS 2

[SKILL.md](SKILL.md) encaminha por contrato e ambiente de teste. As referências cobrem a seleção do build pelo plugin, assentamento, descarte, diagnósticos, isolamento do motor, cache de rotas e limites de SSR/hidratação.

Instale ao lado da [skill-solidjs](../skill-solidjs/SKILL.md), que contém os contratos da API. Neste repositório, a fonte fica em `.agents/skills/` e `.claude/skills/` aponta para ela por symlink.

Reutilize os helpers do projeto. As receitas de montagem, captura e identificação do runtime são alternativas para quando falta esse suporte; não exigem uma segunda infraestrutura.

A evidência original consta no [histórico](dev/CHANGELOG.md). Os testes usados na verificação não acompanham a skill.
