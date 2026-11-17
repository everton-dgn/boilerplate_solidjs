# SEO and site indexes

[Back to the README](../README.md)

## Route metadata

`VITE_SITE_URL` in `.env` is required and sets the public URL of the site,
validated in `env.ts`. `createSeo({ route: true })`, called once in the root
callback of the `Router` in `App.tsx`, uses `useHead` from `@solidjs/web` to
publish `canonical`, `og:url`, `og:type`, the absolute social image (Open Graph
and Twitter, with dimensions and alternative text) and a
`<script type="application/ld+json">` for the current route, client navigation
included. The social tags that do not vary per route (`og:locale`,
`og:site_name`, `twitter:card`, `twitter:site` and `twitter:creator`) also come
from `createSeo`, to follow the `noindex` rule below; `Document.tsx` keeps only
`author` and a `<title>` with `SITE.title`. That title is the exception: the
runtime replaces, in place, the first `<title>` of the shell with the one that
`createSeo` publishes with `useHead`, and the document goes out with a single
`<title>`, checked in the SEO E2E tests. Do not repeat in `Document.tsx` another
tag that `createSeo` publishes, because the crawler reads the first occurrence.

Each page keeps its metadata in `seo.ts`, next to `index.tsx`, and imports the
`seo` object into `route.info.seo`. The contract accepts `title`, `description`,
`noindex`, `type`, `image` and `article`. This does not change its rendering
strategy or make the page static: they are metadata, also available on routes
with parameters. In the call with `route: true`, `createSeo` reads the chain of
active routes with `useRouteMatches` and publishes those fields in the title,
the description, Open Graph, Twitter and the JSON-LD using `useHead`. The child
route overrides the fields it declares and inherits the others from the layout;
`image` is merged attribute by attribute (`path`, `width`, `height`, `alt`).
When changing `path`, also declare the `width` and `height` of the new file:
omitted dimensions are inherited from the previous image and published in
`og:image:width` and `og:image:height`, and the preview on social networks may
come out cropped. Without a definition in the chain, the title, description and
image come from `SITE`, `type` is `website` and `noindex` is `false`. The home
page declares its own title that identifies the boilerplate and its use for web
applications with SSR. An indexable page publishes `robots` with
`index, follow, max-image-preview:large`: the first two are already the crawler
default, and the third allows the large image preview in Google Discover. A
choice of the project: with `noindex: true`, the route call publishes only
`robots: noindex`, the title and the description. Canonical, Open Graph, Twitter
(`og:locale`, `og:site_name` and `twitter:card` included) and JSON-LD stay out,
the 404 page included. In this boilerplate those metadata only have a consumer
on indexable pages; the canonical of the 404 pointed to the nonexistent URL that
was typed, and the JSON-LD declared a `WebPage` on it. A child can override
`noindex` with `false` explicitly. Known limit: a `noindex` page made for
sharing (an invitation, a result, a campaign) is not supported yet and no longer
provides explicit metadata for the social preview. When that case comes up, add
a field in `route.info.seo` that returns Open Graph and Twitter without the
canonical or the JSON-LD.

For example, a page can declare its metadata in `seo.ts`:

```ts
import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'

export const seo = {
  get title() {
    return m.about_title()
  },
  get description() {
    return m.about_description()
  }
} satisfies SeoRouteInfo
```

In `index.tsx`, import `seo` and use `info: { seo }` in the route definition,
together with the other controls the page declares. Getters keep the locale of
the request; do not copy the translated texts into values at the top of the
module. The catalogs are in `i18n/{pt,en,es}.json` next to those files. The data
that the component renders stays in `index.tsx`, in a non-exported constant with
getters (the pages that use `SiteArticle` type it with `satisfies SitePage`), or
in calls to `m` in the JSX itself. The route manifest imports the `route` of
each page in the initial bundle, and everything that `seo.ts` imports goes with
it. That is why the `seo` getters call the messages directly, without reading
the page object, and the body stays only in the route module, downloaded on
navigation. A page that still exports `content` from `seo.ts` should move it to
`index.tsx` and replace the reads of `seo` with the messages. The
`project/seo-module` lint rule reports a `seo.ts` that exports something other
than `seo` or that imports a local module as a value, through a relative path,
through an alias of the `src/routes` tree, through `import()` or through
`import.meta.glob`, and the production i18n test checks that each body stays
only in the route module. It is UI data: the Markdown does not read it, because
it comes from the rendered HTML.

