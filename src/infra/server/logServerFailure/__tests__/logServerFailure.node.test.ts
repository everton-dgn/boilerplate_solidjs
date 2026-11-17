import {
  hostileValue,
  throwValue
} from '@/tests/helpers/failureValues/index.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

import { logServerFailure } from '../index.ts'

const MESSAGE = '[middleware] Unexpected failure; private details omitted'
const LOG_ATTEMPTS = 2
// Limits of the module: written frames, lines read after the header and the
// size of the examined line.
const FRAME_LIMIT = 10
const READ_LIMIT = 50
const LINE_LIMIT = 1024
// The synthetic stack offers more valid frames than the log writes.
const SYNTHETIC_FRAMES = 15
// First frame of an error created in this file.
const LOCAL_FRAME = /^ {4}at .+logServerFailure\.node\.test\.ts:\d+:\d+\)?$/u
const LATE_FRAME = '    at late (file:///app/server.js:1:1)'
const PLAIN_FRAME = '    at handler (/app/server.js:1:1)'
// A line shaped like a frame embedded in the name or the code of an error.
const INJECTED_FRAME = '    at /PRIVATE_HEADER:1:1'

type ErrorClass = new (message: string) => Error

// A library error that changes the name after super(): V8 builds the stack
// header with the current name on the first read.
class UpstreamError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'UpstreamError'
  }
}

// Returned by a function, the class expression gets the name of no variable:
// the constructor keeps an empty name.
function anonymousErrorClass(): ErrorClass {
  return class extends Error {}
}

// The log of a failure is a single call with a single string.
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

// Creates the error with the header that Node itself builds. Vitest replaces
// Error.prepareStackTrace with the one of the Vite module runner, which leaves out
// the code of Node errors and writes "Error: " when the message is empty; the Node
// formatter comes back only during the creation and the first read of the stack,
// which pins the header.
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

// A stack replaced by text that imitates the V8 header and frames: the format
// that a forged stack needs to copy to pass the filter.
function withStack(lines: string[]): Error {
  return Object.assign(new Error('PRIVATE_MESSAGE'), {
    stack: ['Error: PRIVATE_MESSAGE', ...lines].join('\n')
  })
}

// A valid frame with exactly the requested size.
function frameOfLength(length: number): string {
  const prefix = '    at handler (/'
  const suffix = '.js:1:1)'
  return `${prefix}${'a'.repeat(length - prefix.length - suffix.length)}${suffix}`
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

describe('fixed line of the failure log', () => {
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
    ['error-page', '[error-page] Unexpected failure; private details omitted'],
    ['sitemap', '[sitemap] Unexpected failure; private details omitted']
  ] as const)(
    'writes %s with only the fixed line without an error',
    (source, message) => {
      logServerFailure({ source })
      expect(console.error).toHaveBeenCalledExactlyOnceWith(message)
    }
  )

  it.each([
    ['a string', 'PRIVATE_STRING'],
    [
      'a plain object',
      {
        message: 'PRIVATE_MESSAGE',
        stack: 'Error: PRIVATE_MESSAGE\n    at /PRIVATE_FRAME:1:1'
      }
    ],
    ['a Proxy whose prototype throws', hostileValue()],
    ['an Error Proxy whose reads throw', hostileError()],
    ['an Error whose stack getter throws', throwingStack()]
  ])('writes only the fixed line for %s', (_label, error) => {
    logServerFailure({ source: 'middleware', error })
    expect(console.error).toHaveBeenCalledExactlyOnceWith(MESSAGE)
  })
})

