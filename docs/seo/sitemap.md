# Sitemap e fontes de conteúdo

[Voltar ao guia principal](../seo.md)

## Sitemap e rotas dinâmicas

No sitemap, uma rota com parâmetro entra pelas entradas de `route.info.sitemap`:
uma função, síncrona ou assíncrona, que devolve uma lista de
`{ path, lastmod? }` com caminhos absolutos do site, enumerados a partir da
fonte de dados. O módulo da rota entra no bundle do cliente, então banco e SDK
ficam numa server function chamada pela fonte, conforme o
[contrato de erros no servidor](../server-errors.md). A fonte recebe um
`AbortSignal` que aborta no prazo das fontes, na desconexão do cliente e ao fim
da leitura, inclusive quando outra fonte falha; repasse-o à leitura para
cancelá-la, em vez de só deixar de esperá-la. Uma fonte que ignore o sinal
continua rodando e mantém sua vaga ocupada até a Promise assentar, mesmo depois
de a resposta encerrar por timeout. A fonte roda a cada request que chega à
função. A resposta permite cache compartilhado por uma hora; o uso efetivo do
cache depende do host e precisa ser medido. A fonte é ignorada sob `noindex`,
próprio ou herdado; numa página sem parâmetro ela não tem efeito. Como no
llms.txt, o filtro considera a configuração efetiva da página, incluindo a rota
de índice filha, que compartilha a URL do layout: o índice com `noindex: true`
retira a fonte do layout, uma fonte declarada pelo índice substitui a do layout,
e o índice sem fonte herda a do layout, publicada conforme o `noindex` efetivo
do índice. A fonte fica presa à URL de quem a declara; uma fonte que enumere
páginas de outra filha deve ficar nessa filha. As entradas são validadas na
fronteira: caminho que não começa com `/`, com host, esquema, query, fragmento
ou espaço falha; barras finais e repetidas são normalizadas; entradas que
resultam na mesma URL publicada mantêm a primeira ocorrência (a página estática
antes da fonte). A comparação usa a URL localizada que vai para o XML, então
`/a/../b` e `/b`, `/café` e `/caf%C3%A9` ou `/pt/blog/x` e `/blog/x` contam como
a mesma página. `lastmod` fora do W3C Datetime é omitido. Falha de qualquer
fonte, entrada inválida, prazo estourado ou sitemap acima dos limites do
protocolo (de URLs e de bytes, em `sitemap/constants.ts`) respondem 503 sem
corpo e com `no-store`. Abort e timeout esperados do controlador são
silenciosos; as exceções reais registram a linha fixa `[sitemap]` descrita em
[erros no servidor](../server-errors/logging.md#log-de-falhas). O crawler tenta
de novo, e o CDN não guarda um sitemap parcial por uma hora. A resposta de
sucesso traz `stale-if-error=86400`: depois que a cópia em cache expira, se a
função responder com erro, o CDN da Vercel serve a última cópia boa por até um
dia, sem guardar o erro. A documentação da Vercel cita como exemplos o 500,
falha de rede e de DNS; que o 503 desta rota também acione a cópia antiga é uma
hipótese ainda não medida. Títulos carregados em runtime ainda podem usar
`useHead`, mas essas alterações não são lidas pelo gerador.

Cada página gera uma URL por idioma, com alternates e `x-default`. Os idiomas da
mesma página ficam juntos numa parte. O inventário estático é dividido
automaticamente pela contagem de URLs e pelos bytes UTF-8 do XML completo,
incluindo alternates e escapes. Veja a
[integração dos índices com i18n](../i18n.md#índices-de-seo).

Inventários pequenos preservam `/sitemap.xml` como `urlset`. Com várias partes
ou uma fonte particionada, essa entrada publica um `sitemapindex`, e o
`robots.txt` continua apontando para ela. Cada arquivo respeita 50.000 URLs e
52.428.800 bytes sem compressão. O orçamento operacional inicial é menor, 4 MiB
por resposta, configurável em `src/routes/(seo)/sitemap/constants.ts` dentro do
teto do protocolo. As URLs localizadas também precisam caber em 2048 caracteres.
Um grupo de idiomas que sozinho ultrapasse o orçamento falha, assim como um
índice excessivo; não há índices aninhados nem publicação parcial com status de
sucesso.

O contrato de `route.info.sitemap`, chamado aqui de fonte em array, continua
adequado a listas pequenas. Ele devolve um array inteiro, portanto o consumidor
não consegue impedir a alocação que a fonte faz antes de retornar. Ao
ultrapassar os limites, migre a fonte para o registro particionado descrito
abaixo.

Entradas de fontes em array que repetem páginas estáticas indexáveis são
descartadas, preservando os metadados da página estática, inclusive se a fonte
declarar outra rota. Essa entrada não é publicada pela fonte; as entradas
restantes precisam pertencer à rota que a declara. O índice consulta as fontes
em array uma vez e omite `array.xml` quando não sobra nenhuma entrada própria.
Se estáticos e fontes em array couberem separadamente, mas a soma exceder a
contagem ou os bytes, `/sitemap.xml` publica um índice com as partes válidas.
Uma parte `array.xml` que sozinha excede os limites continua causando falha
explícita.

Os quatro handlers compartilham os módulos em `src/routes/(seo)/sitemap/`. Essa
pasta organiza o serviço e não declara uma rota. Em produção, eles reutilizam o
mesmo manifesto e matcher por instância, inclusive ao consultar uma parte depois
do índice. Em desenvolvimento, o contexto é refeito a cada chamada. Os
resultados das fontes dinâmicas não entram nesse cache.

### Fontes particionadas

Catálogos grandes usam `src/infra/server/sitemapSources/`, marcado como
`server-only`, separado dos metadados que entram no cliente. Cada
`SitemapPartitionSource` declara um `id`, o `routePath` da página dinâmica,
`listPartitions({ limit, signal })` e `readPartition({ id, limit, signal })`. A
aplicação derivada implementa as consultas ao banco ou serviço; o boilerplate
entrega o contrato, o serviço HTTP e uma fonte de teste.

`listPartitions` devolve os IDs públicos para o índice e aplica o limite na
consulta antes de materializar a lista. `readPartition` lê somente a parte
solicitada e respeita o limite e o cancelamento. O limite de leitura inclui uma
posição adicional para detectar uma parte excessiva; se essa posição for
preenchida, a publicação falha em vez de truncar a parte. Fazer uma consulta
global e depois recortar o array dentro desse callback mantém o custo do
catálogo inteiro. Use uma consulta limitada na origem dos dados.

`limit` limita a contagem de registros, não os bytes do XML. Uma parte abaixo
dessa contagem ainda pode ultrapassar o orçamento por causa do comprimento das
URLs, dos escapes e dos alternates por idioma. Dimensione as partições na fonte
para respeitar os dois limites. O servidor verifica o tamanho exato e responde
503 com `no-store` se a parte exceder o orçamento, sem truncá-la.

IDs precisam ser estáveis e públicos, sem tokens nem cursores privados. Faixas
imutáveis de IDs são uma opção; posição numa lista ou categoria editável não
garantem estabilidade. A fonte deve manter suas partes disjuntas. Duplicatas na
mesma resposta, IDs inválidos e entradas pertencentes a outra rota são
recusados. A propriedade da URL usa o roteador real, inclusive a prioridade de
páginas estáticas, e respeita `noindex` efetivo. Não registre duas fontes para a
mesma rota nem combine a fonte em array e a particionada nessa rota.

As respostas têm consistência eventual. Por exemplo, o crawler lê o índice às
10h, uma parte é removida às 10h01 e ele consulta essa parte às 10h02: quando a
requisição chega à origem, recebe 404 com `no-store`. Uma cópia ainda válida no
CDN pode responder com o conteúdo anterior. Uma parte nova aparece quando o
índice e o crawler forem atualizados. Uma entrada transferida entre partes pode
aparecer duas vezes ou ficar temporariamente ausente nas leituras feitas em
momentos diferentes. Esse comportamento também se aplica a deploy e rollback.

Cada resposta é validada e publicada inteira. Fonte vazia ou parte removida
responde 404 com `no-store`; falha, timeout, schema inválido ou excesso responde
503 sem corpo e com `no-store`. GET e HEAD preservam o mesmo status e os
metadados. Cache de processo ou CDN não garante retenção de gerações antigas nem
coordenação entre instâncias. Se o produto exigir que todo índice continue
consultável após atualizações, será necessário acrescentar publicação versionada
e retenção em armazenamento compartilhado, com política e custo próprios.

A travessia do manifesto é iterativa, para não depender do limite de recursão do
JavaScript; o teste de `walkStaticRoutes` cobre 10 mil layouts aninhados e 10
mil rotas irmãs. O coletor do sitemap lê caminhos, `noindex`, `type` e as datas
de artigo, sem resolver título ou descrição. O coletor do `llms.txt` resolve
também os metadados das páginas.
