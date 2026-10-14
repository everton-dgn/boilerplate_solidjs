import * as v from 'valibot'

import type { SitePage } from '../../../src/@types/site-page.ts'

const MIN_PRINTABLE_CODE = 32

function hasAllowedCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < MIN_PRINTABLE_CODE && character !== '\n' && character !== '\t') {
      return false
    }
  }
  return true
}

const text = v.pipe(
  v.string(),
  v.minLength(1),
  v.check(hasAllowedCharacters, 'Markdown text contains control characters')
)
const line = v.pipe(
  text,
  v.check(value => !value.includes('\n'), 'Expected a single line')
)
const href = v.pipe(
  v.string(),
  v.check(value => {
    if (/[\s<>\\]/u.test(value) || value.startsWith('//')) return false
    if (!value.startsWith('/') && !/^(?:https?:|mailto:)/u.test(value)) {
      return false
    }
    try {
      const url = new URL(value, 'https://markdown.invalid')
      return (
        ['https:', 'http:', 'mailto:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      )
    } catch {
      return false
    }
  }, 'Markdown links must use a public HTTP(S), mailto or site-relative URL')
)
const sectionSchema = v.object({ title: line, paragraphs: v.array(text) })
const pageSchema = v.object({
  title: line,
  description: line,
  intro: text,
  sections: v.array(sectionSchema),
  links: v.array(v.object({ label: line, href }))
})

function escapeText(value: string): string {
  return value
    .normalize('NFC')
    .replaceAll(/[\\`*_{}[\]<>()#+.!|~=-]/gu, String.raw`\$&`)
}

export function renderMarkdown(input: SitePage): string {
  const page = v.parse(pageSchema, input)
  return `${[
    `# ${escapeText(page.title)}`,
    escapeText(page.description),
    escapeText(page.intro),
    ...page.sections.flatMap(section => [
      `## ${escapeText(section.title)}`,
      ...section.paragraphs.map(escapeText)
    ]),
    ...page.links.map(link => `- [${escapeText(link.label)}](<${link.href}>)`)
  ].join('\n\n')}\n`
}
