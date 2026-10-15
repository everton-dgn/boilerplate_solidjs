declare module 'virtual:markdown-manifest' {
  import type { LlmsPage } from '@/@types/llms.ts'

  export const markdownPaths: Readonly<Record<string, string>>
  export const markdownIndex: readonly LlmsPage[]
  export const markdownNotFound: Readonly<Record<string, string>>
}
