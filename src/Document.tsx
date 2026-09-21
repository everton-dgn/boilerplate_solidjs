import { getRequestEvent, HydrationScript, isServer } from '@solidjs/web'
import type { ParentProps } from 'solid-js'

import { SITE } from '@/constants/site.ts'
import {
  DARK_MEDIA_QUERY,
  DEFAULT_THEME,
  THEME_COLORS
} from '@/constants/theme.ts'
import { applyTheme } from '@/infra/adapters/applyTheme/index.ts'
import { readTheme } from '@/infra/adapters/themeStorage/index.ts'

import interMedium from './assets/fonts/inter-latin-ext-500-normal.woff2?url&no-inline'
import interSemiBold from './assets/fonts/inter-latin-ext-600-normal.woff2?url&no-inline'
import interBold from './assets/fonts/inter-latin-ext-700-normal.woff2?url&no-inline'

export default function Document(props: ParentProps) {
  const cookieHeader = isServer
    ? (getRequestEvent()?.request.headers.get('cookie') ?? null)
    : undefined
  const theme = readTheme(cookieHeader) ?? DEFAULT_THEME
  const explicitTheme = theme === 'system' ? undefined : theme

  return (
    <html
      lang={SITE.locale}
      class={explicitTheme}
      style={explicitTheme ? { 'color-scheme': explicitTheme } : undefined}
    >
      <head>
        <meta charset="utf-8" />
        <title>{SITE.title}</title>
        <meta name="author" content={SITE.author} />
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width"
        />
        <meta
          name="format-detection"
          content="telephone=no,email=no,address=no,date=no,url=no"
        />
        <meta
          name="theme-color"
          content={THEME_COLORS[explicitTheme ?? 'light']}
        />
        <script>
          {`(() => {
            const theme = ${JSON.stringify(theme)};
            const dark = theme === 'dark' || (theme === 'system' && matchMedia(${JSON.stringify(DARK_MEDIA_QUERY)}).matches);
            (${applyTheme.toString()})({ theme: dark ? 'dark' : 'light', color: dark ? ${JSON.stringify(THEME_COLORS.dark)} : ${JSON.stringify(THEME_COLORS.light)} });
          })();`}
        </script>
        <link
          rel="preload"
          href={interMedium}
          as="font"
          type="font/woff2"
          crossorigin="anonymous"
        />
        <link
          rel="preload"
          href={interSemiBold}
          as="font"
          type="font/woff2"
          crossorigin="anonymous"
        />
        <link
          rel="preload"
          href={interBold}
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
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  )
}
