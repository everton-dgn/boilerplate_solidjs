import type { MarkdownSource } from '@/@types/markdown.ts'

import { content } from './content.ts'

export const markdown = { render: () => content } satisfies MarkdownSource
