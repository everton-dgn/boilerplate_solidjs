const ESCAPES: Record<string, string> = {
  '<': String.raw`\u003c`,
  '>': String.raw`\u003e`,
  '&': String.raw`\u0026`
}

// Serializa JSON-LD para dentro de `<script>`: `<`, `>` e `&` viram sequências
// JSON, então o texto não encerra a tag nem é lido como HTML.
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replaceAll(
    /[<>&]/gu,
    char => ESCAPES[char] ?? char
  )
}
