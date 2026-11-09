// Caminhos hierárquicos saem de URL.href percent-encodados, mas caminhos
// opacos (data:, mailto:) preservam <, > e ", então o XML escapa os cinco.
export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
