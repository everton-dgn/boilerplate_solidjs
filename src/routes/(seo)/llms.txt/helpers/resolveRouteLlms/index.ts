import type { LlmsRouteInfo } from '@/@types/llms.ts'

import type { LlmsSelection } from '../../types.ts'

type ResolveRouteLlmsOptions = {
  parent?: LlmsSelection
  info?: LlmsRouteInfo
}

const DEFAULT_SELECTION: LlmsSelection = {
  shouldInclude: false,
  section: 'Pages',
  isOptional: false
}

export function resolveRouteLlms({
  parent = DEFAULT_SELECTION,
  info
}: ResolveRouteLlmsOptions): LlmsSelection {
  if (info === undefined) return { ...parent }
  if (typeof info === 'boolean') return { ...parent, shouldInclude: info }
  return {
    shouldInclude: true,
    section: info.section ?? parent.section,
    isOptional: info.optional ?? parent.isOptional
  }
}
