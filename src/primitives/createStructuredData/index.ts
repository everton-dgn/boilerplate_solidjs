import { useHead } from '@solidjs/web'
import type { Thing } from 'schema-dts'
import { type Accessor, createUniqueId } from 'solid-js'

import { serializeJsonLd } from '@/helpers/serializeJsonLd/index.ts'

// `Thing` inclui enumerações como strings; aqui só entram nós de objeto.
type SchemaNode = Exclude<Thing, string>

type StructuredData = SchemaNode | readonly SchemaNode[]

// `Array.isArray` não estreita listas `readonly`; o guard explícito resolve.
function isNodeList(
  data: SchemaNode | readonly SchemaNode[]
): data is readonly SchemaNode[] {
  return Array.isArray(data)
}

function withContext(data: StructuredData): object {
  if (isNodeList(data)) {
    return { '@context': 'https://schema.org', '@graph': data }
  }
  // Evita distribuir o spread por todos os tipos de schema-dts.
  const node: object = data
  return { '@context': 'https://schema.org', ...node }
}

// JSON-LD próprio da página, em um `<script>` separado do grafo base que o
// `SeoHead` publica. Cada instância tem chave própria, então várias coexistem
// e cada uma some ao descartar seu escopo. O accessor retorna `undefined` para
// suspender a publicação. A página decide o que publica, inclusive em rota `noindex`.
export function createStructuredData(
  data: Accessor<StructuredData | undefined>
): void {
  const id = createUniqueId()

  useHead(() => {
    const nodes = data()
    if (nodes === undefined) return []

    return {
      tag: 'script',
      key: `structured-data:${id}`,
      props: {
        type: 'application/ld+json',
        children: serializeJsonLd(withContext(nodes))
      }
    }
  })
}
