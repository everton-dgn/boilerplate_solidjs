# Desempenho da coleta de SEO

[Voltar ao README](../README.md)

## Escopo histórico

Os números abaixo medem uma versão intermediária em que `info.llms` era um
booleano de seleção. A versão atual mantém a seleção explícita por
`route.info.llms`, agora com seção e marcação opcional herdadas pela cadeia de
rotas, e agrupa o texto por seção. Os resultados foram preservados como
evidência histórica; não houve nova medição após a introdução das seções.

Medição local executada em 20 de setembro de 2026. A travessia iterativa
eliminou o estouro de pilha com 10 mil layouts aninhados. Separar a coleta de
caminhos da resolução de título e descrição reduziu o custo do sitemap. A
geração de um `llms.txt` com 100 mil páginas continuou perto de 230 ms.

## Método

- Apple M2 Pro, 10 CPUs lógicas, 32 GiB de RAM, macOS arm64. Runtime e
  dependências seguem os arquivos de instalação do projeto; o registro bruto
  contém o runtime efetivamente usado.
- Comparação com uma cópia dos helpers anterior a esta alteração, que já
  compartilhava `route.info.seo`, mas usava recursão e ainda não aplicava
  `noindex` nem seleção explícita para `llms.txt`.
- Sete cenários, 20 pares antes/depois por cenário, 280 processos Node novos.
  Ordem alternada antes/depois e depois/antes, sem benchmarks concorrentes.
- Cada operação executou uma primeira chamada e três repetições no mesmo
  processo. A tabela usa a mediana das três repetições de cada processo e,
  então, a mediana e o percentil 95 entre os 20 processos. P95 usa o método do
  posto mais próximo, com apenas 20 observações agregadas.
- Os módulos TypeScript reais foram carregados pelo Vite instalado, fora do
  cronômetro. A criação das entradas e o GC explícito entre chamadas também
  ficaram fora do tempo medido. O cronômetro inclui coleta e, nas operações
  correspondentes, montagem e serialização de Markdown ou XML.
- As operações rodam na ordem caminhos, páginas, llms e sitemap. A primeira
  chamada de cada operação pode reutilizar código compartilhado já aquecido pela
  operação anterior. Ela não representa inicialização fria do servidor.
- As rotas sintéticas expõem os metadados em memória por `$$route.require()`. O
  teste não mede importação inicial de módulos reais de páginas, preloads, SSR,
  rede, CDN, compressão ou concorrência entre requisições.

## Mesmo conteúdo antes e depois

Todas as páginas desses cenários são indexáveis e selecionadas para `llms.txt`.
Os tempos estão em milissegundos.

| Cenário e operação                      | Mediana antes | Mediana depois | P95 antes | P95 depois |
| --------------------------------------- | ------------: | -------------: | --------: | ---------: |
| 100 rotas, caminhos                     |         0,097 |          0,072 |     0,105 |      0,083 |
| 100 rotas, llms completo                |         0,326 |          0,351 |     0,346 |      0,430 |
| 1.000 rotas, caminhos                   |         0,581 |          0,509 |     0,634 |      0,569 |
| 1.000 rotas, llms completo              |         4,150 |          4,303 |     4,329 |      4,441 |
| 10.000 rotas, caminhos                  |         4,874 |          3,261 |     5,722 |      3,362 |
| 10.000 rotas, metadados                 |         4,101 |          4,461 |     4,572 |      4,732 |
| 10.000 rotas, llms completo             |        25,373 |         23,020 |    27,484 |     24,559 |
| 10.000 rotas, sitemap completo          |         9,217 |          7,117 |     9,581 |      7,539 |
| 100.000 rotas, caminhos                 |        37,872 |         32,509 |    44,743 |     33,167 |
| 100.000 rotas, metadados                |        38,400 |         43,094 |    41,060 |     44,546 |
| 100.000 rotas, llms completo            |       229,964 |        229,616 |   240,142 |    244,154 |
| 1.000 layouts aninhados, caminhos       |         0,580 |          0,472 |     0,634 |      0,495 |
| 10.000 layouts aninhados, caminhos      |         Falha |          2,132 |     Falha |      2,767 |
| 10.000 layouts aninhados, llms completo |         Falha |          2,155 |     Falha |      2,620 |

