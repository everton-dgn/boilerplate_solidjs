import 'server-only'
import * as v from 'valibot'

import { protectServerOperation } from '../protectServerOperation/index.ts'

type RequestJsonOptions<T> = {
  url: string | URL
  schema: v.GenericSchema<unknown, T>
  init?: RequestInit
}

// A slow backend or an endless body must not hold the server function or the
// server memory. The limits also apply when init carries a signal.
const TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 1_000_000

function requestSignal(init: RequestInit | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  return init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
}

async function readBoundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  if (declared > MAX_BODY_BYTES || !response.body) {
    await response.body?.cancel()
    throw new Error('Backend response too large')
  }
  const decoder = new TextDecoder()
  let text = ''
  let received = 0
  // Throwing inside the loop ends the iterator and cancels the source stream.
  for await (const chunk of response.body) {
    received += chunk.byteLength
    if (received > MAX_BODY_BYTES) {
      throw new Error('Backend response too large')
    }
    text += decoder.decode(chunk, { stream: true })
  }
  return text + decoder.decode()
}

export function requestJson<T>({
  url,
  schema,
  init
}: RequestJsonOptions<T>): Promise<T> {
  return protectServerOperation({
    run: async () => {
      const response = await fetch(url, {
        ...init,
        signal: requestSignal(init)
      })
      // Do not read or attach the body of HTTP failures to the error.
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error('Backend request failed')
      }
      const data: unknown = JSON.parse(await readBoundedText(response))
      return v.parse(schema, data)
    }
  })
}
