import assert from 'node:assert/strict'
import { it } from 'node:test'

import { writeAll } from '../index.ts'

const MAX_WRITE = 3

it('continua depois de gravações curtas até gravar todos os bytes', async () => {
  const received: number[] = []
  const lengths: number[] = []
  const output = {
    write(buffer: Uint8Array) {
      const bytesWritten = Math.min(MAX_WRITE, buffer.byteLength)
      lengths.push(buffer.byteLength)
      received.push(...buffer.subarray(0, bytesWritten))
      return Promise.resolve({ bytesWritten })
    }
  }
  const bytes = new TextEncoder().encode('Café ☕ e 日本語')
  await writeAll({ output, bytes })
  assert.deepEqual(Uint8Array.from(received), bytes)
  assert.ok(lengths.length > 1)
  // Cada chamada recebe só o que falta gravar.
  assert.deepEqual(
    lengths,
    lengths.map((_, index) => bytes.byteLength - index * MAX_WRITE)
  )
})

it('recusa uma gravação sem progresso', async () => {
  const output = { write: () => Promise.resolve({ bytesWritten: 0 }) }
  await assert.rejects(
    writeAll({ output, bytes: new TextEncoder().encode('# A') }),
    { message: 'File write made no progress' }
  )
})

it('para no bloco seguinte quando o sinal é abortado no meio', async () => {
  const controller = new AbortController()
  let calls = 0
  const output = {
    write() {
      calls += 1
      controller.abort(new Error('cancelled'))
      return Promise.resolve({ bytesWritten: 1 })
    }
  }
  await assert.rejects(
    writeAll({
      output,
      bytes: new TextEncoder().encode('# About'),
      signal: controller.signal
    }),
    { message: 'cancelled' }
  )
  assert.equal(calls, 1)
})
