import { logServerFailure } from '../index.ts'

const MESSAGE = '[middleware] Unexpected failure; private details omitted'
// Limites do módulo: frames gravados, linhas lidas depois do cabeçalho e
// tamanho da linha examinada.
const FRAME_LIMIT = 10
const READ_LIMIT = 50
const LINE_LIMIT = 1024
// O stack sintético oferece mais frames válidos do que o log grava.
const SYNTHETIC_FRAMES = 15
// Primeiro frame de um erro criado neste arquivo.
const LOCAL_FRAME = /^ {4}at .+logServerFailure\.node\.test\.ts:\d+:\d+\)?$/u
const LATE_FRAME = '    at late (file:///app/server.js:1:1)'
const PLAIN_FRAME = '    at handler (/app/server.js:1:1)'
// Linha com a forma de frame embutida no name ou no code de um erro.
const INJECTED_FRAME = '    at /PRIVATE_HEADER:1:1'

type ErrorClass = new (message: string) => Error

// Um erro de biblioteca que troca o name depois do super(): o V8 monta o
// cabeçalho do stack com o name atual na primeira leitura.
class UpstreamError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'UpstreamError'
  }
}

// Devolvida por uma função, a expressão de classe não recebe o nome de nenhuma
// variável: o construtor fica com o nome vazio.
function anonymousErrorClass(): ErrorClass {
  return class extends Error {}
}

function throwValue(value: unknown): never {
  throw value
}

// O log de uma falha é uma única chamada com uma única string.
function loggedText(): string {
  const calls: unknown[][] = vi.mocked(console.error).mock.calls
  const [call] = calls
  const [entry] = call ?? []
  if (calls.length !== 1 || call?.length !== 1 || typeof entry !== 'string') {
    throw new TypeError('Expected one log call with a single string')
  }
  return entry
}

function loggedLines(): string[] {
  return loggedText().split('\n')
}

function caughtError(run: () => unknown): Error {
  try {
    run()
  } catch (error) {
    if (error instanceof Error) return error
  }
  throw new Error('Expected the operation to throw an Error')
}

function textDecoderError(): Error {
  return caughtError(() => new TextDecoder('PRIVATE_LABEL'))
}

// Cria o erro com o cabeçalho que o próprio Node monta. O Vitest troca o
// Error.prepareStackTrace pelo do module runner do Vite, que omite o código dos
// erros do Node e escreve "Error: " quando a mensagem é vazia; o formatador do
// Node volta só durante a criação e a primeira leitura do stack, que fixa o
// cabeçalho.
function formattedByNode(create: () => Error): Error {
  const formatter = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace')
  Reflect.deleteProperty(Error, 'prepareStackTrace')
  try {
    const error = create()
    if (typeof error.stack !== 'string') throw new TypeError('Expected a stack')
    return error
  } finally {
    if (formatter) Object.defineProperty(Error, 'prepareStackTrace', formatter)
  }
}

// Um stack trocado por texto que imita o cabeçalho e os frames do V8: o
// formato que um stack forjado precisa copiar para passar pelo filtro.
function withStack(lines: string[]): Error {
  return Object.assign(new Error('PRIVATE_MESSAGE'), {
    stack: ['Error: PRIVATE_MESSAGE', ...lines].join('\n')
  })
}

// Frame válido com exatamente o tamanho pedido.
function frameOfLength(length: number): string {
  const prefix = '    at handler (/'
  const suffix = '.js:1:1)'
  return `${prefix}${'a'.repeat(length - prefix.length - suffix.length)}${suffix}`
}

function hostileValue(): object {
  return new Proxy(
    {},
    { getPrototypeOf: () => throwValue(new Error('PRIVATE_PROTOTYPE')) }
  )
}

function hostileError(): Error {
  return new Proxy(new Error('PRIVATE_MESSAGE'), {
    get: () => throwValue(new Error('PRIVATE_GET'))
  })
}

