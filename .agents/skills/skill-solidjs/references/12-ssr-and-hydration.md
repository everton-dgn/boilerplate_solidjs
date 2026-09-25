# SSR e hidratação

Contratos do runtime da [base verificada](../SKILL.md). Separe compilador, runtime, adapter e fase; a skill não certifica todas as combinações de um projeto.

## Render e consumo

Contrato: `render` cria UI cliente; `hydrate` associa árvore cliente ao HTML e registros servidor compatíveis. Não hidrate em cada navegação nem use render sobre SSR como equivalente. `renderToString` é síncrono e pode devolver fallback pendente. `renderToStream` aguardado entrega HTML completo e substitui `renderToStringAsync`; sua interface também permite entrega progressiva. O passe de descoberta roda sincronamente na chamada, expondo falha e estado HTTP imediatamente.

Receita: escolha um canal no adapter: `pipe` para writable Node, `pipeTo` para WritableStream ou `readable` para Web Streams/Response. Faça render separado para inspeção que consome corpo.

Armadilha: guard compara nomes de métodos e bloqueia combinações cruzadas, sem garantir consumo único. Duas chamadas pipe entregaram a dois destinos; readable repetido deu a mesma instância; readable seguido de await resolveu. Evitar entrega duplicada cabe ao adapter.

## Effects no servidor

Contrato: createEffect executa compute, nunca apply; createRenderEffect executa ambos, ou só compute com defer true. `ssrSource: "client"` pula todo effect; createTrackedEffect não executa. Effect criado em fábrica de ref segue a mesma regra, inclusive compute.

Receita:
```ts
createEffect(() => value(), value => { document.title = value })
```

Armadilha: document/window no compute de createEffect ou apply de createRenderEffect lança ReferenceError em SSR. Leve browser para apply de createEffect ou use ssrSource client. As fases cliente têm contrato próprio.

## Compilações e divergências de hidratação

Contrato: versões, transformações, criação de owners, IDs e árvore relevante devem corresponder nos dois lados. HydrationScript/generateHydrationScript precede código dependente do bootstrap e preserva nonce/CSP/eventos. Evite random, horário local, storage e contador global entre requests produzindo árvores distintas; viewport/browser pede cliente ou clientOnly.

Armadilha: hidratação não compara texto: mantém texto divergente do servidor sem aviso, inclusive em dev. Reescrever mesmo valor cliente não corrige; só valor diferente atualiza. Divergência estrutural avisa `Hydration` só em dev; produção silencia. style/setStyleProperty não alteram nó durante claim, assim como classes/atributos comuns: inline SSR fica de baseline até escrita reativa posterior. Identidade de nó não basta; botão inerte pode ser exatamente o nó servidor. Exija interação real em produção e console capturado em dev, incluindo inputs/botões após Loading, For e Portal.

## Documento autoral e slots

Contrato: se servidor renderiza documento inteiro e cliente hidrata só container, NoHydration envolve casca e Hydration reabre namespace do app. No start gerado, cliente hidrata documento inteiro com o mesmo Document; o par é para entrada autoral de subárvore. NoHydration define conteúdo sem comportamento cliente, não disfarça árvore incompatível.

Receita:
```tsx
type DocumentProps = { children: JSX.Element }
const Document = (props: DocumentProps) => (
  <NoHydration>
    <html lang="pt-BR">
      <head><meta charset="utf-8" /><HydrationScript /></head>
      <body>
        <div id="app"><Hydration>{props.children}</Hydration></div>
        <script type="module" src="/entry-client.js" />
      </body>
    </html>
  </NoHydration>
)
// Na entrada cliente, após encontrar o container:
hydrate(() => <App />, container)
```

Contrato: JSX em prop não children, seguido de outro hole que aloca ID, pode hidratar sem eventos na base. Passe por children ou renderize slot por componente:

```tsx
type SlotProps = { children?: JSX.Element }
type LayoutProps = { header: JSX.Element; children?: JSX.Element }
const Slot = (props: SlotProps) => props.children
const Layout = (props: LayoutProps) => (
  <div><header><Slot>{props.header}</Slot></header><main>{props.children}</main></div>
)
```

Armadilha: documento sem par ou slot quebrado deixa nó servidor inerte; dev avisa `Hydration key miss`/`unclaimed server-rendered`, produção não. Slot por componente hidratou sem diagnóstico nos dois builds, sem prova em runtime posterior. Relato não reproduzido de escrita em onSettled/createEffect durante hidratação também envolve key miss; correção posterior não publicada não certifica contorno local. Reavalie escrita nessa fase; onMount não é export da base.

## Ilhas e setup de adapters

Contrato: `clientOnly(() => import("./Chart"))` renderiza apenas fallback ou nada no servidor, sem chamar loader. Cliente começa import ao carregar módulo da ilha, antes de hydrate; reivindica fallback SSR e troca pelo componente real após hidratar, sem diagnóstico. Lazy e export nomeado não foram exercitados.

