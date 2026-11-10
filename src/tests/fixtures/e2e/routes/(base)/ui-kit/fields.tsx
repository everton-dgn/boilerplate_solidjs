import type { RouteDefinition } from '@solidjs/router'

import { Input } from '@/components/atoms/Input/index.tsx'
import { Textarea } from '@/components/atoms/Textarea/index.tsx'

export const route = {
  info: { seo: { noindex: true } }
} satisfies RouteDefinition

export default function UiKitFields() {
  return (
    <main>
      <Input aria-label="Value" value="controlled" />
      <Input aria-label="Default value" defaultValue="default" />
      <Input
        aria-label="Value over default"
        value="controlled"
        defaultValue="default"
      />
      <Input aria-label="Checked" type="checkbox" checked />
      <Input aria-label="Default checked" type="checkbox" defaultChecked />
      <Input
        aria-label="Unchecked over default"
        type="checkbox"
        checked={false}
        defaultChecked
      />
      <Textarea aria-label="Text value" value="controlled" />
      <Textarea aria-label="Text default" defaultValue="default" />
      <Textarea
        aria-label="Text value over default"
        value="controlled"
        defaultValue="default"
      />
    </main>
  )
}
