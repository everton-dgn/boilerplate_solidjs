# Mocks, bibliotecas auxiliares e tipos

## Mock na fronteira de I/O

Mocke o adapter de HTTP, SDK ou banco, preservando `solid-js` e `@solidjs/web` reais. Alias de módulo virtual, `server-only` ou rota gerada serve ao teste isolado, mas não comprova a integração substituída.

## `vi.resetModules` e instâncias do motor

Com a configuração padrão do plugin instalado em modo de teste, `solid-js` e `@solidjs/web` passam por inline tanto no projeto servidor quanto nos projetos cliente executados em Node. No ramo servidor, o plugin só acrescenta sua lista quando `server.deps.inline` não tem valor verdadeiro. No ramo cliente, `inline: true` já inclui todas as dependências; uma entrada de `server.deps.external` correspondente a `solid-js` impede a injeção da lista do plugin. `vi.resetModules()` seguido de novo import pode criar outro motor para os módulos inline: owners de uma instância ficam invisíveis para a outra, sem aviso. Ao reimportar um módulo que captura ambiente, reimporte o motor e todos os consumidores juntos.

## Bibliotecas auxiliares

- Confira os peers de `@solidjs/testing-library` para o Solid instalado. Na [prévia examinada](https://www.npmjs.com/package/@solidjs/testing-library/v/1.0.0-beta.3), `fireEvent.click` ainda espera `flush()`, cleanup automático exige `globals: true` e `render(..., { hydrate: true })` lança na postura de teste; a compatibilidade atual não foi verificada. O [helper de montagem](mount-dispose-diagnostics.md#montar-com-descarte-garantido) atende ao caso comum.
- `@solidjs/diagnostics` exige build dev e versão compatível do motor; confira os exports instalados antes de importar matchers.

## Testes de tipo

`vitest run` pode passar com uma asserção `expectTypeOf` incorreta. Execute o typecheck que inclui o arquivo para verificar esse contrato. Ao configurar esse harness, uma asserção errada com `@ts-expect-error` permite conferir que o arquivo participa da checagem.
