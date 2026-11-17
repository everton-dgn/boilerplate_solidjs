import 'server-only'

type FailureSource =
  | 'server-operation'
  | 'server-error'
  | 'middleware'
  | 'error-page'
  | 'sitemap'
  | 'llms'
type FailureLog = {
  source: FailureSource
  error?: unknown
  shouldPrintOriginal?: boolean
}
type NameCheck = { error: Error; name: string }

const MAX_FRAMES = 10
const MAX_STACK_LINES = 50
const MAX_LINE_LENGTH = 1024
const CLASS_NAME = /^[A-Za-z_$][\w$]{0,63}$/u
// Name in the header that V8 builds with the current name of the error. Accepts
// the code of internal Node errors, such as "TypeError [ERR_INVALID_ARG_TYPE]".
const HEADER_NAME = /^[\w$.]{1,64}(?: \[[A-Z][A-Z0-9_]{0,63}\])?/u
const SIMPLE_NAME = /^[\w$.]{1,64}$/u
const NODE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u
// V8 frames with a location in a file: file://, node: or an absolute path,
// without spaces, parentheses or control or format characters (\p{C}), ending in
// :line:column. The function name covers the async and new prefixes, <anonymous>
// and the [as name] alias.
const CALL_FRAME =
  /^ {4}at [\w$.<>[\] ]+ \((?:file:\/\/|node:|\/)[^\s()\p{C}]*:\d+:\d+\)$/u
const LOCATION_FRAME =
  /^ {4}at (?:async )?(?:file:\/\/|node:|\/)[^\s()\p{C}]*:\d+:\d+$/u

function className(error: Error): string | undefined {
  const prototype: unknown = Object.getPrototypeOf(error)
  if (typeof prototype !== 'object' || prototype === null) return undefined
  const owner = 'constructor' in prototype ? prototype.constructor : undefined
  if (typeof owner !== 'function') return undefined
  const name: unknown = Reflect.get(owner, 'name')
  return typeof name === 'string' && CLASS_NAME.test(name) ? name : undefined
}

function isFrame(line: string): boolean {
  return (
    line.length <= MAX_LINE_LENGTH &&
    (CALL_FRAME.test(line) || LOCATION_FRAME.test(line))
  )
}

// The name read from the header must be the whole current name, or that name
// followed by the code of an internal Node error. A name or code with a line break
// would end the name read before the end of the header, and the next lines of it
// would pass as frames.
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

// The frames are only read when the stack starts with the header built from the
// current name and message: without it there is no way to know where the message
// ends, and a line of it could pass as a frame.
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

// An exception during the inspection (a getter that throws, a hostile Proxy)
// drops the class and the frames together: the log keeps only the fixed line.
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

export function logServerFailure({
  source,
  error,
  shouldPrintOriginal = false
}: FailureLog): void {
  // Fixed line per source: never include the message, cause or properties of the error.
  const line = `[${source}] Unexpected failure; private details omitted`
  try {
    console.error([line, ...errorDetails(error)].join('\n'))
  } catch {
    // The second attempt neither inspects the error nor uses the destination failure.
    try {
      console.error(line)
    } catch {
      // No log destination available.
    }
  }
  // The original error only goes out on the development server, even if a caller
  // asks for it in production.
  if (!shouldPrintOriginal || !import.meta.env.DEV) return
  try {
    console.error(error)
  } catch {
    // Formatting the error can also throw (a getter or a Proxy).
  }
}
