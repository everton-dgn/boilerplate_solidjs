import * as v from 'valibot'

const NodeSchema = v.record(v.string(), v.unknown())
const StructuredDataSchema = v.object({
  '@context': v.string(),
  '@graph': v.array(NodeSchema)
})

export type StructuredData = v.InferOutput<typeof StructuredDataSchema>

// Reads the JSON-LD published in `<script type="application/ld+json">` and only
// guarantees the structure of the graph; each test checks the nodes it cares about.
export function parseStructuredData(json: string | null): StructuredData {
  return v.parse(StructuredDataSchema, JSON.parse(json ?? 'null'))
}