describe('log destination failures', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('tries only the fixed line after a failure, without inspecting the error again', () => {
    const readStack = vi.fn<() => string>(
      () => `Error: PRIVATE_MESSAGE\n${PLAIN_FRAME}`
    )
    const error = Object.defineProperty(
      new Error('PRIVATE_MESSAGE', { cause: 'PRIVATE_CAUSE' }),
      'stack',
      { get: readStack }
    )
    vi.mocked(console.error).mockImplementationOnce(() => {
      throw new Error('PRIVATE_DESTINATION')
    })

    expect(() =>
      logServerFailure({ source: 'middleware', error })
    ).not.toThrow()

    expect(readStack).toHaveBeenCalledOnce()
    expect(readLog(console.error)).toStrictEqual({
      heads: [[MESSAGE, 'Error'], [MESSAGE]],
      leaks: []
    })
  })

  it('stops after two destination failures without propagating them', () => {
    vi.mocked(console.error)
      .mockImplementationOnce(() => {
        throw new Error('PRIVATE_FIRST_DESTINATION')
      })
      .mockImplementationOnce(() => {
        throw new Error('PRIVATE_SECOND_DESTINATION')
      })

    try {
      expect(() =>
        logServerFailure({ source: 'middleware', error: new Error('PRIVATE') })
      ).not.toThrow()

      expect(readLog(console.error)).toStrictEqual({
        heads: [[MESSAGE, 'Error'], [MESSAGE]],
        leaks: []
      })
    } finally {
      vi.mocked(console.error).mockReset()
    }
  })

  it('contains failures in the access to the destination itself', () => {
    const descriptor = Object.getOwnPropertyDescriptor(console, 'error')
    assert(descriptor)
    const readError = vi.fn<() => never>(() => {
      throw new Error('PRIVATE_CONSOLE_ACCESS')
    })
    Object.defineProperty(console, 'error', {
      configurable: true,
      get: readError
    })
    try {
      expect(() => logServerFailure({ source: 'middleware' })).not.toThrow()
      expect(readError).toHaveBeenCalledTimes(LOG_ATTEMPTS)
    } finally {
      Object.defineProperty(console, 'error', descriptor)
    }
  })
})

describe('original error in development', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('prints the error after the fixed line when asked in development', () => {
    vi.stubEnv('DEV', true)
    const error = new Error('PRIVATE')

    logServerFailure({ source: 'middleware', error, shouldPrintOriginal: true })

    expect(readLog(console.error).heads[0]).toStrictEqual([MESSAGE, 'Error'])
    expect(vi.mocked(console.error).mock.calls.slice(1)).toStrictEqual([
      [error]
    ])
  })

  it.each([
    ['outside development', false, true],
    ['without a request from the caller', true, false]
  ])(
    'does not print the original error %s',
    (_label, isDevelopment, shouldPrint) => {
      vi.stubEnv('DEV', isDevelopment)

      logServerFailure({
        source: 'middleware',
        error: new Error('PRIVATE'),
        shouldPrintOriginal: shouldPrint
      })

      expect(readLog(console.error)).toStrictEqual({
        heads: [[MESSAGE, 'Error']],
        leaks: []
      })
    }
  )

  it('contains the failure when printing the original error', () => {
    vi.stubEnv('DEV', true)
    vi.mocked(console.error)
      .mockImplementationOnce(vi.fn())
      .mockImplementationOnce(() => {
        throw new Error('PRIVATE_DESTINATION')
      })

    expect(() =>
      logServerFailure({
        source: 'middleware',
        error: new Error('PRIVATE'),
        shouldPrintOriginal: true
      })
    ).not.toThrow()
  })
})

