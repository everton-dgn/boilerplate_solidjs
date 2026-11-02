type PublicationKind = 'sitemap' | 'markdown'
export type SourceOptions<T> = {
  key: object
  run: (signal: AbortSignal) => Promise<T> | T
}
export type PublicationContext = {
  signal: AbortSignal
  readSource: <T>(options: SourceOptions<T>) => Promise<T>
}
export type PublicationOptions = {
  kind: PublicationKind
  signal?: AbortSignal
  method?: string
  timeoutMs: number
  maxOutputBytes: number
  run: (context: PublicationContext) => Promise<Response> | Response
}
export type PublicationLimits = {
  total: number
  sitemap: number
  markdown: number
  sources: number
  perSource: number
  outputs: number
  reservedBytes: number
}
export type PublicationMetrics = {
  active: number
  sitemap: number
  markdown: number
  sources: number
  outputs: number
  reservedBytes: number
  rejected: number
  aborted: number
  timedOut: number
}
