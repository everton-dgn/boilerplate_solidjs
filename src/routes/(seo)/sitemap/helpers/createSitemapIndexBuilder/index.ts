import { SITEMAP_LOC_LIMIT, SITEMAP_URL_LIMIT } from '../../constants.ts'

type IndexBuilder = {
  add: (location: string) => void
  finish: () => string
  count: () => number
}
const START =
  '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
const END = '</sitemapindex>\n'
const encoder = new TextEncoder()

export function createSitemapIndexBuilder(byteBudget: number): IndexBuilder {
  const chunks = [START]
  let bytes = encoder.encode(START).byteLength + encoder.encode(END).byteLength
  let count = 0
  if (bytes > byteBudget) throw new Error('Índice excede limite de bytes')
  return {
    add(location) {
      if (count >= SITEMAP_URL_LIMIT || location.length > SITEMAP_LOC_LIMIT) {
        throw new Error('Índice excede limite')
      }
      const chunk = `  <sitemap><loc>${location.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')}</loc></sitemap>\n`
      const nextBytes = bytes + encoder.encode(chunk).byteLength
      if (nextBytes > byteBudget) {
        throw new Error('Índice excede limite de bytes')
      }
      bytes = nextBytes
      count += 1
      chunks.push(chunk)
    },
    finish() {
      return [...chunks, END].join('')
    },
    count() {
      return count
    }
  }
}
