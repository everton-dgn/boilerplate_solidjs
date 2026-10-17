import { htmlToMarkdown } from '@mdream/js'
import { filterPlugin, isolateMainPlugin } from '@mdream/js/plugins'

import { EXCLUDED_ELEMENTS, MAX_HTML_BYTES } from '../../constants.ts'

type ConvertOptions = { response: Response; url: string; signal: AbortSignal }

export async function convertHtml({
  response,
  url,
  signal
}: ConvertOptions): Promise<string> {
  signal.throwIfAborted()
  const reader = response.body?.getReader()
  if (!reader) return ''
  const cancel = async () => {
    try {
      await reader.cancel()
    } catch {
      /* O stream pode já ter falhado. */
    }
  }
  const onAbort = () => {
    void cancel()
  }
  signal.addEventListener('abort', onAbort, { once: true })
  const decoder = new TextDecoder()
  let html = ''
  let bytes = 0
  try {
    for (
      let chunk = await reader.read();
      !chunk.done;
      chunk = await reader.read()
    ) {
      signal.throwIfAborted()
      const { value } = chunk
      bytes += value.byteLength
      if (bytes > MAX_HTML_BYTES) {
        throw new Error('Markdown document limit exceeded')
      }
      html += decoder.decode(value, { stream: true })
    }
    signal.throwIfAborted()
    html += decoder.decode()
    return htmlToMarkdown(html, {
      origin: url,
      plugins: [
        isolateMainPlugin(),
        filterPlugin({ exclude: EXCLUDED_ELEMENTS })
      ]
    })
  } finally {
    signal.removeEventListener('abort', onAbort)
    await cancel()
    reader.releaseLock()
  }
}
