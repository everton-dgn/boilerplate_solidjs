import type { MarkdownSource } from '@/@types/markdown.ts'

import { readContent } from './readContent/index.ts'

export const markdown = { render: readContent } satisfies MarkdownSource
