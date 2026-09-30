import { getRequestEvent } from '@solidjs/web'

import type { Next } from '../types.ts'

export async function requestContext(
  _request: Request,
  next: Next
): Promise<Response> {
  const event = getRequestEvent()
  if (event) event.locals.requestId = crypto.randomUUID()
  return next()
}
