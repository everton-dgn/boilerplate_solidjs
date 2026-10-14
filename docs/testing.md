# Testes

[Voltar ao README](../README.md)

## Organização e critérios

Os arquivos de teste ficam em pastas `__tests__` ao lado do código que exercitam
(`src/__tests__/`, pastas dos módulos, `tooling/release/__tests__/`). Os testes
E2E são a exceção e vivem em `src/tests/pages/`, fora dos projetos do Vitest.

Teste regras e resultados observáveis: recuperação após erro, navegação,
seleção, persistência e sincronização. Componentes de apresentação simples não
precisam de suíte própria para conferir montagem, textos estáticos, classes ou o
funcionamento nativo de botões. Escolha o ambiente que cobre o comportamento e
evite repetir o mesmo cenário em outro nível.

Os testes em `tooling/**/__tests__/` usam a API `node:test`. O comando
`vp run test:tooling` executa os módulos em Node, exceto `tooling/release/`, que
roda em Bun com `vp run test:release`, o mesmo runtime da publicação. Ambos os
comandos rodam em `validate` e no `pre-push`, fora dos comandos do Vitest:
teste, cobertura, UI e watch. No CI, a suíte Node roda sempre; os testes de
release rodam somente quando a automação ou suas dependências mudam, conforme o
[guia de release](../tooling/release/README.md#validação-local-e-no-ci).

## Ambientes

O `vite.config.ts` define três projetos do Vitest, escolhidos pelo sufixo do
arquivo:

| Sufixo                    | Ambiente      | Uso                                         |
| ------------------------- | ------------- | ------------------------------------------- |
| `*.node.test.{ts,tsx}`    | Node          | Server functions, middleware, utilitários   |
| `*.dom.test.{ts,tsx}`     | happy-dom     | Componentes sem dependência de browser real |
| `*.browser.test.{ts,tsx}` | Chromium real | Interação, layout e APIs de browser         |

Testes só de tipos (`expectTypeOf`) usam `Nome[.qualificador].test-d.ts`. Nenhum
projeto do Vitest inclui esse sufixo, e o `vp run typecheck` verifica esses
arquivos. Rodar um deles no Vitest falharia no `expect.requireAssertions`,
porque `expectTypeOf` não conta como asserção em runtime.

Os projetos `node` e `dom` usam `pool: 'threads'` e `css: false`. O projeto
`node` não carrega happy-dom nem os plugins de componentes. O projeto `dom`
carrega happy-dom, Solid e ícones, sem Nitro ou a configuração de SSR. O projeto
`browser` usa Chromium com CSS habilitado e o mesmo Lightning CSS da aplicação.
Importe o CSS no teste quando precisar validar estilos.

Localmente, os testes de navegador e E2E usam o Chromium instalado pelo
Playwright. Com `CI=true`, usam o Chrome do runner pelo canal `chrome`.

## Isolamento e diagnóstico

A configuração compartilhada limpa o histórico de mocks e, antes de cada teste,
restaura spies, globais e variáveis de ambiente substituídos (`restoreMocks`,
`unstubGlobals` e `unstubEnvs`), então os testes não precisam de `afterEach`
para isso. `expect.requireAssertions` faz falhar o teste que termina sem nenhuma
asserção. `expect.poll.interval` baixa de 50ms para 10ms o intervalo entre
checagens de `expect.poll` e `expect.element`; `vi.waitUntil` não lê essa opção
e recebe o intervalo em cada chamada. `fsModuleCache`, ativo por padrão no
Vitest, guarda as transformações em `node_modules/.vitest-cache`, então só a
primeira execução após uma mudança paga o custo. O isolamento por arquivo
(`isolate`, padrão do Vitest) é intencional: não use `isolate: false`, mesmo
quando o Vitest sugerir o ganho de tempo. Sem esse isolamento, arquivos passam a
compartilhar `document` e o estado dos módulos, e um teste pode passar ou falhar
conforme a ordem. No Browser Mode, o contexto ainda preserva cookies entre
arquivos. O setup `src/tests/setup/browser/index.ts` restaura o idioma base
antes de cada teste com `setLocale(baseLocale, { reload: false })`; cada teste
pode escolher outro idioma durante sua execução. Os projetos DOM e browser
começam em inglês. No GitHub Actions, o reporter `github-actions` anota as
falhas no PR. A configuração também exclui arquivos E2E, `node_modules` e
`playwright`. `passWithNoTests: false` faz a execução falhar quando nenhum teste
é encontrado. Essas opções ficam na configuração raiz, e os projetos as herdam
pelo `extends` padrão do Vitest, declarando só o que muda.

Nos testes, importe de `vite-plus/test` em vez de `vitest` (a regra
`vite-plus/prefer-vite-plus-imports` bloqueia o import direto). O contexto de
requisição dos middlewares é testado com `provideRequestEvent` de
`@solidjs/web/storage`. Cada middleware de `src/middleware/` tem a própria suíte
em `__tests__/`, e `src/middleware/__tests__/middleware.node.test.ts` cobre o
export padrão e a cadeia montada por `createMiddleware`.

## Testes da aplicação completa

`vp run test:e2e` executa os testes em `src/tests/pages/**/*.e2e.test.ts`,
exceto os arquivos `*.production.e2e.test.ts`, com Chromium. O Playwright gera o
build e inicia o servidor de produção em `http://127.0.0.1:4317`, encerrando-o
ao terminar. A porta precisa estar livre. Os cenários cobrem a página inicial,
hidratação do seletor de tema, teclado, persistência e sincronização entre abas,
cores sem JavaScript, layout e resposta 404 com navegação de volta ao início.
Também cobrem a confidencialidade de erros do servidor: HTTP 500 de um backend
local, exceção após a leitura, `Error` dentro do resultado, erro público e
sucesso, cada um em SSR inicial, chamada pelo navegador e streaming, além de
recarregamento ainda com falha, recuperação após o backend voltar e isolamento
do bundle cliente. O SSR inicial também é verificado com JavaScript desativado.
O detalhe está em [docs/server-errors.md](server-errors.md); o CI executa a
suíte inteira.

O build E2E usa `--mode e2e` com otimizações de produção e acrescenta a página
de teste pelo diretório `src/tests/fixtures/e2e/routes/`. O backend simulado
escuta somente em `127.0.0.1:4318` e é iniciado e encerrado pelo Playwright. O
build normal (`vp run build`) usa apenas `src/routes/` e não inclui essa página
nem o backend simulado. As portas 4317 e 4318 precisam estar livres.

`vp run test:e2e:production` executa os arquivos `*.production.e2e.test.ts`
contra um build normal, com a árvore real de `src/routes/`. Essa suíte verifica
por HTTP que `/robots.txt`, `/llms.txt` e `/sitemap.xml` respondem sem
redirecionamento, com conteúdo e headers esperados, e que os helpers locais não
viram endpoints públicos. Também verifica a ausência de uma rota das fixtures e
que a Home recebe os cabeçalhos de segurança do middleware real, já que o build
E2E monta a cadeia pela fábrica `createMiddleware`.
`AgentReadiness.build.production.e2e.test.ts` confere os 12 arquivos Markdown na
saída final `.vercel/output/static`, o idioma e o título de cada página, os
bytes servidos por HTTP e os manifestos de publicação. O teste lê os catálogos
autorais como referência, sem importar produtores ou o serializador. As regras
de headers precisam aparecer antes da resolução de arquivos no `config.json`
gerado pelo Nitro. Isso cobre a integração do build e do preview; o
comportamento do CDN da Vercel exige verificação após o deploy. Os testes de
`tooling/markdown/loadArtifacts` cobrem o uso de `seo.ts` sem produtor, a
prioridade de `markdown.ts`, reexportações por alias e caminho relativo, mudança
de pasta de rota dinâmica, flags desativadas e falhas de conteúdo, fonte ausente
ou ciclo. Os testes do plugin verificam a criação e remoção de um produtor
durante o desenvolvimento, a atualização do conteúdo e a recuperação de erros,
inclusive criando `seo.ts` depois da primeira ativação sem fonte ou após remover
a única fonte disponível, fora da pasta de rotas reexportadas. A suíte E2E de
fixtures também passa pelo build com as páginas reais reexportadas.

`AgentReadiness.content.production.e2e.test.ts` verifica a apresentação compacta
da home, sem artigo ou rodapé, e preserva a exigência de conteúdo detalhado nas
páginas internas. A navegação usa os links da topbar nos três idiomas, em telas
estreitas e largas, inclusive sem JavaScript. Em telas estreitas, os links da
barra rolam horizontalmente sem alargar o documento; tema e idioma permanecem
acessíveis fora da área rolável. O Markdown da home mantém as seções
descritivas.

`Home.csp.production.e2e.test.ts` confere que a CSP traz um nonce que muda a
cada requisição, que todos os `<script>` e `modulepreload` do HTML bruto trazem
esse nonce e que a Home hidrata sem violação de CSP no console, também com o
tema `dark` ou `light` no cookie, sem atributo `style` no `<html>`. O comando
usa a mesma `BASE_URL_TEST`, carrega as variáveis públicas no modo `production`
e dispensa o backend simulado. No mesmo checkout local, execute as duas suítes
em sequência, pois compartilham a porta e os artefatos de build. O CI executa
ambas em paralelo, em runners separados para isolar portas e builds; a suíte de
produção também valida o build final.

Use `vp run test:e2e:ui` para abrir a interface interativa do Playwright. Com
`CI=true`, os E2E usam dois workers; localmente, mantêm o paralelismo padrão. O
grupo que confere a contagem de logs do middleware continua em ordem dentro de
um worker. Para comparar tempos ou investigar uma falha de concorrência, use
`CI=true vp run test:e2e --workers=1` e `CI=true vp run test:e2e --workers=2`.

Os relatórios HTML ficam em `playwright-report/e2e/` e
`playwright-report/production/`. Os traces de falhas ficam em
`test-results/e2e/` e `test-results/e2e-production/`, respectivamente. Os testes
do Vitest Browser Mode guardam traces de falhas em
`test-results/browser-traces/`. Esses artefatos são ignorados pelo Git. Os E2E
têm comando separado e não fazem parte de `vp run test` ou `vp run validate`.

## Conferência em dispositivo físico

Para conferir a interface em um celular na mesma rede, execute
`vp run dev:phone` e abra a URL de rede exibida pelo Vite. Esse comando
disponibiliza o servidor de desenvolvimento nas interfaces de rede da máquina.
