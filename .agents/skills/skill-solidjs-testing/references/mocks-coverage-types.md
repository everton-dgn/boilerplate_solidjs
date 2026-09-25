# Mocks, bibliotecas auxiliares e tipos

## Mock na fronteira de I/O

Mocke o adapter de HTTP, SDK ou banco, preservando `solid-js` e `@solidjs/web` reais. Alias de módulo virtual, `server-only` ou rota gerada serve ao teste isolado, mas não comprova a integração substituída.

## `vi.resetModules` e instâncias do motor

No projeto servidor, o plugin faz inline de `solid-js` e `@solidjs/web`. `vi.resetModules()` seguido de novo import pode criar outro motor: owners de uma instância ficam invisíveis para a outra, sem aviso. Ao reimportar um módulo que captura ambiente, reimporte o motor e todos os consumidores juntos. Na postura cliente verificada, `solid-js` é externo e mantém a instância.

## Bibliotecas auxiliares

- Confira os peers de `@solidjs/testing-library` para o Solid instalado. Na [prévia examinada](https://www.npmjs.com/package/@solidjs/testing-library/v/1.0.0-beta.3), `fireEvent.click` ainda espera `flush()`, cleanup automático exige `globals: true` e `render(..., { hydrate: true })` lança na postura de teste; a compatibilidade atual não foi verificada. O [helper de montagem](mount-dispose-diagnostics.md#montar-com-descarte-garantido) atende ao caso comum.
- `@solidjs/diagnostics` exige build dev e versão compatível do motor; confira os exports instalados antes de importar matchers.

## Testes de tipo

`vitest run` pode passar com uma asserção `expectTypeOf` incorreta. Execute o typecheck que inclui o arquivo para verificar esse contrato. Ao configurar esse harness, uma asserção errada com `@ts-expect-error` permite conferir que o arquivo participa da checagem.