Com 100 mil rotas, a coleta de caminhos ficou 14,2% mais rápida. A coleta de
metadados ficou 12,2% mais lenta, agora com `noindex`, seleção e filtragem. A
geração integral do llms ficou praticamente igual; o P95 ficou maior. Portanto,
a mudança não acelera todas as operações nem justifica prometer menor latência
HTTP sem uma medição do servidor.

Nas primeiras chamadas, com 100 mil rotas, caminhos passaram de 44,303 para
31,582 ms; metadados, de 41,086 para 51,201 ms; llms, de 234,488 para 237,552
ms.

Os cenários profundos usam layouts sem segmento adicional e uma única página
final. Eles isolam o limite de pilha, sem criar URLs artificialmente enormes. A
versão anterior lançou `RangeError: Maximum call stack size exceeded` (limite da
pilha de chamadas excedido) nas quatro operações, em todos os 20 processos com
profundidade de 10 mil. A versão nova completou todos os cenários. Não houve
falha de processo nas 280 execuções.

## Efeito da seleção

Em outro cenário de 100 mil rotas, 20 mil têm `noindex: true` e 10 mil páginas
indexáveis declaram `llms: true`. Os conjuntos selecionado e não indexável são
disjuntos nessa entrada; os testes funcionais daquela versão cobriam o conflito
entre as opções.

| Resultado                  |            Antes |          Depois |
| -------------------------- | ---------------: | --------------: |
| Caminhos coletados         |          100.000 |          80.000 |
| Páginas publicadas no llms |          100.000 |          10.000 |
| Mediana do llms completo   |       230,436 ms |       66,380 ms |
| P95 do llms completo       |       235,035 ms |       69,503 ms |
| Corpo UTF-8 do llms        | 12.288.995 bytes | 1.228.994 bytes |

A redução de tempo nesse cenário inclui a publicação de menos conteúdo. Ela não
representa uma comparação do mesmo resultado. A coleta ainda percorre as 100 mil
rotas e resolve os metadados antes da seleção do endpoint.

## Memória e limites

Com 100 mil páginas selecionadas, a mediana da diferença de heap entre início e
fim da operação caiu de 36,26 para 30,03 MiB na coleta de caminhos, de 65,93
para 50,74 MiB na coleta de metadados e de 113,94 para 107,87 MiB no llms
completo. Essa diferença sofre influência do GC durante a operação. Não mede
pico de memória, RSS ou memória retida depois de outro GC.

O llms medido com as 100 mil páginas sintéticas ocupa 12.288.995 bytes. A
implementação não impõe um limite de tamanho. Sites grandes precisam medir seus
textos reais e avaliar a organização do conteúdo publicado.

O [protocolo de sitemap](https://www.sitemaps.org/protocol.html) limita cada
arquivo a 50 mil URLs e 52.428.800 bytes sem compressão. Por isso, os cenários
com 100 mil rotas mediram o coletor, sem gerar um XML único inválido. O endpoint
atual produz um único sitemap e não implementa divisão automática. A aplicação
que ultrapassar qualquer limite precisa de vários arquivos e um índice.

`noindex` é publicado como metatag HTML, conforme a
[documentação do Google](https://developers.google.com/search/docs/crawling-indexing/block-indexing).
A exclusão dessas páginas do llms é uma política deste projeto; o benchmark não
verifica comportamento de buscadores ou agentes externos.

## Evidências e reprodução local

Os artefatos desta execução ficaram num diretório temporário da máquina da
medição, fora do repositório, e não existem mais. Eles não são versionados, e os
números acima são o único registro preservado. A execução usava:

- uma cópia dos helpers anteriores à alteração, como linha de base;
- um script que carregava o código real e media uma versão e um cenário;
- um script que executava os 20 pares alternados de cada cenário;
- um arquivo com o ambiente e os parâmetros;
- um JSONL com os 280 registros, com tempos, erros, contagens e tamanhos.

Um piloto interrompido antes da versão final não participa dos resultados. Para
repetir a medição, recrie esses scripts fora do repositório: copie os helpers da
revisão de base para a linha de base, importe `collectLlmsPages` e a assinatura
atual de `buildLlmsText`, que recebe o array `pages`, e alterne a ordem entre
base e candidato em processos Node novos, como descrito no método acima. Instale
as dependências declaradas pelo projeto e grave os resultados num arquivo novo.
Estes números são uma observação local, sem limite de desempenho imposto à CI.
