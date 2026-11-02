import { monitorEventLoopDelay } from 'node:perf_hooks'
import { memoryUsage, resourceUsage } from 'node:process'

import { getPublicationMetrics } from '@/infra/server/publication/index.ts'
import type { PublicationMetrics } from '@/infra/server/publication/types.ts'

type ProbeMetrics = {
  publication: PublicationMetrics
  eventLoopSamples: number
  eventLoopMaxMs: number
  eventLoopMeanMs: number
  memory: ReturnType<typeof memoryUsage>
  maxRssBytes: number
}

const NANOSECONDS_PER_MILLISECOND = 1_000_000
const BYTES_PER_KIBIBYTE = 1024
// O roteador empacota cada método HTTP em um módulo distinto. O monitor precisa
// deste módulo compartilhado para GET observar o mesmo estado iniciado por POST.
const histogram = monitorEventLoopDelay({ resolution: 10 })

export function readMetrics(): ProbeMetrics {
  return {
    publication: getPublicationMetrics(),
    eventLoopSamples: histogram.count,
    eventLoopMaxMs: histogram.max / NANOSECONDS_PER_MILLISECOND,
    eventLoopMeanMs: Number.isFinite(histogram.mean)
      ? histogram.mean / NANOSECONDS_PER_MILLISECOND
      : 0,
    memory: memoryUsage(),
    maxRssBytes: resourceUsage().maxRSS * BYTES_PER_KIBIBYTE
  }
}

export function startMonitor(): void {
  histogram.reset()
  histogram.enable()
}

export function stopMonitor(): void {
  histogram.disable()
}
