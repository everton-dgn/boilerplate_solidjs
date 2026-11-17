import { respond } from '@solidjs/web'

type EnvelopeData = { message: string }

// Envelope returned in a direct call during the SSR. The wrapper rebuilds the
// response from the checked data; the hook does not take part.
export async function returnEnvelope(): Promise<EnvelopeData> {
  'use server'
  await Promise.resolve()
  return respond({ message: 'Returned envelope' }, { status: 202 })
}