describe('class and frames of the failure log', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('writes the class and the frames without the message, cause or properties', () => {
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

  it('does not treat a line of the message as a frame', () => {
    const error = new Error('PRIVATE_MESSAGE\n    at /segredo:1:1')
    // Positive control: the fake line stays in the stack, right after the header.
    expect(error.stack).toContain('PRIVATE_MESSAGE\n    at /segredo:1:1\n')

    logServerFailure({ source: 'middleware', error })

    const [first, name, frame] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, 'Error'])
    expect(frame).toMatch(LOCAL_FRAME)
    expect(loggedText()).not.toMatch(/segredo|PRIVATE/u)
  })

  it('drops the frames of an overwritten stack without the header', () => {
    const error = Object.assign(new Error('PRIVATE_MESSAGE'), {
      stack: '    at /segredo:1:1\n    at file:///PRIVATE_FRAME.js:1:1'
    })

    logServerFailure({ source: 'middleware', error })

    expect(console.error).toHaveBeenCalledExactlyOnceWith(`${MESSAGE}\nError`)
  })

  it('drops the frames when the message changes after the stack was formatted', () => {
    const error = new Error('PRIVATE_BEFORE')
    // V8 builds the header on the first read of the stack; the message changed
    // after it no longer matches the header.
    expect(error.stack).toMatch(/^Error: PRIVATE_BEFORE\n/u)
    error.message = 'PRIVATE_AFTER'

    logServerFailure({ source: 'middleware', error })

    expect(console.error).toHaveBeenCalledExactlyOnceWith(`${MESSAGE}\nError`)
  })

  it('reads the class from the prototype, not from an own property', () => {
    const error = Object.assign(new TypeError('PRIVATE_MESSAGE'), {
      constructor: { name: 'SECRET' }
    })

    logServerFailure({ source: 'middleware', error })

    const [first, name, frame] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, 'TypeError'])
    expect(frame).toMatch(LOCAL_FRAME)
    expect(loggedText()).not.toMatch(/SECRET|PRIVATE/u)
  })

  it('validates and writes the same read of the class name', () => {
    const Failure = anonymousErrorClass()
    const error = new Failure('PRIVATE_MESSAGE')
    const readName = vi
      .fn<() => unknown>()
      .mockReturnValueOnce('Error')
      .mockReturnValue('PRIVATE_CLASS_NAME')
    Object.defineProperty(Failure, 'name', { get: readName })

    logServerFailure({ source: 'middleware', error })

    expect(readName).toHaveBeenCalledOnce()
    expect(readLog(console.error)).toStrictEqual({
      heads: [[MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('refuses class names that depend on a conversion to string', () => {
    const Failure = anonymousErrorClass()
    const error = Object.assign(new Failure('PRIVATE_MESSAGE'), {
      stack: `Error: PRIVATE_MESSAGE\n${PLAIN_FRAME}`
    })
    const convert = vi
      .fn<() => string>()
      .mockReturnValueOnce('Error')
      .mockReturnValue('PRIVATE_COERCION')
    Object.defineProperty(Failure, 'name', { value: { toString: convert } })

    logServerFailure({ source: 'middleware', error })

    expect(convert).not.toHaveBeenCalled()
    expect(loggedLines()).toStrictEqual([MESSAGE, PLAIN_FRAME])
  })

  it.each([
    [
      'a class that changes the name after super()',
      () => new UpstreamError('PRIVATE_MESSAGE'),
      'UpstreamError'
    ],
    [
      'a name changed after the creation',
      () =>
        Object.assign(new RangeError('PRIVATE_MESSAGE'), {
          name: 'PRIVATE_NAME'
        }),
      'RangeError'
    ]
  ])(
    'keeps the frames with %s, without writing the name',
    (_label, create, type) => {
      logServerFailure({ source: 'middleware', error: create() })

      const [first, name, frame] = loggedLines()
      expect([first, name]).toStrictEqual([MESSAGE, type])
      expect(frame).toMatch(LOCAL_FRAME)
      expect(loggedText()).not.toContain('PRIVATE')
    }
  )

  it('accepts the code of internal Node errors in the header', () => {
    const error = formattedByNode(textDecoderError)
    // Positive control: the header carries the code between brackets.
    expect(error.stack).toMatch(/^RangeError \[ERR_ENCODING_NOT_SUPPORTED\]: /u)

    logServerFailure({ source: 'middleware', error })

    const [first, name, frame] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, 'RangeError'])
    expect(frame).toMatch(/^ {4}at new TextDecoder \(node:/u)
    expect(loggedText()).not.toContain('PRIVATE')
  })

  // The name read from the header ends at the line break; without checking the
  // current name and code, the next lines of the header would pass as frames.
  it.each([
    [
      'a name with a line break and an empty message',
      () =>
        Object.assign(new Error('PRIVATE_MESSAGE'), {
          message: '',
          name: `Error\n${INJECTED_FRAME}`
        }),
      'Error'
    ],
    [
      'a name that embeds the message',
      () =>
        Object.assign(new Error('PRIVATE_MESSAGE'), {
          name: `X: PRIVATE_MESSAGE\n${INJECTED_FRAME}\nY`
        }),
      'Error'
    ],
    [
      'the name of a DOMException',
      () => new DOMException('', `Error\n${INJECTED_FRAME}`),
      'DOMException'
    ],
    [
      'the code of an internal Node error',
      () =>
        Object.assign(textDecoderError(), {
          code: `X]\n${INJECTED_FRAME}\nY`,
          message: ''
        }),
      'RangeError'
    ]
  ])('drops the frames with %s', (_label, create, type) => {
    const error = formattedByNode(create)
    // Positive control: the injected line stays in the stack, right after the name.
    expect(error.stack).toContain(`\n${INJECTED_FRAME}\n`)

    logServerFailure({ source: 'middleware', error })

    expect(console.error).toHaveBeenCalledExactlyOnceWith(`${MESSAGE}\n${type}`)
  })

  it('writes only the frames when the class has no valid name', () => {
    const Anonymous = anonymousErrorClass()
    // Positive control: the constructor has no name.
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

describe('stack read limits', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('writes at most 10 frames', () => {
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

  it('drops lines outside the frame grammar without stopping the read', () => {
    // Each pair joins a dropped line and an accepted frame.
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

  // A real frame in file:// arrives with those characters encoded; raw, they
  // would mess with the terminal or the viewer that shows the log.
  it.each([
    [
      'the ESC of a terminal sequence',
      '    at handler (/PRIVATE\u001B[2J:1:1)'
    ],
    ['U+202E, which reverses the text direction', '    at /PRIVATE‮gnp.js:1:1']
  ])('drops a frame with %s in the location', (_label, line) => {
    logServerFailure({
      source: 'middleware',
      error: withStack([line, PLAIN_FRAME])
    })

    expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', PLAIN_FRAME])
  })

  // Parentheses in the location would make a frame with a function end too early;
  // that is why files in route group folders leave the log.
  it.each([
    [
      'in a route group folder',
      '    at GET (/app/src/routes/(seo)/sitemap.xml/index.ts:1:1)'
    ],
    ['without a function', '    at /a(b):1:1'],
    [
      'in file:// with a route group',
      '    at file:///app/src/routes/(seo)/x.ts:1:1'
    ]
  ])('drops a frame with parentheses in the location %s', (_label, line) => {
    logServerFailure({
      source: 'middleware',
      error: withStack([line, PLAIN_FRAME])
    })

    expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', PLAIN_FRAME])
  })

  // With an empty message, V8 builds the header with the name only. The formatter
  // of the Vite module runner writes "Error: ", which leaves the log without frames.
  it.each([
    ['reads', 'Error', [PLAIN_FRAME]],
    ['drops', 'Error: ', []]
  ])(
    '%s the frames of an empty message under the %j header',
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
    ['accepts', LINE_LIMIT, [frameOfLength(LINE_LIMIT)]],
    ['drops', LINE_LIMIT + 1, []]
  ])('%s a line of %i characters', (_label, length, frames) => {
    logServerFailure({
      source: 'middleware',
      error: withStack([frameOfLength(length)])
    })

    expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', ...frames])
  })

  it.each([
    ['reads', READ_LIMIT - 1, [LATE_FRAME]],
    ['does not read', READ_LIMIT, []]
  ])('%s a frame after %i dropped lines', (_label, count, frames) => {
    const filler = Array.from({ length: count }, () => 'PRIVATE_FILLER')

    logServerFailure({
      source: 'middleware',
      error: withStack([...filler, LATE_FRAME])
    })

    expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', ...frames])
  })
})
