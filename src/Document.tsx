import { HydrationScript } from '@solidjs/web'
import type { ParentProps } from 'solid-js'

import interMedium from './assets/fonts/inter-latin-ext-500-normal.woff2?url&no-inline'

export default function Document(props: ParentProps) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="preload"
          href={interMedium}
          as="font"
          type="font/woff2"
          crossorigin="anonymous"
        />
        <link rel="icon" href="/favicon/favicon.ico" sizes="16x16 32x32" />
        <link
          rel="icon"
          href="/favicon/favicon.svg"
          type="image/svg+xml"
          sizes="any"
        />
        <link
          rel="apple-touch-icon"
          href="/favicon/apple-touch-icon.png"
          sizes="180x180"
        />
        <title>Solid App</title>
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  )
}
