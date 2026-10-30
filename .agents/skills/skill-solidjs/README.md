# Skill SolidJS 2

Implementação e diagnóstico de SolidJS 2 pela API pública instalada. [SKILL.md](SKILL.md) contém as armadilhas frequentes e encaminha às referências por assunto. Solid 1 e SolidStart ficam fora.

## Instalação

Mantenha `skill-solidjs` e `skill-solidjs-testing` lado a lado em `.agents/skills/`: as referências entre elas usam caminhos relativos. Neste repositório, `.claude/skills/` aponta por symlink para essas pastas.

## Organização

- [SKILL.md](SKILL.md): entrada e escolha de referência.
- `references/`: contratos e diferenças que levam a código incorreto.
- [examples](examples/README.md): exemplos adaptáveis e suas limitações.

## Histórico da verificação

A reverificação de 2026-09-29 na base verificada, com controle na base anterior da skill (commit `9a29b1a`) em grafo, SSR no Node, happy-dom e Chromium, cobriu os riscos de [17](references/17-known-risks.md), o gate de origem de server functions, `Loading.on`, toda afirmação marcada como da base ou do runtime instalado nas referências 01 a 16 e a tabela de migração de 16; os changelogs de signals, `solid-js` e `@solidjs/web` publicados entre a base anterior e a verificada foram cruzados com as referências e as contradições encontradas foram corrigidas.

Na mesma data, os cerca de 230 parágrafos de contrato e armadilha sem marcação nas referências 01 a 16 foram examinados na base verificada: exports, tipos (tsc estrito), compilador e diff do `dist` contra a base anterior, com sonda nas duas bases quando o trecho mudou ou o contrato era comportamental; nove foram corrigidos, 18 ficaram sem nova medição e os demais foram mantidos. Os 18 sem nova medição, por exigirem navegador real, hidratação completa, build de produção servido ou por a sonda não reproduzir o caso nem na base anterior, são: o disparo extra da derivação e o leitor retido até `TimeoutError` em [10](references/10-actions-optimism-and-confirmation.md); o snapshot de hidratação em [02](references/02-reactivity-and-ownership.md); o owner marcado com DOM retido em [03](references/03-effects-and-lifecycle.md); `seedLoadingValue` com `ssrSource: 'client'` em [05](references/05-stores-and-projections.md); foco com action pendente, `lazy` com `.then`, `clientOnly` e Portal na hidratação em [06](references/06-lists-control-flow-and-local-state.md); o plugin de lint em [07](references/07-dom-events-and-refs.md); `NoHydration`/`Hydration` com documento inteiro, o lado cliente da hidratação, o build do plugin, a produção servida pelo adapter e a retração de status sob `Loading`/`Errored` em [12](references/12-ssr-and-hydration.md); GET/HEAD declarados, `X-Revalidate` de `reload` e formulário sem JS em [13](references/13-server-functions-and-security.md).

Os números de versão das duas bases ficam no `package.json` e no `pnpm-lock.yaml` do monorepo do Solid, nos commits indicados. Orientações acrescentadas depois dessa data sem sonda própria, como `onFlush`, dizem de onde vêm (JSDoc do pacote instalado ou skill oficial) e não alteram a data de verificação.
