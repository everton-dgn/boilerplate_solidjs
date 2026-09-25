# Riscos conhecidos da rc.9

Base: `solid-js` e `@solidjs/web` 2.0.0-rc.9. Os status abaixo pertencem ao recorte de evidência da skill: nele, as correções citadas em `next` ainda não estavam publicadas. Não são uma consulta atual ao registro. Issue fechada, PR integrado ou versão em `package.json` de branch não provam correção no pacote instalado. Esta é a única referência com status upstream; as demais apontam para a entrada R. Não é lista exaustiva nem recomendação de upgrade. Números de issue ficam em `dev/sources.json`, marcados com a entrada R.

## R01: retenção de assinaturas durante action pendente

Contrato: com `Show` e memo aninhado gerado pelo compilador, uma action não relacionada ainda aberta retém assinaturas. Corrigido em `next`, não publicado; a correção não prova que todo trabalho extra sob transação foi eliminado.

Conduta: ao investigar CPU ou retenção, compare um controle sem action aberta com o mesmo cenário sob action pendente; meça antes, durante, após assentamento e após dispose. Não introduza remount global nem patch em node_modules como primeira resposta.

## R02: item visualmente duplicado entre listas filtradas

Contrato: stream, store otimista, listas keyed e confirmações sobrepostas podem duplicar um item no DOM a partir de uma coleção única. Corrigido em `next` (passagem de lane sobre sobreposição superada), não publicado; é correção diferente de R01.

Conduta: registre IDs por coluna no modelo e no DOM, preserve a ordem de envio e confirmação e reduza a reprodução. Não invente chave aleatória para esconder a duplicação nem elimine registros autoritativos. Serializar mutações por entidade é mitigação a testar, não conserto comprovado.

## R03: on e boundary criada durante hold

Contrato no pacote instalado (grafo sem DOM): `on` compara valores e um leitor irmão da mesma fonte segura a atualização; `on={latest(x)}` com leitor irmão também fica segurado. `Errored` não aceita `on` (o runtime só lê `children` e `fallback`).

Em `next`, não publicado, `on` vira lista de dependências sem comparação de valor, o fallback aparece junto do frame que causou a mudança, `on={latest(x)}` passa a ser grafia para fallback imediato (documentada como capacidade, não recomendação) e surge o diagnóstico `LOADING_ON_OUTSIDE_HOLD` em dev.

Conduta: escreva para o pacote instalado. Não prometa que `on={latest(x)}` força fallback imediato e teste com leitores irmãos. Não use contadores mutáveis ou objetos sempre novos na leitura de `on`. Ao atualizar para uma RC com a nova semântica, repita a matriz de [boundaries](08-async-loading-errors-and-recovery.md) antes de mudar orientação.

## R05: chamadas de server function entre origens

Contrato: o runtime recusa requisição marcada same-site/cross-site antes de consultar o matcher de origem, e falta a política CORS desse fluxo. Corrigido em `next`, não publicado.

Conduta: não prometa que endpoint absoluto e `csrf.origin` bastam para cliente em outra origem. Não desligue CSRF para resolver um 403. Valide transporte, preflight, origem e credenciais no ambiente real; um `curl` que chama o endpoint não prova que o navegador pode lê-lo.

## R07: `textContent` perde o zero numérico no HTML de SSR

Contrato: para `<p textContent={p.value}/>` em SSR hidratável, o compilador emite `escape(p.value || " ")`, e o placeholder usa truthiness. `renderToString` produz `<p _hk=0> </p>` para `0` e para `""` e `<p _hk=0>1</p>` para `1`; o tipo aceita `string | number` sem ressalva. Na hidratação (happy-dom com bootstrap mínimo e build completo em Chromium, dev e produção), o cliente preserva o espaço até a primeira atualização e depois recupera `"0"` no mesmo nó Text; atualizações para marcação literal, vazio e zero funcionam. Children explícitos suprimem `textContent` na compilação.

Limite: o controle negativo confirmou aviso de mismatch estrutural em dev, sem provar que o runtime diagnostica divergência textual.

Conduta: não recomende `textContent` como otimização geral nem para números que podem ser zero em páginas SSR; prefira JSX comum. `String(value)` é hipótese de contorno sem validação com vazio, hidratação e domínio.

## R08: rejeição assíncrona tardia durante SSR derruba o processo Node

