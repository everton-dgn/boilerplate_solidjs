import { useHead } from '@solidjs/web'
import type { Graph, Thing, WithContext } from 'schema-dts'
import { createUniqueId } from 'solid-js'

import { serializeJsonLd } from '@/helpers/serializeJsonLd/index.ts'

// `Thing` inclui enumerações como strings; aqui só entram nós de objeto.
type SchemaNode = Exclude<Thing, string>

type StructuredDataProps = {
  // Nó ou lista de nós schema.org da página; o `@context` é acrescentado aqui.
  data: SchemaNode | SchemaNode[]
}

function withContext(
  data: SchemaNode | SchemaNode[]
): WithContext<SchemaNode> | Graph {
  return Array.isArray(data)
    ? { '@context': 'https://schema.org', '@graph': data }
    : { '@context': 'https://schema.org', ...data }
}

// JSON-LD próprio da página, em um `<script>` separado do grafo base que o
// `SeoHead` publica. Cada instância tem chave própria, então várias coexistem
// e cada uma some ao desmontar. A página decide o que publica, inclusive em
// rota `noindex`.
export function StructuredData(props: StructuredDataProps) {
  const id = createUniqueId()

  useHead(() => ({
    tag: 'script',
    key: `structured-data:${id}`,
    props: {
      type: 'application/ld+json',
      children: serializeJsonLd(withContext(props.data))
    }
  }))

  return null
}