function throwingStack(): Error {
  return Object.defineProperty(new Error('PRIVATE_MESSAGE'), 'stack', {
    get: () => throwValue(new Error('PRIVATE_STACK'))
  })
}

describe('linha fixa do log de falhas', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it.each([
    [
      'server-operation',
      '[server-operation] Unexpected failure; private details omitted'
    ],
    [
      'server-error',
      '[server-error] Unexpected failure; private details omitted'
    ],
    ['middleware', MESSAGE],
    ['error-page', '[error-page] Unexpected failure; private details omitted']
  ] as const)('registra %s só com a linha fixa sem erro', (source, message) => {
    logServerFailure({ source })
    expect(console.error).toHaveBeenCalledExactlyOnceWith(message)
  })

  it.each([
    ['uma string', 'PRIVATE_STRING'],
    [
      'um objeto comum',
      {
        message: 'PRIVATE_MESSAGE',
        stack: 'Error: PRIVATE_MESSAGE\n    at /PRIVATE_FRAME:1:1'
      }
    ],
    ['um Proxy cujo protótipo lança', hostileValue()],
    ['um Proxy de Error cujas leituras lançam', hostileError()],
    ['um Error cujo getter de stack lança', throwingStack()]
  ])('registra só a linha fixa para %s', (_label, error) => {
    logServerFailure({ source: 'middleware', error })
    expect(console.error).toHaveBeenCalledExactlyOnceWith(MESSAGE)
  })
})

