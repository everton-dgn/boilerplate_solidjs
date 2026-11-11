# Registro de falhas no servidor

[Voltar ao guia principal](../server-errors.md)

## Log de falhas

`logServerFailure({ source, error })` tenta registrar uma string de várias
linhas em um único argumento de `console.error`:

1. A mensagem fixa da origem, como
   `[middleware] Unexpected failure; private details omitted`. O texto segue
   igual byte a byte, porque o E2E conta as linhas que o contêm.
2. Só quando `error instanceof Error`, o nome da classe, lido uma única vez de
   `Object.getPrototypeOf(error).constructor.name` e gravado apenas se for uma
   string com um identificador simples de até 64 caracteres. Outros valores não
   são convertidos para texto. Nem `error.name` nem uma propriedade própria
   `constructor` são usados.
3. Até 10 frames do stack, um por linha.

Os frames só são lidos quando `error.stack` começa pelo cabeçalho que o V8 monta
com o `name` e a mensagem atuais: `<nome>: <message>` seguido de quebra de
linha, ou só o nome quando a mensagem é vazia. O nome do cabeçalho precisa ser o
`error.name` atual inteiro, um identificador simples de até 64 caracteres, ou,
num erro interno do Node, esse nome seguido do `code`, como em
`TypeError [ERR_INVALID_ARG_TYPE]`. Um `name` ou `code` com quebra de linha, que
deixaria linhas do cabeçalho com forma de frame, também deixa o log sem frames.
O cabeçalho inteiro é descartado, inclusive as linhas de uma mensagem com
quebras. Um stack sobrescrito, ou um `name` ou uma mensagem trocados depois da
primeira leitura do stack, deixa o log sem frames, porque não há como saber onde
o cabeçalho termina.

Depois do cabeçalho, só passam linhas `    at <função> (<local>)` ou
`    at <local>`, com o local em `file://`, `node:` ou caminho absoluto, sem
espaços, parênteses nem caracteres de controle ou de formatação (categoria
Unicode `C`, como o ESC das sequências de terminal e o U+202E, que inverte a
direção do texto), e terminado em `:linha:coluna`. Um frame real em `file://`
traz esses caracteres codificados. A função admite os prefixos `async` e `new`,
`<anonymous>` e o alias `[as nome]`; a forma sem função admite só o prefixo
`async`, das funções anônimas assíncronas. Por causa dos parênteses, um frame
que aponte para um arquivo fonte em pasta de grupo de rotas, como
`src/routes/(seo)/`, é descartado. As demais linhas, como
`async Promise.all (index 0)`, frames de `eval` e URLs HTTP, são descartadas sem
interromper a leitura. A leitura para em 50 linhas, e uma linha acima de 1024
caracteres é descartada antes das expressões regulares, que são ancoradas e sem
repetições aninhadas.

Ficam fora do log a mensagem, o `cause`, as propriedades próprias, `error.name`
e qualquer dado de um valor que não seja `Error`. Uma falha na inspeção, como um
getter que lança ou um Proxy hostil, deixa só a linha fixa. Se montar ou gravar
a linha falhar, o logger tenta uma única vez registrar apenas a mensagem fixa,
sem inspecionar o erro novamente. A falha dessa segunda tentativa é descartada.
O logger é síncrono e não propaga falhas de inspeção, montagem ou acesso ao
destino. Os consumidores mantêm a resposta pública mesmo sem log disponível. Se
o destino escrever e depois lançar, a mensagem fixa pode aparecer duas vezes.

No servidor de desenvolvimento, o hook de `configureServerErrors` devolve
`undefined`, e o runtime envia ao navegador o erro que recebeu. Três chamadores
passam `shouldPrintOriginal: true`, e o logger imprime o erro original numa
segunda chamada de `console.error`, depois da linha filtrada:

- O hook de `configureServerErrors`. Com o hook instalado, o runtime deixa de
  imprimir essas falhas, e sem esse pedido a mensagem só chegaria ao navegador.
- O `protectServerOperation`, que atende o wrapper e o `requestJson`. Ele troca
  a falha pelo erro público antes do runtime, e o hook recebe só esse erro, sem
  registrar log.
- O sitemap, que responde 503 sem passar pelo runtime.

Dentro de uma publicação (Markdown, sitemap, índices), o
`protectServerOperation` não registra a rejeição que é o próprio motivo do sinal
abortado da publicação, como a leitura de uma fonte cancelada pelo prazo ou pela
desconexão do cliente. A operação continua terminando no erro público. Qualquer
outro erro, mesmo com o sinal já abortado, é falha real e gera a linha
`[server-operation]`.

As origens `[middleware]` e `[error-page]` não fazem o pedido, porque em
desenvolvimento a contenção relança a exceção antes de registrar. Os
diagnósticos de desenvolvimento do Solid também imprimem a mensagem, como o de
um erro contido por `<Errored>`. O logger confere `import.meta.env.DEV` por
conta própria e ignora o pedido em produção. Uma falha ao formatar o erro
original é descartada.

Limites conhecidos:

- Um stack forjado que imite o cabeçalho e a gramática passa pelo filtro. O
  mesmo vale para uma mensagem ou um `name` trocados por um prefixo do valor
  original depois da primeira leitura do stack, e para um getter de `name` que
  devolva um valor na formatação do V8 e outro, simples, na conferência. Esses
  casos exigem código que altere o erro no próprio processo; um `name` ou `code`
  recebido apenas como dado não entra no log.
- O alias `[as nome]` de um frame mostra a propriedade usada na chamada, que
  pode ter sido escolhida em tempo de execução.
- Outro `Error.prepareStackTrace`, como o do module runner do Vite que o Vitest
  instala, pode montar o cabeçalho sem o código dos erros do Node ou como
  `Error: ` quando a mensagem é vazia; no segundo caso o log sai sem frames.
  Frames com caminho relativo ou com espaços também são descartados.
