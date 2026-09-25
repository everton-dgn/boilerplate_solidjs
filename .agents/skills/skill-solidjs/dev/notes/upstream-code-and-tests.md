# Mapa de código-fonte, testes e investigação reproduzível

Material de manutenção e investigação. Base: [recorte](sources-and-version.md#recorte). Leia a implementação na mesma revisão usada pela aplicação. Os arquivos abaixo são pontos de investigação, não caminhos de importação de produto.

## Onde localizar cada contrato

| Assunto | Arquivo do repositório solidjs/solid | Evidência |
| --- | --- | --- |
| Retorno de effect, Accessor e SourceAccessor | packages/signals/src/signals.ts | Assinaturas e documentação de implementação |
| Superfície pública do core | packages/solid/src/index.ts | Reexports; atenção a internos removidos das declarações |
| Contratos de For, Show, Loading e Errored | packages/solid/src/client/flow.ts | Props e chamadas das primitivas |
| Hidratação e opções de fonte | packages/solid/src/client/hydration.ts | Wrappers referenciados na investigação de #3542 |
| Observação de erro cliente | packages/signals/src/core/error-hooks.ts | Deduplicação, política por root e contexto |
| Execução e escopo de server functions | packages/web/server-functions/src/server.ts | provideEventOnce, live e coleta de resposta |
| Refresh aguardável | packages/signals/tests/refresh-await.test.ts | Resultado igual, rejeição, supersessão e fonte de verdade |
| Confirmação de canal ao vivo | packages/signals/tests/until.test.ts | Truthy, timeout, abort e sobreposição otimista |
| Contrato entre artefatos otimizados | packages/solid/test/cross-package-fields.spec.ts | Inspeção dos builds prod/observe |
| Retenção em Show corrigida depois da RC.9 | packages/web/test/zombie-show-leak-3543.spec.tsx | Teste na revisão da correção, não na tag base |

O caminho de hidratação é um ponteiro da análise do mantenedor, sem releitura integral. Nenhuma suíte upstream foi executada localmente. No pacote instalado, os mesmos contratos ficam em `node_modules/solid-js/types/`, `node_modules/@solidjs/web/types/` e, sob pnpm, em `@solidjs/signals` ao lado do diretório real de `solid-js`.

## Procedimento para localizar uma divergência

Identifique o símbolo público e siga sua resolução no package.json instalado. Um import idêntico pode resolver para browser, server, development ou outro artefato conforme as condições do bundler. Conferir apenas o arquivo de origem sem conferir a condição de resolução pode estudar o programa errado.

Busque pelo símbolo no source da tag e pelos nomes de teste associados à issue. Leia assertions, setup, ambiente e cleanup. Um teste que importa `../src/index.js` pode estar testando a primitiva de baixo nível, sem os wrappers e a compilação usados pela aplicação.

Não copie casts de fixtures para a aplicação. Por exemplo, um teste interno pode adaptar tipos para isolar o motor, enquanto código de produto precisa provar a sobrecarga pública com as declarações instaladas.

## Quando uma correção está em uma release

Num checkout local já disponível, estas leituras não modificam arquivos de trabalho:

```bash
git show --no-patch --format=fuller 0ba30d374befd6b31cf7c27496b817fb3b3072d2
git merge-base --is-ancestor 0ba30d374befd6b31cf7c27496b817fb3b3072d2 solid-js@2.0.0-rc.9
```

No segundo comando, 0 significa ancestral, 1 significa que não é ancestral e outro status significa erro a investigar, como objeto ausente. Não invente um resultado se o checkout não contém as revisões. Um arquivo de package.json ainda dizendo rc.9 numa branch não prova que seu conteúdo corresponda ao tarball rc.9.

Fetching, checkout, instalação e build não fazem parte automática deste procedimento. Use somente quando o escopo da tarefa permitir e sem destruir alterações locais.

## Reduza sem apagar o defeito

Mantenha a forma compilada relevante, a ordem das escritas, os leitores existentes e as fronteiras de owner. Trocar JSX por getter, remover um Show ou acrescentar uma leitura de debug pode mudar dependências e esconder o sintoma. Compare redução e original antes de atribuir causa.

Use Promises controladas para inverter respostas sem depender da rede. Separe observação de valor, DOM, recurso e memória. Uma identidade correta no modelo não implica identidade correta na tela; resultado final correto não prova consistência durante a transição.

## Mapa para regressões da aplicação

O arquivo [regression-matrix.md](../../examples/regression-matrix.md) descreve cenários sem assumir Vitest, Playwright ou plugin específico. Aplique-os na infraestrutura existente; receitas de Vitest ficam na skill `skill-solidjs-testing`. Testar somente o último valor deixa de exercitar a maior parte das falhas de concorrência discutidas nesta revisão.
