// O módulo real vem do @solidjs/vite-plugin, ausente no projeto node de testes.
// O valor espelha o padrão do plugin sem `serverFunctions.endpoint` nem `base`
// customizados; o E2E confere o endpoint real no build de produção.
export const endpoint = '/_server'
