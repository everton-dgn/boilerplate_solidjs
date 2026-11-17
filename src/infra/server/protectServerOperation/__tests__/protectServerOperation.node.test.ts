import { isResponseEnvelope, redirect, reload, respond } from '@solidjs/web'
import { NotReadyError } from 'solid-js'

import { createPublicError } from '@/infra/server/publicErrors/index.ts'
import { throwValue } from '@/tests/helpers/failureValues/index.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

import { protectServerOperation } from '../index.ts'

type Invocation = { run: () => unknown; allowControl?: boolean }
type CyclicData = { self?: CyclicData }
type VisitCount = { visits: number }
type CountedNode = { node: object; count: VisitCount }

const HTTP_CREATED = 201
const HTTP_NO_CONTENT = 204
const HTTP_RESET_CONTENT = 205
const HTTP_NOT_MODIFIED = 304
const DIAMOND_DEPTH = 16
const REJECTED_SHAPES = 4
const LOG_MESSAGE =
  '[server-operation] Unexpected failure; private details omitted'
// Without the paraglide locale context, the message is in the base locale.
const PUBLIC_MESSAGE = 'The request could not be completed.'

function thrownValue(invocation: Invocation): unknown {
  try {
    protectServerOperation(invocation)
  } catch (error) {
    return error
  }
  throw new Error('Expected operation to throw')
}

// Counts how many times the check lists the keys of each node.
function countedNode({ node, count }: CountedNode): object {
  return new Proxy(node, {
    ownKeys(target) {
      count.visits += 1
      return Reflect.ownKeys(target)
    }
  })
}

function logUnavailable(): never {
  throw new Error('stderr unavailable')
}

function expectPublicFailure(error: unknown): void {
  expect(error).toBeInstanceOf(Error)
  if (!(error instanceof Error)) throw new TypeError('Expected Error')
  expect(error.message).toBe(PUBLIC_MESSAGE)
  expect(error.cause).toBeUndefined()
  expect(Object.keys(error)).toStrictEqual([])
  expect(Object.getOwnPropertyNames(error).toSorted()).toStrictEqual([
    'message',
    'stack'
  ])
}

// Vitest runs with DEV true; the cases check the production log.
function mockProductionLog(): void {
  vi.stubEnv('DEV', false)
  vi.spyOn(console, 'error').mockImplementation(vi.fn())
}

