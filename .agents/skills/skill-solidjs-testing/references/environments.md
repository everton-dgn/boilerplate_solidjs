# Ambientes: happy-dom, jsdom e browser mode

Escolha pela [prova necessária](../SKILL.md#escolha-pela-prova-necessária); configuração em [Vitest](vitest-config.md).

## happy-dom

- `<p>{count()}</p>` começando em 0 renderiza vazio; a atualização seguinte lança `TypeError: Cannot set properties of null (setting 'data')` (atribuição de `data` em `null`) e causa `REACTIVITY_HALTED`. Chromium mantém o zero. Teste esse caminho numérico no browser mode, sem convertê-lo em string só para passar.
- Não há `reportError`; confira o [canal do halt](mount-dispose-diagnostics.md#halt-reativo) no navegador.
- O plugin injeta `@testing-library/jest-dom/vitest` em `setupFiles` quando instalado, exceto se um caminho de setup já contém `jest-dom`. Não registre os matchers duas vezes.
- `toHaveTextContent('n=1')` aceita `n=10`, inclusive em `expect.element`. Para valor exato, use `textContent` com `toBe` ou regex ancorada.

- Um `PointerEvent` sintético só atravessa shadow root com `composed: true`. A restauração de foco após reordenar `For` foi observada em happy-dom e Chromium; isso não cobre todo comportamento de foco.

## jsdom

Os resultados específicos de happy-dom não estabelecem o comportamento de jsdom. Para contratos de foco, layout e APIs nativas, use o navegador que observa o comportamento exigido.

## Browser mode

O plugin não injeta jest-dom quando `browser.enabled`; as asserções vêm de `expect.element`. No Chromium, `await userEvent.click()` retorna com o DOM assentado.

## Tipos do jest-dom

A injeção do plugin é de runtime. O tsconfig dos testes precisa incluir `@testing-library/jest-dom/vitest` em `types` para reconhecer os matchers. Um import de `@vitest/browser-playwright` em qualquer arquivo do programa, inclusive a config, também os declara e pode mascarar a falta.

## Formulários

`checked` pode mudar pela ação nativa mesmo com o handler reativo quebrado. Além do estado visual, confira a inclusão e remoção do campo em `FormData` ao marcar, desmarcar e desabilitar. Contratos em [formulários](../../skill-solidjs/references/11-forms-and-accessibility.md).

## Portal

O conteúdo fica fora do host da montagem. Confira o alvo real e seu descarte; contexto e eventos delegados seguem o ramo lógico. Esses contratos foram observados no Chromium, sem prova equivalente de Portal em happy-dom.
