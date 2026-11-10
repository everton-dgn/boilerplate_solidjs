# Artefatos de publicação e capacidade

[Voltar ao guia principal](../seo.md)

## Artefatos estáticos e capacidade da origem

O build gera `/sitemaps/pages/N.xml`, `/llms.txt` e `/_markdown/static.json`. A
raiz `/sitemap.xml` também vira arquivo quando há páginas e não existem fontes
em array nem particionadas. Uma fonte em array que retorne vazio continua
dinâmica: o build não a consulta para decidir se a raiz pode ser estática. O
inventário interno `/sitemaps/static.json` só responde na fase de prerender,
identificada pelo processo do build. Um header enviado pelo cliente não libera
essa fase. O inventário público de Markdown contém somente caminhos publicáveis.

O build confere os bytes dos arquivos publicados e grava um manifesto junto do
bundle da função. `createPublicationBuild()` gera um identificador por build;
seu plugin o incorpora ao SSR e `markdownPrerender({ buildId })` grava o mesmo
valor no manifesto. Ambos precisam vir da mesma chamada. O prerender verifica o
vínculo, e a função recusa um manifesto de outro build, mesmo que site e
orçamento sejam iguais. Isso detecta mistura de artefatos; não autentica alguém
que tenha acesso de escrita ao diretório da função.

A origem lê esse manifesto uma vez por instância; falha de leitura ou validação
resulta em 503 `no-store`, sem reconstruir todas as páginas na requisição. Sem
fonte em array, não carrega um conjunto de identidades estáticas. Com ela,
carrega uma vez as URLs exatas para preservar a prioridade das páginas
estáticas. Esse caminho ainda tem custo O(N) e orçamento de 32 MiB para o
arquivo de identidades. O manifesto tem teto de 1 MiB. A leitura limita a
alocação antes de validar JSON e hash, e o nome do arquivo de identidades é
fixo. Acima desses orçamentos, migre o catálogo para fontes particionadas. O
matcher das fontes também é preparado uma vez na primeira consulta dinâmica.

`src/infra/server/publication/` limita o trabalho dinâmico por processo: quatro
produtores, com até dois de sitemap e dois de Markdown; quatro leituras de
fonte, com até duas por fonte; quatro saídas e 16 MiB de reserva de saída. A
reserva usa o orçamento máximo da operação antes de iniciá-la. Os limites são
valores iniciais para calibrar na aplicação derivada, conforme CPU, memória e
capacidade do backend. Aumentar o orçamento de uma resposta exige conferir a
reserva total; um pedido cujo orçamento não cabe é recusado.

Não há fila nem retry interno. Admissão recusada responde 503 pequeno,
`no-store` e `Retry-After: 1`; Markdown preserva também `private`. As fontes em
array executam em sequência, e o prazo cobre o trabalho inteiro. O término do
produtor e o consumo ou cancelamento do corpo liberam recursos separados. Uma
fonte que nunca assenta mantém sua capacidade ocupada: corrija o timeout e o
cancelamento no adapter e recicle a instância pelo procedimento da hospedagem
quando necessário. Liberar a vaga só porque passou o prazo permitiria acumular
trabalho ainda ativo.

As operações de backend que passam por `protectServerOperation` herdam o
contexto assíncrono da publicação. Suas Promises mantêm a vaga do produtor até
assentar, mesmo quando o SSR já foi descartado. Operações iniciadas depois do
cancelamento ou do término da publicação são recusadas antes de executar. O HTTP
normal não entra nesse contexto. Isso preserva a fronteira de dados públicos do
adapter; não acrescenta cancelamento automático ao driver. Passe o sinal ao
driver e configure seu timeout para liberar trabalho de fato.

A Promise de cada fonte deve representar todo o trabalho que ela iniciou. Se um
driver rejeitar antes de encerrar a consulta no banco, o contador local não
observa essa consulta remanescente. Configure os limites do pool e os timeouts
na origem dos dados. Duas instâncias têm duas cotas independentes; esse
controlador não impõe um teto global ao backend. Contadores agregados estão
disponíveis por `getPublicationMetrics()` para integração com a observabilidade
da aplicação, sem endpoint público em produção.