`type` accepts `website` and `article`. It sets `og:type` and the page node in
the JSON-LD: `WebPage` by default, or `Article` with `headline`, `author` (a
`Person` node with the name, URL and profiles of `SITE.author`, the profiles in
`sameAs`), `publisher` and, when the route declares
`article: { datePublished, dateModified }` in ISO 8601, those dates in the node
and in the `article:published_time` and `article:modified_time` metas. Outside
`article`, the dates are ignored. The JSON-LD, built by the local
`buildStructuredData` helper of `createSeo`, always publishes a `WebSite` node,
the page node with the canonical URL, description, locale and image, and an
`Organization` node with the name, description, URL, logo (`SITE.logo`, at least
112x112 pixels) and official profiles (`SITE.socialLinks`, in `sameAs`).
`WebSite.publisher` and `Article.publisher` point to that node through the `@id`
`<VITE_SITE_URL>/#organization`. The graph is typed with `schema-dts`, so an
invalid property fails the type check; the image dimensions stay only in Open
Graph. The locale of the page comes from `SITE.locale`, which also feeds the
`lang` of `Document.tsx` and `og:locale` (with an underscore).
`og:locale:alternate` lists the other locales, and `WebSite.inLanguage` declares
the three available locales. The graph and the page's own data use
`JSON.stringify` and reach `useHead` with `type: 'application/ld+json'`. Solid
escapes `<` in the server HTML and in the head updates of the streaming; on the
client, it inserts the content as text. This contract depends on the JSON type
and on the use of `useHead`: do not interpolate the JSON directly into HTML. The
`createSeo` and `StructuredData` regression tests check the first chunk before
the data resolves, malicious content kept as JSON, and the absence of injected
elements or code execution in the browser, before and after hydration. The
Twitter handles come from `SITE.twitter` (`twitter:site`, the account of the
site) and from `SITE.author.twitter` (`twitter:creator`, the account of the
author). LinkedIn has no meta tag of its own: it reads Open Graph for the
preview, and the profile goes only into `sameAs`. Indexable pages publish
`hreflang` for the three locales and `x-default` pointing to English. The
canonical and the page URL in the JSON-LD include the locale; the identity of
the organization stays at the site root. The error fallback publishes a
translated title and description with `noindex`, even when the failure happens
before the Router.

## Structured data per page

That base graph is fixed on purpose. Types that depend on the page (`Product`,
`FAQPage`, `BreadcrumbList`, `Event`) come in through the
`createSeo({ structuredData: () => data })` primitive, called in the body of the
route component. It publishes a second `<script type="application/ld+json">`
with `@context`. The data can be a node or a list (it becomes `@graph`) and is
typed with `schema-dts`, the schema.org types maintained by Google, so an
invalid property fails the type check. The primitive follows the changes of the
accessor, removes the script when its scope is disposed and coexists with other
instances on the same page. Returning `undefined` suspends the publication; when
the accessor provides data again, the script comes back. To link the node to the
base graph, use the `@id` of the page (the canonical URL), of the site
(`<VITE_SITE_URL>/#website`) or of the organization
(`<VITE_SITE_URL>/#organization`). The call with `structuredData` does not read
the router or `noindex`: a route outside the index that uses it publishes the
JSON-LD anyway. The two call forms are exclusive in the types: use `route: true`
once in the App and `structuredData` in each component that needs to publish its
own data. The page calls do not register the global SEO.

```tsx
import { createSeo } from '@/primitives/createSeo/index.ts'

export default function FaqPage() {
  createSeo({
    structuredData: () => ({
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is the boilerplate?',
          acceptedAnswer: { '@type': 'Answer', text: 'A SolidJS base.' }
        }
      ]
    })
  })

  return (
    <main>
      <h1>Frequently asked questions</h1>
    </main>
  )
}
```

An `article` page, with its own image and a section in `llms.txt`, declares the
type and the image in `seo.ts`, with the alternative text in a getter too:

```ts
import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'

export const seo = {
  get title() {
    return m.team_title()
  },
  get description() {
    return m.team_description()
  },
  type: 'article',
  image: {
    path: '/images/team.png',
    width: 1200,
    height: 800,
    get alt() {
      return m.team_imageAlt()
    }
  }
} satisfies SeoRouteInfo
```

The route imports that object and declares the section next to it:

```tsx
import type { RouteDefinition } from '@solidjs/router'

import { seo } from './seo.ts'

export const route = {
  info: { seo, llms: { section: 'Company' } }
} satisfies RouteDefinition
```

## Selection for llms.txt

See [selection for llms.txt](seo/indexes.md#selection-for-llmstxt).

## Sitemap and dynamic routes

See [sitemap and dynamic routes](seo/sitemap.md#sitemap-and-dynamic-routes).

### Static artifacts and origin capacity

See
[static artifacts and origin capacity](seo/publication.md#static-artifacts-and-origin-capacity).

### Partitioned sources

See [partitioned sources](seo/sitemap.md#partitioned-sources).

### Capacity and measurement

See [capacity and measurement](seo/publication.md#capacity-and-measurement).

## Endpoints and cache

See [endpoints and cache](seo/indexes.md#endpoints-and-cache).

## Reading by agents

See [reading by agents](seo/markdown.md#reading-by-agents).

### llms-full.txt aggregate

See [llms-full.txt aggregate](seo/markdown.md#llms-fulltxt-aggregate).

### Platform artifacts and routing

See
[platform artifacts and routing](seo/markdown.md#platform-artifacts-and-routing).