Armadilha: corpo de componente constrói estrutura, mas recuperação/reconstrução/hidratação não garantem efeito externo uma única vez para sempre. Mantenha corpo puro e recurso com ciclo de vida. `untrack` não exclui snapshot/ownership/prontidão: escrever fonte local e lê-la durante setup pode marcar replay. Separe instância, consulta inicial estrutural não reativa e leitura versionada; calcule seed antes da fonte quando possível. Não exponha internos, use ownedWrite/untrack como inicializador automaticamente seguro ou troque tudo para ssrSource client. `transparent` é integração restrita, não correção global de mismatch. Preserve identidade, isolamento por request e adoção do valor servidor.

## Escopo por request

Contrato: sessão, tenant, permissões e dados privados precisam de escopo por requisição. Cache compartilhado exige chave, isolamento e expiração explícitos. getRequestEvent pode ser undefined fora dele; provideRequestEvent de `@solidjs/web/storage` estabelece contexto servidor e não entra no cliente. RequestEventLocals admite module augmentation em módulo real, mas tipo não preenche locals: handler fornece dados. Evite declaração .d.ts conflitante com .ts homônimo.

Armadilha: signal/store global vaza entre requests. Chamadas diretas de server functions no SSR recebem cópia superficial de locals por chamada; objetos aninhados continuam compartilhados. Resposta é compartilhada deliberadamente no fluxo HTTP. Não espalhe asserções não nulas em utilitário dos dois lados.

## Handler e momento do commit

Contrato: falha síncrona sem boundary lança erro original na chamada de renderToString/renderToStream antes de existir stream/thenable/readable/Promise. Nenhum onError global/local é chamado. Catch encadeado no resultado não alcança isso; try envolve render e await da resposta. Falha contida em Errored continua 200 com fallback, enquanto a síncrona contida pelo handler vira 500 público.

Receita:
```tsx
type Root = () => Element
function createPageHandler(App: Root) {
  return async (request: Request): Promise<Response> => {
    const event = createRequestEvent(request)
    try {
      return await provideRequestEvent(event, () =>
        createSSRResponse(renderToStream(() => <App />), event)
      )
    } catch {
      return new Response("Erro interno", { status: 500 })
    }
  }
}
```

Armadilha: createSSRResponse(stream,event) retorna Promise<Response> resolvida no primeiro write; render vazio/null termina sem write e não assenta. Garanta casca não vazia ou limite no adapter. Com string retorna Response. Essa receita não inclui assets, bootstrap, manifesto, RPC, rotas ou adapter de produção. Try cobre render e espera da shell, não consumo posterior. Para Response de API/saída antecipada sem esse caminho, use commitEventResponse. Shell enviada congela headers/status; redirect tardio usa caminho cliente com CSP/nonce corretos.

## Plugin e entradas

Contrato: use `solid({ start: true, ssr: true })`. `start: { ssr: true }` dá TS2353 e `ssr: {}` TS2322. Typecheck deve incluir vite.config.ts. Start sem ssr booleano superior é documentado como modo cliente, sem execução desse negativo.

Contrato: entry-server autoral exporta `render(request?, context?)`, retornando renderToStream, string ou Response; context.clientEntry traz bundle cliente. Entradas autorais vêm em par entry-server/entry-client. Só servidor reprova build com `found entry-server but no entry-client`. `handleRequest` e default `{ fetch }` pertencem a dist/server/server.js construído. Exportar handleRequest em entry-server passa build e falha no primeiro request com TypeError genérico sem mencionar render.

Armadilha: se não precisa do handler/entradas/endpoint do plugin, render/hydrate com servidor próprio ou HTTP comum bastam. Build verde não comprova contrato de entrada.

## Status, headers, cookies e cache

Contrato: httpStatus(code,text?) e httpHeader(name,value,{append}) declaram estado pela vida do escopo reativo. No request escrevem event.response; renderToString/renderToStream aguardado comitam na conclusão e createSSRResponse(html,event) transporta status/headers. Depois do commit, declarações são ignoradas. Retração em qualquer ordem remove só escopo descartado: cookies vivos permanecem separados, status volta à última declaração viva ou base 200. Passe de Loading descartado retrai declarações sem remover 404 externo.

Armadilha: fallback Errored que declarou 500/header e suspendeu deixou ambos após recuperar conteúdo, contrariando retração prometida. Não dependa dela nesse arranjo. Fora de request, sem storage é silêncio; com storage sem request cada chamada avisa `RequestEvent is missing`; cliente é no-op. Pipe congelar no primeiro write é documental, não testado. Mutação imperativa pós-commit lança em dev e reporta sem aplicar em produção. Autenticação que seta cookie precisa ocorrer antes da shell, não como política tardia.

Contrato: parseCookieHeader/serializeCookie são codecs; veículo é event.response.headers. Append cada Set-Cookie, sem vírgula, inclusive ao copiar resposta. Set-Cookie não muda Cookie do request atual. Configure HttpOnly, Secure, SameSite, escopo/expiração; codec não implementa sessão, assinatura, cifra, revogação ou autorização. Assinatura não cifra e Max-Age cliente não substitui validação/expiração servidor.