A fonte em array tem custo por requisição: o índice lê o array e serializa a
parte `array.xml` para validar seus bytes. Com uma única parte estática e sem
fontes particionadas, também tenta serializar a união até o orçamento antes de
decidir entre `urlset` e índice. Essa tentativa percorre até uma parte estática
mais as fontes em array; não usa o cache de preparo para eliminar a serialização
da resposta. A rota `array.xml` valida e serializa a parte uma única vez, ao
montar a resposta. Esses custos são limitados pelo orçamento de cada parte, mas
se repetem quando a requisição chega à origem. Para catálogos grandes, use o
registro particionado, cuja consulta de uma parte não percorre o catálogo
inteiro.

```tsx
import type { RouteDefinition } from '@solidjs/router'

import { listPostEntries } from './listPostEntries/index.ts'
import { seo } from './seo.ts'

// blog/[slug]/index.tsx: `listPostEntries` é uma server function que devolve
// `{ path: '/blog/meu-post', lastmod: '2026-09-21' }` por registro publicado, e o
// `seo.ts` ao lado declara `type: 'article'`.
export const route = {
  info: { seo, sitemap: listPostEntries }
} satisfies RouteDefinition
```

Para que `noindex` seja respeitado pelas listas, declare-o em `route.info.seo`,
em vez de acrescentar apenas uma tag HTML avulsa.

## Capacidade e medição

O coletor do `llms.txt` percorre todas as rotas estáticas do manifesto (os ramos
com parâmetro ficam de fora) e resolve os metadados antes de aplicar
`route.info.llms` e `noindex`. O custo da coleta cresce com o total de rotas
estáticas: selecionar menos páginas encurta o texto publicado, mas a travessia e
a resolução de metadados continuam passando por todas elas.

A ordem de grandeza vem de uma medição histórica, feita em setembro de 2026 num
Apple M2 Pro, sobre uma versão intermediária em que `route.info.llms` era
booleano e ainda não havia seções. Com 100 mil rotas sintéticas, a coleta de
caminhos levou cerca de 33 ms e o `llms.txt` completo cerca de 230 ms, com corpo
de cerca de 12 MB e diferença de heap perto de 108 MiB entre o início e o fim da
geração (não é pico de memória). O sitemap completo de 10 mil rotas levou cerca
de 7 ms. Os scripts e registros dessa medição não existem mais, e o coletor
atual do `llms.txt` não foi medido de novo. Os números servem para dimensionar e
não valem como meta nem como limite da CI.

Para comparar uma mudança em `walkStaticRoutes`, `collectLlmsPages` ou no
coletor do sitemap, meça fora do repositório:

- copie os helpers da revisão de base como linha de base e carregue as duas
  versões pelo Vite instalado, importando `collectLlmsPages` e a assinatura
  atual de `buildLlmsText`;
- comece com um piloto do cenário mais caro e use seu custo para definir o
  número de execuções dentro do orçamento, incluindo preparação e análise;
- quando a decisão exigir comparação estatística, rode pares antes/depois em
  processos Node novos, alternando a ordem e sem outros benchmarks na máquina;
  justifique o tamanho da amostra e não apresente percentis de uma coleta curta
  como garantia de latência;
- deixe fora do cronômetro a carga dos módulos, a criação das rotas sintéticas e
  o GC explícito entre chamadas;
- mantenha fixa a ordem das operações (caminhos, metadados, `llms.txt`,
  sitemap), porque a primeira chamada de cada uma aproveita o código aquecido
  pela anterior e não representa inicialização fria;
- grave cada execução num JSONL novo, com tempos, erros, contagens e tamanhos.

