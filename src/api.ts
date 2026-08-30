import { getRequestEvent } from '@solidjs/web'

export async function getServerInfo(): Promise<string> {
  'use server'
  const event = getRequestEvent()
  const requestId = event?.locals.requestId ?? 'sem id'
  return `Node ${process.version} · request ${requestId}`
}
