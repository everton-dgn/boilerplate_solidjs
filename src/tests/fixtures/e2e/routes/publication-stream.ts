import type { APIEvent } from 'filesystem-routing/api'

import { runPublication } from '@/infra/server/publication/index.ts'

const OUTPUT_BYTES = 16_777_216
const CHUNK_BYTES = 32_768
const DEADLINE_MS = 1000
const TEXT_BYTE = 97
const chunk = new Uint8Array(CHUNK_BYTES).fill(TEXT_BYTE)

export function GET({ request }: APIEvent): Promise<Response> {
  return runPublication({
    kind: 'markdown',
    signal: request.signal,
    maxOutputBytes: OUTPUT_BYTES,
    timeoutMs: DEADLINE_MS,
    run: () => {
      let bytes = 0
      return new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              if (bytes === OUTPUT_BYTES) {
                controller.close()
                return
              }
              bytes += chunk.byteLength
              controller.enqueue(chunk)
            }
          },
          { highWaterMark: 0 }
        ),
        { headers: { 'content-type': 'text/markdown; charset=utf-8' } }
      )
    }
  })
}
