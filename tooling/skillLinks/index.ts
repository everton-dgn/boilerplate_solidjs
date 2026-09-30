import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

type Diagnostic = {
  file: string
  line: number
  message: string
}

type MarkdownLink = {
  target: string
  line: number
}

type ProseLine = {
  text: string
  line: number
}

type CheckOptions = {
  directory: string
  root: string
}

// Mesma regra do github-slugger: remove tudo que não for letra, marca,
// número, conector (como `_`), hífen ou espaço, e troca cada espaço por hífen.
const SLUG_REMOVED = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu
const FENCE = /^ {0,3}(?<marker>`{3,}|~{3,})/u
const ATX_HEADING = /^ {0,3}#{1,6}(?:[ \t]+(?<text>.*?))?(?:[ \t]+#+)?[ \t]*$/u
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/u
// Linhas que não continuam um parágrafo: em branco, citação, item de lista ou
// quebra temática com `*` ou `_` (a de `-` já cai em SETEXT_UNDERLINE).
const PARAGRAPH_BREAK =
  /^(?:[ \t]*$| {0,3}(?:>|[-+*](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|(?:\*[ \t]*){3,}$|(?:_[ \t]*){3,}$))/u
const HTML_ANCHOR = /<a\s[^>]*?\b(?:id|name)\s*=\s*["'](?<id>[^"']+)["']/giu
const INLINE_LINK =
  /!?\[(?:[^\]\\]|\\.)*\]\(\s*(?:<(?<angle>[^>]*)>|(?<bare>(?:\\.|[^\s()\\]|\((?:\\.|[^\s()\\])*\))+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu
const REFERENCE_DEFINITION =
  /^ {0,3}\[[^\]]+\]:\s*(?:<(?<angle>[^>]*)>|(?<bare>\S+))/u
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu
const LINK_PARTS = /^(?<path>[^#]*)(?:#(?<fragment>.*))?$/su
const BACKSLASH_ESCAPE = /\\(?<char>[!-/:-@[-`{-~])/gu

function githubSlug(text: string): string {
  return text.toLowerCase().replace(SLUG_REMOVED, '').replaceAll(' ', '-')
}

