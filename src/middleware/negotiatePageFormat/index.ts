type MediaRange = {
  type: string
  quality: number
  parameterCount: number
}
type MediaPreferenceOptions = { ranges: MediaRange[]; type: string }
type MediaPreference = { quality: number; specificity: number }

const QUALITY = /^q\s*=\s*(?<quality>0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/iu
const EXACT_SPECIFICITY = 4
const TYPE_SPECIFICITY = 2
const UTF8 = /^charset\s*=\s*(?:utf-8|"utf-8")$/iu
const RANGE_SEPARATOR = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/u
const PARAMETER_SEPARATOR = /;(?=(?:[^"]*"[^"]*")*[^"]*$)/u

function parseRange(value: string): MediaRange[] {
  const [rawType, ...parameters] = value.split(PARAMETER_SEPARATOR)
  const type = rawType?.trim().toLowerCase() ?? ''
  if (!['text/html', 'text/markdown', 'text/*', '*/*'].includes(type)) {
    return []
  }
  let quality = 1
  let hasQuality = false
  let parameterCount = 0
  for (const rawParameter of parameters) {
    const parameter = rawParameter.trim()
    const match = QUALITY.exec(parameter)
    if (match) {
      if (hasQuality) return []
      quality = Number(match.groups?.quality)
      hasQuality = true
      continue
    }
    if (!UTF8.test(parameter) || hasQuality || parameterCount > 0) return []
    parameterCount += 1
  }
  return [{ type, quality, parameterCount }]
}

function preference({ ranges, type }: MediaPreferenceOptions): MediaPreference {
  let result: MediaPreference = { quality: 0, specificity: -1 }
  for (const range of ranges) {
    if (
      range.type !== type &&
      range.type !== 'text/*' &&
      range.type !== '*/*'
    ) {
      continue
    }
    const specificity =
      (range.type === type
        ? EXACT_SPECIFICITY
        : Number(range.type === 'text/*') * TYPE_SPECIFICITY) +
      range.parameterCount
    if (
      specificity > result.specificity ||
      (specificity === result.specificity && range.quality > result.quality)
    ) {
      result = { quality: range.quality, specificity }
    }
  }
  return result
}

export function negotiatePageFormat(
  accept: string | null
): 'html' | 'markdown' | undefined {
  if (accept === null) return 'html'
  const ranges = accept
    .split(RANGE_SEPARATOR)
    .flatMap(range => parseRange(range))
  const html = preference({ ranges, type: 'text/html' })
  const markdown = preference({ ranges, type: 'text/markdown' })
  if (
    markdown.quality > 0 &&
    (markdown.quality > html.quality ||
      (markdown.quality === html.quality &&
        markdown.specificity > html.specificity))
  ) {
    return 'markdown'
  }
  return html.quality > 0 ? 'html' : undefined
}
