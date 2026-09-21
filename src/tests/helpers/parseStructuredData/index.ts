import * as v from 'valibot'

const NodeSchema = v.record(v.string(), v.unknown())
const StructuredDataSchema = v.object({
  '@context': v.string(),
  '@graph': v.array(NodeSchema)
})

export type StructuredData = v.InferOutput<typeof StructuredDataSchema>

// Lê o JSON-LD publicado em `<script type="application/ld+json">` e garante
// só a estrutura do grafo; cada teste verifica os nós que lhe interessam.
export function parseStructuredData(json: string | null): StructuredData {
  return v.parse(StructuredDataSchema, JSON.parse(json ?? 'null'))
}
