import { respond, type ResponseEnvelope } from '@solidjs/web'

type EnvelopeData = { message: string }

// Envelope devolvido numa chamada direta durante o SSR. O wrapper reconstrói
// a resposta a partir dos dados verificados; o hook não participa.
export async function returnEnvelope(): Promise<
  ResponseEnvelope<EnvelopeData>
> {
  'use server'
  await Promise.resolve()
  return respond({ message: 'Envelope retornado' }, { status: 202 })
}