Contrato: com `renderToString`, um memo assíncrono que rejeita depois de o render devolver o fallback vira rejeição não tratada e o processo sai com código 1, mesmo sob `<Errored>` em volta de `<Loading>`. O mesmo vale para `createStore`, `createProjection` e `createOptimisticStore` na forma derivada e para gerador assíncrono que lança antes do primeiro `yield`; gerador que falha depois do primeiro valor não é afetado. Com `await renderToStream()` e leitura que rejeita como filha direta de `<Loading>`, sem `<Errored>` acima e com `onError` fornecido, a chamada lança `TypeError` em `traceMetaMarkup`, a Promise nunca assenta e o processo também sai com 1. Num host HTTP compilado, a resposta sai com 200 e sem vazamento, e o processo morre milissegundos depois. Corrigido em `next`, não publicado.

Limites: `renderToStream().pipe()` e `await renderToStream()` sob `<Errored>` não reproduziram (observação, não mitigação certificada); `pipeTo` não foi exercitado. A sanitização de falhas de render sob boundary não cobre esse caminho.

Conduta: no servidor, converta falhas esperadas em resultado ou erro público antes de devolvê-las ao grafo; um `Errored` no cliente não protege o processo. Trate saída do processo como sintoma deste risco antes de suspeitar do adapter. Reproduza o cenário num servidor descartável: na rc.9, ele derruba os testes seguintes com `ECONNRESET`.

## R09: leitura logo após escrita numa store derivada muda depois de um `latest`

Contrato: numa store derivada (`createStore(() => ({ value: 0 }), { value: 0 })`), cinco escritas seguidas pelo setter, cada uma seguida de leitura fora de setter e sem `flush`, devolvem `0,1,2,3,4`. Depois de uma única chamada `latest(() => store.value)` antes da sequência, devolvem `0,1,0,0,0`. Com `flush` após cada escrita, `0,1,2,3,4`. Numa store comum (`createStore({ value: 0 })`) as leituras devolvem `0,0,0,0,0` com ou sem `latest`: fora do setter, a leitura vê o valor anterior até o lote assentar. O valor após `flush` é `4` e um render effect vê só `0` e `4`. Causa em `next`: a sombra de `latest()` instala override sem transação dona. Não publicado. Limite: grafo sem DOM; não testado com JSX compilado, action aberta ou SSR.

Conduta: não decida lógica lendo a store logo após o setter, em nenhuma forma; guarde o valor em variável local ou leia dentro do draft. Em testes, chame `flush` antes de assertar. Não use `latest` fora de JSX ou memo para "ler o valor novo".

## R10: escrita tardia pelo draft de uma projection é descartada sem aviso

Contrato: uma `createProjection` que guarda o draft numa função e o chama depois que a derivação retornou perde a escrita (`length` segue 0), sem aviso ou erro; um store de controle escrito no mesmo passo publica normalmente. Em `next`, não publicado, o draft passa a valer até a próxima execução da derivação ou o descarte do owner, também para `createStore(fn, seed)` e `createOptimisticStore(fn)`.

Conduta: não guarde o draft de projection, store derivada ou optimistic store fora da execução que o recebeu; escreva numa fonte e deixe a derivação recalcular. Mesmo com a nova regra, mantenha `onCleanup(unsubscribe)` para assinatura externa.

## R11: texto estático filho de elemento com spread sai sem escape no SSR

Contrato (segundo o changeset upstream, sem reprodução local): `<div {...props}>a &lt;b&gt;</div>` não era escapado no SSR em nenhum dos dois compiladores, e o plugin Babel movia `value` de `textarea` com spread para children com precedência errada. Não publicado.

Conduta: confira o HTML gerado quando um elemento com spread tem texto estático com entidades; não dependa desse escape.

## R12: `ssrSource: "hybrid"` pode perder a primeira resposta ou piscar o fallback

Contrato (sem reprodução local): na hidratação por streaming, a entrega de uma fonte `hybrid` do servidor ao cliente podia perder a primeira resposta ou reabrir a janela pendente e renderizar o fallback de novo. Correções só em `next`.

Conduta: com `hybrid` e stream, teste a hidratação no navegador observando o primeiro valor e a ausência de fallback depois do HTML do servidor.

## R13: zero ou NaN como filho único acumula nós de texto ao alternar

Contrato: alternar entre `0` (ou `NaN`) e `<span>elem</span>` como filho único acumula `"0"`, `"00"`, `"000"` no `innerHTML`, sem limite, como em `{n() || <Empty />}`; um controle com a string `"zero"` não acumula. Não publicado.

Conduta: evite `{n() || <Empty />}` com número que pode ser zero. Uma condição que nunca deixa `0` ou `NaN` como texto do buraco, como `n() > 0 ? n() : <Empty />`, fica fora do caso (inferência, sem teste). O happy-dom apaga o zero de `textContent` por conta própria, então reproduzir o caso pede navegador real.
