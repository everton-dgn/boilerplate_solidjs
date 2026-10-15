export const MARKDOWN_LIMITS = {
  files: 10_000,
  pageBytes: 1_048_576,
  totalBytes: 52_428_800,
  sourceTimeoutMs: 30_000
}

export const MARKDOWN_HEADERS = {
  'content-type': 'text/markdown; charset=utf-8',
  vary: 'Accept',
  'cache-control': 'public, max-age=0, must-revalidate',
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin'
}