describe('server operation protection', () => {
  beforeEach(mockProductionLog)

  it('keeps the sync return and removes exception details', () => {
    const data = { ok: true }
    expect(protectServerOperation({ run: () => data })).toBe(data)
    const internal = Object.assign(
      new Error('PRIVATE_MESSAGE', { cause: 'PRIVATE_CAUSE' }),
      {
        internalContext: 'PRIVATE_CONTEXT'
      }
    )
    const error = thrownValue({ run: () => throwValue(internal) })
    expectPublicFailure(error)
    expect(error).not.toBe(internal)
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('catches rejections and keeps an async success', async () => {
    const error = Object.assign(new Error('PRIVATE'), {
      internalContext: 'PRIVATE_CONTEXT'
    })
    await expect(
      protectServerOperation({ run: () => Promise.reject(error) })
    ).rejects.toThrow(PUBLIC_MESSAGE)
    await expect(
      protectServerOperation({ run: () => Promise.resolve({ ok: true }) })
    ).resolves.toStrictEqual({ ok: true })
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('rejects errors, classes, cycles and deferred sources inside results', async () => {
    const cyclic: CyclicData = {}
    cyclic.self = cyclic
    for (const value of [
      new Error('PRIVATE'),
      { error: new Error('PRIVATE') },
      { deferred: Promise.resolve('PRIVATE') },
      new Date(),
      cyclic
    ]) {
      expectPublicFailure(thrownValue({ run: () => value }))
      await expect(
        protectServerOperation({ run: () => Promise.resolve({ value }) })
      ).rejects.toThrow(PUBLIC_MESSAGE)
    }
  })

  it('rejects getters without running them and accepts resolved public fields', () => {
    const getter = vi.fn<() => string>(() => 'PRIVATE')
    const data = Object.defineProperty({}, 'private', {
      get: getter,
      enumerable: true
    })
    expectPublicFailure(thrownValue({ run: () => data }))
    expect(getter).not.toHaveBeenCalled()
    expect(
      protectServerOperation({
        run: () => [null, undefined, true, 1, 'public', { ok: true }]
      })
    ).toStrictEqual([null, undefined, true, 1, 'public', { ok: true }])
  })

  it('refuses Array subclasses without running the inherited serialization', async () => {
    const serialize = vi.fn<() => string[]>(() => ['PRIVATE_SERIALIZER'])
    class Rows extends Array<string> {
      public toJSON(): string[] {
        return serialize()
      }
    }
    const rows = new Rows('public')
    // The status without a body avoids serializing the fixture before it reaches the wrapper.
    const envelope = respond(rows, { status: 204 })
    for (const value of [rows, { rows }, envelope]) {
      expectPublicFailure(thrownValue({ run: () => value, allowControl: true }))
      await expect(
        protectServerOperation({
          run: () => Promise.resolve(value),
          allowControl: true
        })
      ).rejects.toThrow(PUBLIC_MESSAGE)
    }
    expect(serialize).not.toHaveBeenCalled()
    const plain = ['public']
    expect(protectServerOperation({ run: () => plain })).toBe(plain)
  })

  it('always creates a new public error, even if the previous one was tampered with', () => {
    const original = createPublicError()
    const first = thrownValue({ run: () => throwValue(original) })
    expectPublicFailure(first)
    expect(first).not.toBe(original)
    original.message = 'PRIVATE'
    Object.assign(original, {
      cause: 'PRIVATE_CAUSE',
      internalContext: 'PRIVATE_CONTEXT'
    })
    expectPublicFailure(thrownValue({ run: () => throwValue(original) }))
    expect(console.error).not.toHaveBeenCalled()
  })

  it('keeps Solid signals only when the invocation allows control', async () => {
    const pending = new NotReadyError(Promise.resolve('ready'))
    for (const control of [redirect('/'), reload(), pending]) {
      const run = () => throwValue(control)
      const logged = vi.mocked(console.error).mock.calls.length
      expect(thrownValue({ run, allowControl: true })).toBe(control)
      await expect(
        protectServerOperation({
          run: async () => throwValue(await Promise.resolve(control)),
          allowControl: true
        })
      ).rejects.toBe(control)
      expect(console.error).toHaveBeenCalledTimes(logged)
      expectPublicFailure(thrownValue({ run }))
    }
    const response = redirect('/')
    expect(
      protectServerOperation({ run: () => response, allowControl: true })
    ).toBe(response)
    expectPublicFailure(thrownValue({ run: () => response }))
  })

  it('refuses Response.error() as a control, thrown or returned', () => {
    const failure = Response.error()

    expectPublicFailure(
      thrownValue({ run: () => throwValue(failure), allowControl: true })
    )
    expectPublicFailure(thrownValue({ run: () => failure, allowControl: true }))
    // The thrown one is not an Error; the returned one fails the structural check,
    // which throws an Error of its own.
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE], [LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('checks envelope values and rejects upstream bodies', () => {
    const response = respond(
      { ok: true },
      {
        status: HTTP_CREATED,
        headers: { 'x-public': 'yes' },
        revalidate: 'users'
      }
    )
    const rebuilt: unknown = protectServerOperation({
      run: () => response,
      allowControl: true
    })
    if (!isResponseEnvelope(rebuilt)) throw new TypeError('Expected envelope')
    expect(rebuilt.value).toStrictEqual({ ok: true })
    expect(rebuilt.response?.status).toBe(HTTP_CREATED)
    expect(rebuilt.response?.headers.get('x-public')).toBe('yes')
    expect(rebuilt.response?.headers.get('x-revalidate')).toBe('users')
    const control = thrownValue({
      run: () => throwValue(response),
      allowControl: true
    })
    expect(control).toMatchObject({ value: { ok: true } })
    const invalid = respond({ error: new Error('PRIVATE') })
    expectPublicFailure(
      thrownValue({ run: () => throwValue(invalid), allowControl: true })
    )
    const upstream = new Response('PRIVATE')
    expectPublicFailure(
      thrownValue({ run: () => upstream, allowControl: true })
    )
    expectPublicFailure(
      thrownValue({ run: () => throwValue(upstream), allowControl: true })
    )
  })

  it('does not mix the results of concurrent operations', async () => {
    const results = await Promise.allSettled([
      protectServerOperation({
        run: () => Promise.reject(new Error('PRIVATE_A'))
      }),
      protectServerOperation({
        run: () => Promise.resolve({ message: 'public B' })
      }),
      protectServerOperation({
        run: () => Promise.reject(new Error('PRIVATE_C'))
      })
    ])
    expect(results[1]).toStrictEqual({
      status: 'fulfilled',
      value: { message: 'public B' }
    })
    for (const result of results) {
      if (result.status === 'rejected') expectPublicFailure(result.reason)
    }
  })
})

describe('envelope rebuilding', () => {
  // respond() serializes in the body the value received on creation. A value
  // changed after that passes the check, but the original body would still go out.
  it('rebuilds the envelope and the body from the checked data', async () => {
    const envelope = respond(
      { secret: 'PRIVATE_BODY' },
      { status: HTTP_CREATED, headers: { 'x-public': 'yes' } }
    )
    Object.assign(envelope, { value: { ok: true } })

    const rebuilt: unknown = protectServerOperation({
      run: () => envelope,
      allowControl: true
    })

    if (!isResponseEnvelope(rebuilt)) throw new TypeError('Expected envelope')
    expect(rebuilt).not.toBe(envelope)
    expect(rebuilt.value).toStrictEqual({ ok: true })
    expect(rebuilt.status).toBe(HTTP_CREATED)
    expect(rebuilt.headers.get('x-public')).toBe('yes')
    await expect(rebuilt.text()).resolves.toBe('{"ok":true}')
  })
})

describe('envelopes without a body', () => {
  beforeEach(mockProductionLog)

  it.each([HTTP_NO_CONTENT, HTTP_RESET_CONTENT, HTTP_NOT_MODIFIED])(
    'validates private data in the envelope with status %s',
    status => {
      const envelope = respond({ error: new Error('PRIVATE') }, { status })
      expect(envelope).toBeInstanceOf(Response)
      expectPublicFailure(
        thrownValue({ run: () => envelope, allowControl: true })
      )
      expectPublicFailure(
        thrownValue({
          run: () => throwValue(envelope),
          allowControl: true
        })
      )
    }
  )
})

describe('operation protection log', () => {
  beforeEach(mockProductionLog)

  it('throws the public error even when the log fails', async () => {
    // The log fails on the sync and the async path; the mock goes back to normal
    // afterwards, so it does not affect the logs of Vitest itself.
    vi.mocked(console.error)
      .mockImplementationOnce(logUnavailable)
      .mockImplementationOnce(logUnavailable)
      .mockImplementationOnce(logUnavailable)
      .mockImplementationOnce(logUnavailable)

    expectPublicFailure(
      thrownValue({ run: () => throwValue(new Error('PRIVATE_SYNC')) })
    )
    await expect(
      protectServerOperation({
        run: () => Promise.reject(new Error('PRIVATE_ASYNC'))
      })
    ).rejects.toThrow(PUBLIC_MESSAGE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [
        [LOG_MESSAGE, 'Error'],
        [LOG_MESSAGE],
        [LOG_MESSAGE, 'Error'],
        [LOG_MESSAGE]
      ],
      leaks: []
    })
  })

  it('prints the original error after the filtered line in development', () => {
    vi.stubEnv('DEV', true)
    const failure = new Error('PRIVATE')

    expectPublicFailure(thrownValue({ run: () => throwValue(failure) }))
    expect(readLog(console.error).heads[0]).toStrictEqual([
      LOG_MESSAGE,
      'Error'
    ])
    expect(vi.mocked(console.error).mock.calls.slice(1)).toStrictEqual([
      [failure]
    ])
  })
})

describe('public data structure', () => {
  beforeEach(mockProductionLog)

  it('inspects setters, Symbol keys and non-enumerable properties', () => {
    const secret = Symbol('secret')
    const setter = vi.fn<(value: string) => void>()
    for (const value of [
      // oxlint-disable-next-line eslint/accessor-pairs -- The lone setter is exactly the case that the guard must refuse.
      Object.defineProperty({}, 'private', { set: setter, enumerable: true }),
      { [secret]: new Error('PRIVATE') },
      { [secret]: Object.defineProperty({}, 'private', { get: () => 'X' }) },
      Object.defineProperty({}, 'private', {
        value: new Error('PRIVATE'),
        enumerable: false
      })
    ]) {
      expectPublicFailure(thrownValue({ run: () => value }))
    }
    expect(setter).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledTimes(REJECTED_SHAPES)
  })

  it('accepts shared references visiting each node once and refuses deep cycles', () => {
    const shared = { id: 1 }
    const dag = { a: shared, b: [shared, { c: shared }] }
    expect(protectServerOperation({ run: () => dag })).toBe(dag)
    // One diamond per level doubles the paths to the leaf: without a memory of the
    // nodes already checked, 16 levels would cost 2^17 - 1 visits instead of 17.
    // The count does not depend on the speed of the machine.
    const count: VisitCount = { visits: 0 }
    let diamond = countedNode({ node: { leaf: true }, count })
    for (let depth = 0; depth < DIAMOND_DEPTH; depth += 1) {
      diamond = countedNode({
        node: { left: diamond, right: diamond },
        count
      })
    }
    expect(protectServerOperation({ run: () => diamond })).toBe(diamond)
    expect(count.visits).toBe(DIAMOND_DEPTH + 1)
    const nested: CyclicData = {}
    nested.self = nested
    expectPublicFailure(
      thrownValue({ run: () => ({ level: { nested }, shared }) })
    )
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })
})
