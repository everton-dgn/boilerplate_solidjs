import type { APIEvent } from 'filesystem-routing/api'

import { setPartRemoved } from '../sitemapSources/state.ts'

export function POST({ request }: APIEvent): Response {
  const removed = new URL(request.url).searchParams.get('removed')
  if (removed !== '0' && removed !== '1') {
    return new Response(null, { status: 400 })
  }
  setPartRemoved(removed === '1')
  return new Response(null, { status: 204 })
}
