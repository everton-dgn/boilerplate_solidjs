import { redirect, reload, respond } from '@solidjs/web'
import { NotReadyError } from 'solid-js'

import { createPublicError } from '@/infra/server/publicErrors/index.ts'

import { protectServerOperation } from '../index.ts'

type Invocation = { run: () => unknown; allowControl?: boolean }
type CyclicData = { self?: CyclicData }

const HTTP_CREATED = 201
const DIAMOND_DEPTH = 24
const REJECTED_SHAPES = 4

function thrownValue(invocation: Invocation): unknown {
  try {
    protectServerOperation(invocation)
  } catch (error) {
    return error
  }
  throw new Error('Expected operation to throw')
}

function throwValue(value: unknown): never {
  // oxlint-disable-next-line typescript/only-throw-error -- Exercita também valores arbitrários lançados por terceiros e sinais de controle.
  throw value
}

function expectPublicFailure(error: unknown): void {
  expect(error).toBeInstanceOf(Error)
  if (!(error instanceof Error)) throw new TypeError('Expected Error')
  expect(error.message).toBe('Não foi possível concluir a solicitação.')
  expect(error.cause).toBeUndefined()
  expect(Object.keys(error)).toStrictEqual([])
  expect(Object.getOwnPropertyNames(error).toSorted()).toStrictEqual([
    'message',
    'stack'
  ])
}

describe('proteção de operações no servidor', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))
  afterEach(() => vi.restoreAllMocks())

  it('preserva o retorno síncrono e remove detalhes de exceções', () => {
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
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[server-operation] Unexpected failure; private details omitted'
    )
  })

  it('captura rejeições e preserva sucesso assíncrono', async () => {
    const error = Object.assign(new Error('PRIVATE'), {
      internalContext: 'PRIVATE_CONTEXT'
    })
    await expect(
      protectServerOperation({ run: () => Promise.reject(error) })
    ).rejects.toThrow('Não foi possível concluir a solicitação.')
    await expect(
      protectServerOperation({ run: () => Promise.resolve({ ok: true }) })
    ).resolves.toStrictEqual({ ok: true })
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[server-operation] Unexpected failure; private details omitted'
    )
  })

  it('rejeita erros, classes, ciclos e fontes adiadas dentro de resultados', async () => {
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
      ).rejects.toThrow('Não foi possível concluir a solicitação.')
    }
  })

  it('rejeita getters sem executá-los e aceita campos públicos resolvidos', () => {
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

  it('recusa subclasses de Array sem executar a serialização herdada', async () => {
    const serialize = vi.fn<() => string[]>(() => ['PRIVATE_SERIALIZER'])
    class Rows extends Array<string> {
      public toJSON(): string[] {
        return serialize()
      }
    }
    const rows = new Rows('public')
    // O status sem corpo evita serializar a fixture antes de chegar ao wrapper.
    const envelope = respond(rows, { status: 204 })
    for (const value of [rows, { rows }, envelope]) {
      expectPublicFailure(thrownValue({ run: () => value, allowControl: true }))
      await expect(
        protectServerOperation({
          run: () => Promise.resolve(value),
          allowControl: true
        })
      ).rejects.toThrow('Não foi possível concluir a solicitação.')
    }
    expect(serialize).not.toHaveBeenCalled()
    const plain = ['public']
    expect(protectServerOperation({ run: () => plain })).toBe(plain)
  })

  it('sempre cria um erro público novo, mesmo se o anterior foi adulterado', () => {
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

  it('preserva sinais do Solid somente quando a invocação permite controle', async () => {
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

  it('verifica valores de envelopes e rejeita corpos upstream', () => {
    const response = respond(
      { ok: true },
      {
        status: HTTP_CREATED,
        headers: { 'x-public': 'yes' },
        revalidate: 'users'
      }
    )
    const rebuilt = protectServerOperation({
      run: () => response,
      allowControl: true
    })
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

  it('não mistura resultados de operações simultâneas', async () => {
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

describe('estrutura dos dados públicos', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))
  afterEach(() => vi.restoreAllMocks())

  it('inspeciona setters, chaves Symbol e propriedades não enumeráveis', () => {
    const secret = Symbol('secret')
    const setter = vi.fn<(value: string) => void>()
    for (const value of [
      // oxlint-disable-next-line eslint/accessor-pairs -- O setter isolado é exatamente o caso que o guard precisa recusar.
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

  it('aceita referências compartilhadas em tempo linear e recusa ciclos profundos', () => {
    const shared = { id: 1 }
    const dag = { a: shared, b: [shared, { c: shared }] }
    expect(protectServerOperation({ run: () => dag })).toBe(dag)
    // Um losango por nível dobra os caminhos até a folha: sem memória de nós
    // já verificados, 24 níveis custam 2^24 visitas e estouram o timeout.
    let diamond: unknown = { leaf: true }
    for (let depth = 0; depth < DIAMOND_DEPTH; depth += 1) {
      diamond = { left: diamond, right: diamond }
    }
    expect(protectServerOperation({ run: () => diamond })).toBe(diamond)
    const nested: CyclicData = {}
    nested.self = nested
    expectPublicFailure(
      thrownValue({ run: () => ({ level: { nested }, shared }) })
    )
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[server-operation] Unexpected failure; private details omitted'
    )
  })
})