describe('classe e frames do log de falhas', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('registra a classe e os frames sem mensagem, cause nem propriedades', () => {
    const error = Object.assign(
      new Error('PRIVATE_MESSAGE', { cause: 'PRIVATE_CAUSE' }),
      { internalContext: 'PRIVATE_CONTEXT' }
    )

    logServerFailure({ source: 'middleware', error })

    const [first, name, ...frames] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, 'Error'])
    expect(frames[0]).toMatch(LOCAL_FRAME)
    expect(frames.every(frame => frame.startsWith('    at '))).toBe(true)
    expect(loggedText()).not.toContain('PRIVATE')
  })

  it('não trata uma linha da mensagem como frame', () => {
    const error = new Error('PRIVATE_MESSAGE\n    at /segredo:1:1')
    // Controle positivo: a linha falsa fica no stack, logo após o cabeçalho.
    expect(error.stack).toContain('PRIVATE_MESSAGE\n    at /segredo:1:1\n')

    logServerFailure({ source: 'middleware', error })

    const [first, name, frame] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, 'Error'])
    expect(frame).toMatch(LOCAL_FRAME)
    expect(loggedText()).not.toMatch(/segredo|PRIVATE/u)
  })

  it('descarta os frames de um stack sobrescrito sem o cabeçalho', () => {
    const error = Object.assign(new Error('PRIVATE_MESSAGE'), {
      stack: '    at /segredo:1:1\n    at file:///PRIVATE_FRAME.js:1:1'
    })

    logServerFailure({ source: 'middleware', error })

    expect(console.error).toHaveBeenCalledExactlyOnceWith(`${MESSAGE}\nError`)
  })

  it('descarta os frames quando a mensagem muda depois da formatação do stack', () => {
    const error = new Error('PRIVATE_BEFORE')
    // O V8 monta o cabeçalho na primeira leitura do stack; a mensagem trocada
    // depois dela não confere mais com o cabeçalho.
    expect(error.stack).toMatch(/^Error: PRIVATE_BEFORE\n/u)
    error.message = 'PRIVATE_AFTER'

    logServerFailure({ source: 'middleware', error })

    expect(console.error).toHaveBeenCalledExactlyOnceWith(`${MESSAGE}\nError`)
  })

  it('lê a classe do protótipo, não de uma propriedade própria', () => {
    const error = Object.assign(new TypeError('PRIVATE_MESSAGE'), {
      constructor: { name: 'SEGREDO' }
    })

    logServerFailure({ source: 'middleware', error })

    const [first, name, frame] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, 'TypeError'])
    expect(frame).toMatch(LOCAL_FRAME)
    expect(loggedText()).not.toMatch(/SEGREDO|PRIVATE/u)
  })

  it.each([
    [
      'uma classe que troca o name depois do super()',
      () => new UpstreamError('PRIVATE_MESSAGE'),
      'UpstreamError'
    ],
    [
      'um name trocado depois da criação',
      () =>
        Object.assign(new RangeError('PRIVATE_MESSAGE'), {
          name: 'PRIVATE_NAME'
        }),
      'RangeError'
    ]
  ])('mantém os frames com %s, sem gravar o name', (_label, create, type) => {
    logServerFailure({ source: 'middleware', error: create() })

    const [first, name, frame] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, type])
    expect(frame).toMatch(LOCAL_FRAME)
    expect(loggedText()).not.toContain('PRIVATE')
  })

  it('aceita o código dos erros internos do Node no cabeçalho', () => {
    const error = formattedByNode(textDecoderError)
    // Controle positivo: o cabeçalho traz o código entre colchetes.
    expect(error.stack).toMatch(/^RangeError \[ERR_ENCODING_NOT_SUPPORTED\]: /u)

    logServerFailure({ source: 'middleware', error })

    const [first, name, frame] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, 'RangeError'])
    expect(frame).toMatch(/^ {4}at new TextDecoder \(node:/u)
    expect(loggedText()).not.toContain('PRIVATE')
  })

  // O nome lido do cabeçalho termina na quebra de linha; sem conferir o name e
  // o code atuais, as linhas seguintes do cabeçalho passariam por frames.
  it.each([
    [
      'um name com quebra de linha e mensagem vazia',
      () =>
        Object.assign(new Error('PRIVATE_MESSAGE'), {
          message: '',
          name: `Error\n${INJECTED_FRAME}`
        }),
      'Error'
    ],
    [
      'um name que embute a mensagem',
      () =>
        Object.assign(new Error('PRIVATE_MESSAGE'), {
          name: `X: PRIVATE_MESSAGE\n${INJECTED_FRAME}\nY`
        }),
      'Error'
    ],
    [
      'o name de uma DOMException',
      () => new DOMException('', `Error\n${INJECTED_FRAME}`),
      'DOMException'
    ],
    [
      'o código de um erro interno do Node',
      () =>
        Object.assign(textDecoderError(), {
          code: `X]\n${INJECTED_FRAME}\nY`,
          message: ''
        }),
      'RangeError'
    ]
  ])('descarta os frames com %s', (_label, create, type) => {
    const error = formattedByNode(create)
    // Controle positivo: a linha injetada fica no stack, logo após o nome.
    expect(error.stack).toContain(`\n${INJECTED_FRAME}\n`)

    logServerFailure({ source: 'middleware', error })

    expect(console.error).toHaveBeenCalledExactlyOnceWith(`${MESSAGE}\n${type}`)
  })

  it('registra só os frames quando a classe não tem nome válido', () => {
    const Anonymous = anonymousErrorClass()
    // Controle positivo: o construtor não tem nome.
    expect(Anonymous.name).toBe('')

    logServerFailure({
      source: 'middleware',
      error: new Anonymous('PRIVATE_MESSAGE')
    })

    const [first, frame] = loggedLines()
    expect(first).toBe(MESSAGE)
    expect(frame).toMatch(LOCAL_FRAME)
    expect(loggedText()).not.toContain('PRIVATE')
  })
})