// Converte o texto bruto do heading no texto renderizado que o GitHub usa
// para o slug: código inline, links, imagens, HTML e ênfase viram texto puro.
function headingText(raw: string): string {
  return raw
    .replaceAll(/(?<ticks>`+)(?<code>.*?)\k<ticks>/gu, '$<code>')
    .replaceAll(/!?\[(?<label>[^\]]*)\]\([^)]*\)/gu, '$<label>')
    .replaceAll(/<[^>]+>/gu, '')
    .replaceAll(
      /(?<![\p{L}\p{N}])_{1,2}(?<inner>\S(?:.*?\S)?)_{1,2}(?![\p{L}\p{N}])/gu,
      '$<inner>'
    )
    .trim()
}

// Linhas fora de frontmatter e blocos cercados, com o número original.
function proseLines(markdown: string): ProseLine[] {
  const lines = markdown.split(/\r?\n/u)
  const result: ProseLine[] = []
  let start = 0
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) start = end + 1
  }
  let fence: string | undefined
  for (let index = start; index < lines.length; index += 1) {
    const text = lines[index] ?? ''
    const marker = FENCE.exec(text)?.groups?.marker
    if (fence) {
      if (
        marker &&
        marker.startsWith(fence.charAt(0)) &&
        marker.length >= fence.length &&
        text.trim() === marker
      ) {
        fence = undefined
      }
      continue
    }
    if (marker) {
      fence = marker
      continue
    }
    result.push({ text, line: index + 1 })
  }
  return result
}

function extractAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>()
  // Numeração do github-slugger: o sufixo avança até achar um slug livre,
  // inclusive diante de headings como `A-1`. Âncoras manuais ficam de fora.
  const occurrences = new Map<string, number>()
  const addHeading = (raw: string): void => {
    const base = githubSlug(headingText(raw))
    let slug = base
    while (occurrences.has(slug)) {
      const count = (occurrences.get(base) ?? 0) + 1
      occurrences.set(base, count)
      slug = `${base}-${count}`
    }
    occurrences.set(slug, 0)
    anchors.add(slug)
  }
  // Linhas consecutivas do parágrafo atual, candidatas a heading Setext.
  let paragraph: string[] = []
  let previousLine = 0
  for (const { text, line } of proseLines(markdown)) {
    for (const match of text.matchAll(HTML_ANCHOR)) {
      if (match.groups?.id) anchors.add(match.groups.id.toLowerCase())
    }
    // Blocos cercados somem de proseLines; o salto de linha encerra o parágrafo.
    if (line !== previousLine + 1) paragraph = []
    previousLine = line
    const heading = ATX_HEADING.exec(text)
    if (heading) {
      addHeading(heading.groups?.text ?? '')
      paragraph = []
    } else if (SETEXT_UNDERLINE.test(text)) {
      if (paragraph.length > 0) addHeading(paragraph.join('\n'))
      paragraph = []
    } else if (PARAGRAPH_BREAK.test(text)) {
      paragraph = []
    } else {
      paragraph.push(text.trim())
    }
  }
  return anchors
}

function extractLinks(markdown: string): MarkdownLink[] {
  const links: MarkdownLink[] = []
  for (const { text, line } of proseLines(markdown)) {
    const prose = text.replaceAll(/(?<ticks>`+).*?\k<ticks>/gu, '')
    for (const match of prose.matchAll(INLINE_LINK)) {
      const target = match.groups?.angle ?? match.groups?.bare
      if (target !== undefined) links.push({ target, line })
    }
    const definition = REFERENCE_DEFINITION.exec(prose)?.groups
    const target = definition?.angle ?? definition?.bare
    if (target !== undefined) links.push({ target, line })
  }
  return links
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

async function listMarkdown(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true
  })
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => path.join(entry.parentPath, entry.name))
    .toSorted()
}

// Valida links relativos e âncoras dos Markdown em `directory`. Links externos
// não são verificados; caminhos iniciados por `/` partem de `root`, como no GitHub.
async function checkMarkdownLinks({
  directory,
  root
}: CheckOptions): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = []
  const anchorCache = new Map<string, Set<string>>()
  const anchorsOf = async (file: string): Promise<Set<string>> => {
    let anchors = anchorCache.get(file)
    if (!anchors) {
      anchors = extractAnchors(await readFile(file, 'utf8'))
      anchorCache.set(file, anchors)
    }
    return anchors
  }

  for (const file of await listMarkdown(directory)) {
    const relativeFile = path.relative(root, file).split(path.sep).join('/')
    const links = extractLinks(await readFile(file, 'utf8'))
    for (const { target, line } of links) {
      if (EXTERNAL.test(target)) continue
      const parts = LINK_PARTS.exec(
        target.replaceAll(BACKSLASH_ESCAPE, '$<char>')
      )?.groups
      const linkPath = decode(parts?.path ?? '')
      const fragment =
        parts?.fragment === undefined ? undefined : decode(parts.fragment)
      let resolved = file
      if (linkPath.startsWith('/')) {
        resolved = path.join(root, linkPath)
      } else if (linkPath) {
        resolved = path.resolve(path.dirname(file), linkPath)
      }
      if (!(await exists(resolved))) {
        diagnostics.push({
          file: relativeFile,
          line,
          message: `link para arquivo inexistente: ${target}`
        })
        continue
      }
      if (!fragment || !resolved.endsWith('.md')) continue
      const anchors = await anchorsOf(resolved)
      if (!anchors.has(fragment.toLowerCase())) {
        diagnostics.push({
          file: relativeFile,
          line,
          message: `âncora inexistente: ${target}`
        })
      }
    }
  }
  return diagnostics
}

export { checkMarkdownLinks, extractAnchors, githubSlug }
