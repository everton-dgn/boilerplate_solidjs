import assert from 'node:assert/strict'
import { it } from 'node:test'

import { writeAll } from '../index.ts'

const MAX_WRITE = 3

it('continues after short writes until every byte is written', async () => {
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
  // Each call receives only what is left to write.
  assert.deepEqual(
    lengths,
    lengths.map((_, index) => bytes.byteLength - index * MAX_WRITE)
  )
})

it('refuses a write without progress', async () => {
  const output = { write: () => Promise.resolve({ bytesWritten: 0 }) }
  await assert.rejects(
    writeAll({ output, bytes: new TextEncoder().encode('# A') }),
    { message: 'File write made no progress' }
  )
})

it('stops at the next block when the signal is aborted in the middle', async () => {
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
