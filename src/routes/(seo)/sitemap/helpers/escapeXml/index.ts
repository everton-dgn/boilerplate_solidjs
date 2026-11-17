// Hierarchical paths come out of URL.href percent-encoded, but opaque paths
// (data:, mailto:) keep <, > and ", so the XML escapes all five.
export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
