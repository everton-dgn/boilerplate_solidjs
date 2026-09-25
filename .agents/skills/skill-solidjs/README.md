# Skill SolidJS 2

Implementação e diagnóstico de SolidJS 2 pela API pública instalada. [SKILL.md](SKILL.md) contém as armadilhas frequentes e encaminha às referências por assunto. Solid 1 e SolidStart ficam fora.

## Instalação

Mantenha `skill-solidjs` e `skill-solidjs-testing` lado a lado em `.agents/skills/`: as referências entre elas usam caminhos relativos. Neste repositório, `.claude/skills/` aponta por symlink para essas pastas.

## Organização

- [SKILL.md](SKILL.md): entrada e escolha de referência.
- `references/`: contratos e diferenças que levam a código incorreto.
- [examples](examples/README.md): exemplos adaptáveis e suas limitações.
- [dev](dev/README.md): fontes, histórico e evidência, para manutenção.

Os testes históricos não acompanham o pacote. Versões e limites de evidência estão no [registro de validação](dev/VALIDATION.md).
