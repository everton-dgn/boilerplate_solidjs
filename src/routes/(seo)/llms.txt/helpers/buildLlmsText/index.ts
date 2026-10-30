import type { LlmsPage } from '../../types.ts'

type BuildLlmsTextOptions = {
  title: string
  description: string
  notes?: readonly string[]
  pages: readonly LlmsPage[]
  siteUrl: string
}

type FormatLinkOptions = {
  page: LlmsPage
  siteUrl: string
}

// Nome reservado pelo formato: uma seção comum com esse nome se funde ao
// bucket opcional, que sai sempre por último.
const OPTIONAL_SECTION = 'Optional'

function escapeMarkdownText(text: string): string {
  return text
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .replaceAll(/[\\[\]`]/gu, String.raw`\$&`)
}

// No rótulo, `<...>` ainda poderia virar autolink dentro do link.
function escapeLinkLabel(text: string): string {
  return escapeMarkdownText(text).replaceAll(/[<>]/gu, String.raw`\$&`)
}

function formatLink({ page, siteUrl }: FormatLinkOptions): string {
  const label = escapeLinkLabel(page.title)
  const summary = escapeMarkdownText(page.description)
  const url = new URL(page.path, siteUrl).href
    .replaceAll('(', '%28')
    .replaceAll(')', '%29')
  return `- [${label}](${url})${summary ? `: ${summary}` : ''}`
}

export function buildLlmsText({
  title,
  description,
  notes = [],
  pages,
  siteUrl
}: BuildLlmsTextOptions): string {
  const sections = new Map<string, string[]>()
  const optional: string[] = []
  for (const page of pages) {
    const link = formatLink({ page, siteUrl })
    if (page.isOptional || page.section === OPTIONAL_SECTION) {
      optional.push(link)
      continue
    }
    const links = sections.get(page.section) ?? []
    links.push(link)
    sections.set(page.section, links)
  }

  if (optional.length > 0) sections.set(OPTIONAL_SECTION, optional)

  const lines = [
    `# ${escapeMarkdownText(title)}`,
    '',
    `> ${escapeMarkdownText(description)}`,
    ''
  ]
  const noteLines = notes
    .map(note => escapeMarkdownText(note))
    .filter(note => note !== '')
    .map(note => `- ${note}`)
  if (noteLines.length > 0) lines.push(...noteLines, '')
  for (const [section, links] of sections) {
    lines.push(`## ${escapeMarkdownText(section)}`, '', ...links, '')
  }

  return lines.join('\n')
}