describe('limites da leitura do stack', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('grava no máximo 10 frames', () => {
    const frames = Array.from(
      { length: SYNTHETIC_FRAMES },
      (_, index) => `    at step${index} (file:///app/server.js:${index + 1}:1)`
    )

    logServerFailure({ source: 'middleware', error: withStack(frames) })

    expect(loggedLines()).toStrictEqual([
      MESSAGE,
      'Error',
      ...frames.slice(0, FRAME_LIMIT)
    ])
  })

  it('descarta linhas fora da gramática de frame sem interromper a leitura', () => {
    // Cada par junta uma linha descartada e um frame aceito.
    const pairs = [
      [
        '    at async Promise.all (index 0)',
        '    at handler (file:///app/server.js:1:2)'
      ],
      [
        '    at eval (eval at <anonymous> (file:///app/x.js:1:1), <anonymous>:1:1)',
        '    at async load (node:internal/modules/esm/loader:3:4)'
      ],
      [
        '    at https://PRIVATE.example/x.js:1:1',
        '    at new Store (/app/store.js:5:6)'
      ],
      [
        '    at handler (http://PRIVATE.example/x.js:1:1)',
        '    at Object.<anonymous> [as run] (/app/run.js:7:8)'
      ],
      ['    at /PRIVATE dir/x.js:1:1', '    at /app/server.js:9:10'],
      [
        '    at handler (file:///PRIVATE.js:1:1',
        '    at async file:///app/server.js:11:12'
      ],
      ['PRIVATE_LINE', '    at Array.[Symbol.iterator] (node:x:13:14)'],
      [
        '    at handler (file:///app/x.js:1:1) PRIVATE',
        '    at run (file:///app/run.js?v=1:15:16)'
      ],
      ['    at /app/x.js:1:1 PRIVATE', '    at node:internal/x:17:18']
    ] as const

    logServerFailure({ source: 'middleware', error: withStack(pairs.flat()) })

    expect(loggedLines()).toStrictEqual([
      MESSAGE,
      'Error',
      ...pairs.map(([, frame]) => frame)
    ])
  })

  // Um frame real em file:// chega com esses caracteres codificados; crus, eles
  // mexeriam no terminal ou no visualizador que exibe o log.
  it.each([
    [
      'o ESC de uma sequência de terminal',
      '    at handler (/PRIVATE\u001B[2J:1:1)'
    ],
    ['o U+202E, que inverte a direção do texto', '    at /PRIVATE‮gnp.js:1:1']
  ])('descarta um frame com %s no local', (_label, line) => {
    logServerFailure({
      source: 'middleware',
      error: withStack([line, PLAIN_FRAME])
    })

    expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', PLAIN_FRAME])
  })

  // Com mensagem vazia, o V8 monta o cabeçalho só com o nome. O formatador do
  // module runner do Vite escreve "Error: ", que deixa o log sem frames.
  it.each([
    ['lê', 'Error', [PLAIN_FRAME]],
    ['descarta', 'Error: ', []]
  ])(
    '%s os frames de uma mensagem vazia sob o cabeçalho %j',
    (_label, header, frames) => {
      const error = Object.assign(new Error('PRIVATE_MESSAGE'), {
        message: '',
        stack: [header, PLAIN_FRAME].join('\n')
      })

      logServerFailure({ source: 'middleware', error })

      expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', ...frames])
    }
  )

  it.each([
    ['aceita', LINE_LIMIT, [frameOfLength(LINE_LIMIT)]],
    ['descarta', LINE_LIMIT + 1, []]
  ])('%s uma linha de %i caracteres', (_label, length, frames) => {
    logServerFailure({
      source: 'middleware',
      error: withStack([frameOfLength(length)])
    })

    expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', ...frames])
  })

  it.each([
    ['lê', READ_LIMIT - 1, [LATE_FRAME]],
    ['não lê', READ_LIMIT, []]
  ])('%s um frame depois de %i linhas descartadas', (_label, count, frames) => {
    const filler = Array.from({ length: count }, () => 'PRIVATE_FILLER')

    logServerFailure({
      source: 'middleware',
      error: withStack([...filler, LATE_FRAME])
    })

    expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', ...frames])
  })
})
