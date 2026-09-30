import 'server-only'

type FailureSource =
  | 'server-operation'
  | 'server-error'
  | 'middleware'
  | 'error-page'
type FailureLog = { source: FailureSource; error?: unknown }
type NameCheck = { error: Error; name: string }

// Primeira linha de todo log, igual byte a byte por origem: o E2E conta essas
// linhas. O restante nunca traz mensagem, cause, propriedades próprias nem
// error.name, e só existe quando o valor recebido é um Error.
const MESSAGES = {
  'server-operation':
    '[server-operation] Unexpected failure; private details omitted',
  'server-error': '[server-error] Unexpected failure; private details omitted',
  middleware: '[middleware] Unexpected failure; private details omitted',
  'error-page': '[error-page] Unexpected failure; private details omitted'
} as const satisfies Record<FailureSource, string>

// Frames gravados por log; o V8 captura 10 por padrão (Error.stackTraceLimit).
const MAX_FRAMES = 10
// Linhas lidas depois do cabeçalho e tamanho máximo da linha examinada. Uma
// linha maior é descartada antes de passar pelas expressões.
const MAX_STACK_LINES = 50
const MAX_LINE_LENGTH = 1024
// Nome da classe, lido do construtor do protótipo: um identificador simples.
const CLASS_NAME = /^[A-Za-z_$][\w$]{0,63}$/u
// Nome no cabeçalho que o V8 monta com o name atual do erro. Aceita o código
// dos erros internos do Node, como "TypeError [ERR_INVALID_ARG_TYPE]".
const HEADER_NAME = /^[\w$.]{1,64}(?: \[[A-Z][A-Z0-9_]{0,63}\])?/u
// Formas do name e do code atuais que podem compor o nome do cabeçalho.
const SIMPLE_NAME = /^[\w$.]{1,64}$/u
const NODE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u
// Frames do V8 com local em arquivo: file://, node: ou caminho absoluto, sem
// espaços, parênteses nem caracteres de controle ou de formatação (\p{C}),
// terminado em :linha:coluna. O nome da função cobre os prefixos async e new,
// <anonymous> e o alias [as nome].
const CALL_FRAME =
  /^ {4}at [\w$.<>[\] ]+ \((?:file:\/\/|node:|\/)[^\s()\p{C}]*:\d+:\d+\)$/u
// Frame sem nome de função; "async" marca uma função anônima assíncrona.
const LOCATION_FRAME =
  /^ {4}at (?:async )?(?:file:\/\/|node:|\/)[^\s()\p{C}]*:\d+:\d+$/u

function className(error: Error): string | undefined {
  const prototype: unknown = Object.getPrototypeOf(error)
  if (typeof prototype !== 'object' || prototype === null) return undefined
  const owner = 'constructor' in prototype ? prototype.constructor : undefined
  if (typeof owner !== 'function') return undefined
  return CLASS_NAME.test(owner.name) ? owner.name : undefined
}

function isFrame(line: string): boolean {
  return (
    line.length <= MAX_LINE_LENGTH &&
    (CALL_FRAME.test(line) || LOCATION_FRAME.test(line))
  )
}

// O nome lido do cabeçalho precisa ser o name atual inteiro, ou ele seguido do
// código de um erro interno do Node. Um name ou code com quebra de linha
// encerraria o nome lido antes do fim do cabeçalho, e as linhas seguintes dele
// passariam por frames.
function isCurrentName({ error, name }: NameCheck): boolean {
  const current: unknown = Reflect.get(error, 'name')
  if (typeof current !== 'string' || !SIMPLE_NAME.test(current)) return false
  if (name === current) return true
  const code: unknown = Reflect.get(error, 'code')
  return (
    typeof code === 'string' &&
    NODE_CODE.test(code) &&
    name === `${current} [${code}]`
  )
}

// Os frames só são lidos quando o stack começa pelo cabeçalho montado com o
// name e a mensagem atuais: sem ele não há como saber onde a mensagem termina,
// e uma linha dela poderia se passar por frame.
function stackFrames(error: Error): string[] {
  const stack: unknown = Reflect.get(error, 'stack')
  const message: unknown = Reflect.get(error, 'message')
  if (typeof stack !== 'string' || typeof message !== 'string') return []
  const [name] = HEADER_NAME.exec(stack) ?? []
  if (name === undefined || !isCurrentName({ error, name })) return []
  const header = message === '' ? name : `${name}: ${message}`
  if (!stack.startsWith(`${header}\n`)) return []
  return stack
    .slice(header.length + 1)
    .split('\n', MAX_STACK_LINES)
    .filter(line => isFrame(line))
    .slice(0, MAX_FRAMES)
}

// Uma exceção na inspeção (getter que lança, Proxy hostil) descarta a classe e
// os frames juntos: o log fica só com a linha fixa.
function errorDetails(error: unknown): string[] {
  try {
    if (!(error instanceof Error)) return []
    const name = className(error)
    const frames = stackFrames(error)
    return name === undefined ? frames : [name, ...frames]
  } catch {
    return []
  }
}

export function logServerFailure({ source, error }: FailureLog): void {
  console.error([MESSAGES[source], ...errorDetails(error)].join('\n'))
}