Contrato: renderer de página não define Cache-Control; confira o adapter. Página por usuário precisa `private, no-store` em todos os ramos, inclusive 401/404/redirect, antes do commit ou em middleware. Página pública independente de sessão pode usar `public, max-age=0, s-maxage=60`. Server functions têm padrão no-store próprio.

## Escape e head

Contrato: texto SSR escapa & e <; atributo escapa &, aspas duplas e <, entre aspas duplas, inclusive spread. > e aspa simples ficam literais. innerHTML não escapa. Teste bytes dos escapes relevantes e parse DOM com tag real, como `<b>x</b>&amp;`, conferindo textContent/getAttribute e zero elementos injetados; `a < c` não detecta markup injetado.

Receita:
```tsx
type ProductHeadProps = { name: string; summary: string }
function ProductHead(props: ProductHeadProps) {
  const title = createMemo(() => `${props.name} | Loja`)
  useHead([
    { tag: "title", props: { children: () => title() } },
    { tag: "meta", props: { name: "description", content: () => props.summary } }
  ])
  return null
}
```

Contrato: useHead de @solidjs/web registra por owner; descarte restaura tags vencedoras anteriores. Props aceitam getters; children é texto, title singleton e key altera dedupe das demais tags. Getter só lê: criar memo/children nele consome ID de um lado e desalinha hidratação; crie no corpo. Se documento não tem fechamento head, onHead de renderToString/renderToStream entrega markup ao host. Solid Meta é recomendação documental para metadados comuns, pacote separado não instalado na base.

Armadilha: receita foi tipada, sem comparação de render cliente/servidor dos dois getters. Relatos não reproduzidos na base: texto estático com spread sem escape; stylesheet de useHead ainda carregando causa TypeError/REACTIVITY_HALTED ao hidratar. Correções posteriores sem publicação não certificam runtime local: teste esses arranjos antes de adotá-los.

## Erros, sanitização e observação

Contrato: erro contido por Errored chega ao onError com handling fallback, stream resolve fallback; rejeição tardia dentro de elemento sob Loading chega com handling client e stream resolve. Hook local prevalece sobre global; só global recebe se não houver local. Em dev, contidos também registram SSR_RENDER_ERROR_CONTAINED mesmo com hook. Síncrono sem boundary escapa antes da Promise/hook, apesar do JSDoc prometer roteamento e ausência de rejeição.

Contrato: rejeição serializada sob Loading também passa sanitização, mesmo sem Errored. Serialização pode aplicar padrão antes da boundary; não prometa que retorno do hook substituirá rejeição já serializada. Errored sanitiza por padrão apenas em produção, salvo markSafeError; dev preserva original e emite log informativo. Compare builds, sem inferir produção a partir de payload dev. configureServerErrors observa globalmente; para observar sem mapear, não retorne valor. Retorno do hook é exposição deliberada sem nova sanitização; markSafeError só para erro público.

Armadilha: fallback genérico e transporte sanitizado não contêm toda exceção servidor. Proteja infraestrutura, validação e saída antes do Solid, criando dados/erros públicos novos; Error retornado como dado de server function não recebe sanitização de throw. Após shell, trate consumo/rejeição/cancelamento sem tentar substituir status/corpo inteiro. Selecione campos públicos de kind, handling, IDs e caminhos; não logue erro original, token, cookie, PII ou payload. getTraceContext correlaciona request; baggage arbitrária não autoriza nem deve ir ao log sem política.

## Falhas tardias e artefato real

Rejeições tardias em certos arranjos encerram o processo Node mesmo depois de enviar uma resposta: [R08](17-known-risks.md#r08-rejeição-assíncrona-tardia-durante-ssr-derruba-o-processo-node). Preserve árvore, modo e momento ao reproduzir em processo descartável.

Armadilha: mudanças posteriores não publicadas não removem esses riscos. Execute regressão em processo filho, registrando saída, código, sinal e timeout; não engula unhandledRejection globalmente. Teste shell/região 1, hidrate com região 2 pendente, altere cache, conclua stream e observe identidade, listeners e criação/destruição de recursos. HTML totalmente aguardado não testa essa janela. Inclua falha tardia, abort e navegação para outro owner.

Contrato: produção precisa ser servida pelo adapter real de teste. Source/dev não cobrem campos entre pacotes renomeados na otimização. Botão inerte exige conferir core/web/plugin/compilador/binário nativo resolvidos antes da lógica de evento; não corrija atributos privados. Fixtures use server precisam entrar no filtro efetivo, cujo padrão é src/**; build verde pode manter corpo servidor no cliente se fora dele. Confira referência gerada, registro HTTP, marcador sintético ausente em bundle/chunks/sourcemaps públicos e chamada real. Um marcador ausente não prova ausência de todo segredo. Skip, sinal de término ou erro de spawn não são aprovação.