Rotas sintéticas que expõem os metadados por `$$route.require()` medem só a
coleta e a serialização. Importação de páginas reais, preloads, SSR, rede, CDN,
compressão e concorrência entre requisições ficam fora, então o resultado não
prevê a latência HTTP.

Para fontes particionadas, aumente o catálogo virtual mantendo constante o
tamanho do lote solicitado. A fonte sintética deve criar apenas esse lote;
materializar todos os registros antes do cronômetro esconde o custo que se
pretende detectar. Registre chamadas a `listPartitions` e `readPartition`, bytes
de resposta, tempo e memória. Meça a preparação estática separadamente, em duas
escalas, porque ela tem custo proporcional ao inventário. Uma amostra isolada
revela custo e chamadas indevidas, mas não comprova capacidade sob carga
concorrente.

O piloto da implementação particionada, anterior à geração das partes estáticas
no build, ocorreu em novembro de 2026 num Apple M2 Pro com 32 GiB. Executou cada
cenário em um processo novo, uma vez. Com inventário estático sintético,
preparar o índice levou 986 ms para 10 mil páginas e 9.487 ms para 100 mil.
Consultar a primeira parte depois dessa preparação levou 319 ms e 308 ms,
respectivamente. Naquela implementação, cada instância nova pagava a preparação
proporcional ao inventário. Agora o particionamento e os XML estáticos são
preparados no build. A aplicação ainda precisa dimensionar esse build e o custo
residual das identidades quando usa fonte em array. Catálogos vindos de dados
devem preferir fontes particionadas.

O piloto posterior, já com artefatos de build, preparou 100 mil páginas
sintéticas em 10,1 s e serializou e gravou suas 29 partes em mais 8,6 s. Foram
300 mil URLs nos três idiomas e 120,1 MB de XML. A primeira leitura do manifesto
por um leitor novo levou 0,8 ms; carregar as 100 mil identidades usadas com
fonte em array levou 16,2 ms, com arquivo de 3,6 MB. Essas leituras ocorreram no
mesmo processo que preparou os arquivos, com filesystem aquecido, e não medem
cold start do processo ou do sistema operacional. O pico de RSS de toda a
execução foi 720 MB, incluindo Vitest, preparação e serialização. Esse pico
dimensiona o piloto de build, não a memória de uma função nova. Não houve
compilação de 100 mil arquivos de rota nem carga HTTP nessa medição.

Com catálogos virtuais de 100 mil e 1 milhão de registros, a consulta direta de
um lote de mil registros levou 159 ms e 147 ms na primeira chamada, e 124 ms e
125 ms na segunda. Cada consulta chamou `readPartition` uma vez e não chamou
`listPartitions`. O índice listou 100 e mil IDs, respectivamente. O lote
produziu os mesmos 1.216.503 bytes nas duas escalas; o catálogo inteiro não foi
materializado. O pico de RSS dos processos foi cerca de 378 MiB no cenário
estático de 100 mil e 299 MiB no dinâmico de 100 mil, incluindo Vitest e seus
módulos. Esses valores não isolam a memória da aplicação. O piloto verifica
custo e quantidade de operações, sem demonstrar latência HTTP, percentis ou
capacidade sob concorrência.

O [protocolo de sitemap](https://www.sitemaps.org/protocol.html) limita cada
arquivo a 50 mil URLs e 52.428.800 bytes sem compressão, os valores de
`sitemap/constants.ts`; por isso a medição histórica de 100 mil rotas cobriu só
o coletor do sitemap, sem gerar um XML único, que seria inválido. O `llms.txt`
não tem limite equivalente, e o corpo de 12 MB com 100 mil páginas mostra por
que um site grande precisa selecionar o que publica. `noindex` sai como metatag
HTML, conforme a
[documentação do Google sobre bloqueio de indexação](https://developers.google.com/search/docs/crawling-indexing/block-indexing);
excluir essas páginas do `llms.txt` é uma política deste projeto, que a medição
não verifica em buscadores nem em agentes.
