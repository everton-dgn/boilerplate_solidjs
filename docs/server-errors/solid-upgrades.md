# Atualizações do Solid e contratos de erro

[Voltar ao guia principal](../server-errors.md)

## Atualizar o Solid

Consulte as dependências e o catálogo `workspaces.catalog` do
[package.json](../../package.json) e a resolução no [bun.lock](../../bun.lock).
`vp toolchain` mostra as ferramentas da instalação ativa. Esses arquivos e o
comando substituem uma lista de versões mantida neste guia.

A proteção atual parte da avaliação da versão do Solid resolvida no lockfile
quando o wrapper foi revisado, que já contém a
[sanitização SSR (#3477)](https://github.com/solidjs/solid/pull/3477), o
[hook central (#3481)](https://github.com/solidjs/solid/pull/3481) e a
[consolidação de onError (#3484)](https://github.com/solidjs/solid/pull/3484).
Nessa avaliação o runtime trocava erros lançados pela mensagem genérica, mas não
recusava um `Error` devolvido como dado; por isso o `wrapInvocation` fica e o
hook é aditivo. Uma issue fechada ou um commit integrado não comprova que o
pacote publicado e instalado mudou esse comportamento.

1. Confira releases, exports e contrato dos pacotes publicados. Atualize
   `solid-js` e `@solidjs/web` juntos, verificando Router, plugin e lockfile.
   Preserve as versões anteriores para reversão; não antecipe APIs internas.
2. Confira se o contrato do hook `configureServerErrors({ onError })` que o
   registro central usa continua igual: chamada síncrona, retorno enviado sem
   nova sanitização, veredito por objeto e substituição do hook anterior. Um
   `onError` por requisição (opção de `renderToStream` ou de
   `handleServerFunctionRequest`) tem precedência sobre o hook global e o
   substituiria sem aviso. O de `renderToStream` fica registrado no render e
   vale também para as server functions chamadas diretamente durante ele.
   Confira se `src/entry-server.tsx` e o plugin continuam sem repassá-lo e se o
   módulo `serverSetup` ainda carrega antes do primeiro dispatch.
3. Rode
   `vp run test:e2e src/tests/pages/BackendError src/tests/pages/OutsideError`
   no build de produção. Os marcadores nos corpos brutos, os controles positivos
   e o teardown do log são a regressão da fronteira. Se o runtime mudar as
   mensagens que chegam ao navegador, meça antes de ajustar as tolerâncias de
   `pageerror`, inclusive com CPU limitada a 20x.
4. Rode `vp run test:e2e:production src/tests/pages/BuildOutput`. O teste
   confere que o id do manifesto em `dist/.vite/`, o `buildId:` da chamada
   `configureServerFunctionsServer(` que traz `endpoint:` em
   `.vercel/output/functions/` e o id que o client carimba em
   `X-Server-Function-Build` são iguais, e que `/.vite/` não sai no estático. Se
   o plugin mudar onde grava o `.vite/` ou deixar de guardar o id em memória,
   revise o módulo `moveViteMetadata` e a recusa por build descrita em
   [Validação e recuperação](recovery.md#validação-e-recuperação).
5. Rode `vp run test:e2e src/tests/pages/OutdatedPage` e
   `vp run test src/__tests__/App.dom.test.tsx`. A recuperação de página
   desatualizada depende de seis comportamentos do runtime: o
   `vite:preloadError` entrega no `payload` o mesmo erro que chega ao `Errored`;
   o `Errored` reporta o erro no console em desenvolvimento só com
   `fallback.length` zero; um fallback que lê o erro sem rastrear não é
   reconstruído por um erro posterior; o router grava a URL do destino antes da
   recarga adiada; o router chama os listeners de `useBeforeLeave` na ordem de
   inscrição, com `defaultPrevented` compartilhado, o que sustenta o
   `registerUnsavedChanges`; e o hook de `configureClientErrors` é chamado uma
   vez por objeto de erro para todo boundary que mostra fallback, sem um
   `onError` por raiz no `hydrate`, o que sustenta o aviso de fallback. Ver
   [Página desatualizada após um deploy](recovery.md#página-desatualizada-após-um-deploy).
6. Reavalie o wrapper só se as notas da versão ou o código publicado indicarem
   que o runtime passou a recusar um `Error` devolvido como dado. Numa
   reprodução isolada, troque o `wrapInvocation` por um passthrough e confira o
   cenário `result` nos três canais pelos marcadores nos corpos brutos, sem
   confiar em teste verde. Verifique os artefatos de produção resolvidos;
   `NODE_ENV` sozinho não basta.
7. Retire somente a interceptação que o runtime passou a cobrir. Preserve o
   transporte, o contrato de dados públicos, o hook, a contenção do middleware e
   seus testes. Registre comandos, resultados e limites na validação da
   atualização. Na reversão, restaure dependências e proteção juntas.

O acompanhamento ocorre nas atualizações de dependências; não há monitor
automático configurado.
