type MediaRange = {
  type: string
  quality: number
  parameterCount: number
}
type MediaPreferenceOptions = { ranges: MediaRange[]; type: string }
type MediaPreference = { quality: number; specificity: number }
type SplitOptions = { value: string; separator: string }

const QUALITY = /^q\s*=\s*(?<quality>0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/iu
const EXACT_SPECIFICITY = 4
const TYPE_SPECIFICITY = 2
const UTF8 = /^charset\s*=\s*(?:utf-8|"utf-8")$/iu
// RFC 7763: a resposta é CommonMark com extensões GFM, então as duas variantes
// são atendidas.
const MARKDOWN_VARIANT =
  /^variant\s*=\s*(?:gfm|commonmark|"(?:gfm|commonmark)")$/iu
const PARAMETERS = [UTF8, MARKDOWN_VARIANT]

// Varredura linear: uma regex com lookahead até o fim da string custava O(n²)
// num Accept longo, enviado por qualquer cliente.
function splitOutsideQuotes({ value, separator }: SplitOptions): string[] {
  const parts: string[] = []
  let start = 0
  let isQuoted = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (isQuoted && character === '\\') {
      index += 1
      continue
    }
    if (character === '"') {
      isQuoted = !isQuoted
      continue
    }
    if (!isQuoted && character === separator) {
      parts.push(value.slice(start, index))
      start = index + 1
    }
  }
  parts.push(value.slice(start))
  return parts
}

function parseRange(value: string): MediaRange[] {
  const [rawType, ...parameters] = splitOutsideQuotes({
    value,
    separator: ';'
  })
  const type = rawType?.trim().toLowerCase() ?? ''
  if (!['text/html', 'text/markdown', 'text/*', '*/*'].includes(type)) {
    return []
  }
  let quality = 1
  let hasQuality = false
  const seen = new Set<RegExp>()
  for (const rawParameter of parameters) {
    const parameter = rawParameter.trim()
    const match = QUALITY.exec(parameter)
    if (match) {
      if (hasQuality) return []
      quality = Number(match.groups?.quality)
      hasQuality = true
      continue
    }
    const accepted = PARAMETERS.find(pattern => pattern.test(parameter))
    if (!accepted || hasQuality || seen.has(accepted)) return []
    if (accepted === MARKDOWN_VARIANT && type !== 'text/markdown') return []
    seen.add(accepted)
  }
  return [{ type, quality, parameterCount: seen.size }]
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
  const ranges = splitOutsideQuotes({ value: accept, separator: ',' }).flatMap(
    range => parseRange(range)
  )
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

export function acceptsMarkdown(accept: string | null): boolean {
  if (accept === null) return true
  return (
    preference({
      ranges: splitOutsideQuotes({ value: accept, separator: ',' }).flatMap(
        range => parseRange(range)
      ),
      type: 'text/markdown'
    }).quality > 0
  )
}
