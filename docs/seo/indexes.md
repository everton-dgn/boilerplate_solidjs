# Editorial indexes, endpoints and cache

[Back to the main guide](../seo.md)

## Selection for llms.txt

`llms.txt` collects the same metadata from the manifest, without rendering pages
or running preloads, and publishes only the pages that declare
`route.info.llms`. The file is a curated index for language models. The format
sets no size limit. This project publishes the index as a file in the build and
applies an operating budget of 1 MiB in
`tooling/markdownPrerender/constants.ts`. Going over it stops the build, without
truncating the content. On large sites, measure the real texts, select the pages
that explain the product and group them. `llms: true` includes the page; without
an inherited section, it goes to the default `Pages` section.
`{ section: 'Guides' }` creates or reuses a section with that name, in the order
in which it appears in the manifest; `{ optional: true }` moves the page to the
`Optional` section, which the format reserves for content the model may skip,
and a section declared with that name merges into it. The setting is inherited
along the route chain: a layout with `llms: { section: 'Docs' }` includes its
children in that section, a child can leave with `llms: false` or override only
the field it declares, and `llms: true` in a child turns the inclusion back on,
keeping the inherited section and optional mark. `noindex: true` excludes the
page from the sitemap and from llms.txt, even with the flag. The filter looks at
the effective setting of the page, including inheritance and the child index
route. The resolver is colocated in
`src/routes/(seo)/llms.txt/helpers/resolveRouteLlms/`. The index is in the base
locale. Routes with a parameter stay out even with `llms`, and the sources of
`route.info.sitemap` do not feed this index. Markdown publication is controlled
separately by `route.info.markdown`; when the leaf declares `markdown: true` or
`'dynamic'`, the index link points to the `.md` (`/en/about.md`), and for the
others, to the HTML.

## Endpoints and cache

`sitemap.xml/`, `robots.txt/` and `llms.txt/` are API routes (`index.ts`): the
sitemap lists the static pages of the route manifest, without the 404 fallback
and without `noindex`, with `<lastmod>` on the `article` pages (the same date as
the JSON-LD, `dateModified` or `datePublished`), plus the entries of the
`route.info.sitemap` sources, and llms.txt publishes, in Markdown, the notes in
`llms.txt/constants.ts` (facts the agent needs to know before opening the links:
locale, what the site offers, what does not exist) and then the title and
description of the pages selected by `route.info.llms`, grouped by section. The
use cases of `LLMS_USE_CASES` open the `When to use` section, with links and
descriptions that guide the reading of the home page and of the page about the
project. Rewrite the notes and the use cases in each derived project.
`Document.tsx` announces this file on every page with
`<link rel="describedby" href="/llms.txt">`, the discovery that the llms.txt
spec recommends; agents are not redirected. robots publishes the groups of
`robots.txt/constants.ts`: `*` with `Allow: /` and a `Disallow` of the server
function endpoint (`/_server` by default, read from the plugin's
`virtual:solid-server-function-handler`), AI training robots with `Disallow: /`,
and the link to the sitemap. Search engines and agents that read pages at the
user's request stay allowed, because they are the audience of llms.txt.
`Disallow` is a request that badly behaved robots ignore, and it does not remove
a URL from the index; for that, use `noindex` in `route.info.seo`. In production
the process keeps the robots response in memory. llms.txt and the static parts
of the sitemap are build files, and the dynamic sitemap reuses the manifest. The
dynamic sources are read per endpoint: the index lists the parts, and each part
reads its own batch. llms.txt is built inside the Paraglide context of the base
locale (the runtime `baseLocale`), the site description and the page metadata
included, so that the context of another locale does not change the text. The
note about the locale of the index derives from the same `baseLocale`, with the
locale name in English, the language of the notes. The list of locales in the
same note comes from `locales`, with the base locale first, the English name and
the path of each locale: it follows `project.inlang/settings.json` without
manual edits. Successful responses of robots and of the dynamic sitemap go out
with `public, max-age=0, s-maxage=3600, stale-if-error=86400` in production (the
CDN reuses them for one hour; Vercel only caches a function response with
`s-maxage` and consumes `s-maxage` and `stale-if-error` without passing them to
the browser) and with `no-store` in development. With `stale-if-error`, a
function error after the copy expires can reuse an earlier copy, according to
the hosting contract. The static files use the cache policy of the platform;
they do not get the CSP or the cache of the middleware. The absolute URLs of the
three files start from the origin of `VITE_SITE_URL`; a site served under a
subpath is not supported by this generation. The 404 page declares
`robots: noindex`. The social image is `public/images/og.png`, with an immutable
one-year cache set in the `publicAssets` of `/images/` in `vite.config.ts`.
Because that cache does not revalidate, publish a new image under another name
(for example, `og-2026-10.png`) and update `SITE.image.path`: overwriting
`og.png` leaves browsers and intermediate caches with the old version for up to
a year. The JSON-LD logo reuses `public/favicon/apple-touch-icon.png`.
