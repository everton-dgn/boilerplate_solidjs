import { serverTiming } from '../helpers/serverTiming/index.ts'
import { withHeaders } from '../helpers/withHeaders/index.ts'
import type { Next } from '../types.ts'

export async function requestTiming(
  _request: Request,
  next: Next
): Promise<Response> {
  const started = performance.now()
  const response = await next()
  return withHeaders({ response, headers: serverTiming({ response, started }) })
}
