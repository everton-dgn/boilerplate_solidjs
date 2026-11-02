import type { PublicationLimits } from './types.ts'

// Four process-local slots cap overlap; two per class leave room for both
// workloads. The 16 MiB reservation is an initial output budget, to calibrate
// against the serial HTTP pilot and actual backend capacity.
const DEFAULT_RESERVED_BYTES = 16_777_216

export const DEFAULT_LIMITS: PublicationLimits = {
  total: 4,
  sitemap: 2,
  markdown: 2,
  sources: 4,
  perSource: 2,
  outputs: 4,
  reservedBytes: DEFAULT_RESERVED_BYTES
}
