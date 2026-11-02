type LlmsLink = { label: string; href: string; summary: string }

type LlmsIndex = { title: string; description: string; links: LlmsLink[] }

// Lê o formato produzido por `buildLlmsText`: rótulos e resumos escapam
// `\`, `[`, `]` e crases, e os destinos codificam parênteses. O build lê este
// módulo sem aliases para montar o llms-full.txt.
const LINK_LINE =
  /^- \[(?<label>(?:\\.|[^\\\]])*)\]\((?<href>[^\s()]+)\)(?:: (?<summary>.*))?$/u
const ESCAPED = /\\(?<character>.)/gu

function unescape(text: string): string {
  return text.replaceAll(ESCAPED, '$<character>')
}

export function readLlmsIndex(text: string): LlmsIndex {
  const lines = text.split('\n')
  const title = lines.find(line => line.startsWith('# '))?.slice('# '.length)
  const description = lines
    .find(line => line.startsWith('> '))
    ?.slice('> '.length)
  if (!title) throw new Error('llms.txt has no title')
  const links = lines.flatMap(line => {
    const groups = LINK_LINE.exec(line)?.groups
    if (!groups?.href) return []
    return [
      {
        label: unescape(groups.label ?? ''),
        href: groups.href,
        summary: unescape(groups.summary ?? '')
      }
    ]
  })
  return { title, description: description ?? '', links }
}
