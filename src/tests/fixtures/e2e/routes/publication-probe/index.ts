import { readMetrics, startMonitor, stopMonitor } from './metrics.ts'

export function GET(): Response {
  return Response.json(readMetrics(), {
    headers: { 'cache-control': 'no-store' }
  })
}

export function POST(): Response {
  startMonitor()
  return new Response(null, { status: 204 })
}

export function DELETE(): Response {
  stopMonitor()
  return new Response(null, { status: 204 })
}
