# Markdown and reading by agents

[Back to the main guide](../seo.md)

## Reading by agents

The Markdown is derived from the rendered HTML. With `route.info.markdown: true`
on the leaf of the route, the build generates one `.md` file per locale; with
`'dynamic'`, the conversion happens on each request, for pages whose content
depends on it. Routes with a parameter always stay on the request, because the
build does not know their values. The eligibility uses the effective SEO,
inheritance included, and an explicit `noindex: false` in the child. `llms` is
still independent: it decides the inclusion in the index. Login and per-visitor
content must not opt in to the publication. The opt-in only declares that the
content is public and does not control access.

`/pt/index.md` represents the home page and `/pt/about.md` represents the about
page. A page whose last segment is `index` adds `/index.md`: `/pt/index` uses
`/pt/index/index.md`, and `/pt/docs/index` uses `/pt/docs/index/index.md`. This
rule also covers repeated segments: `/pt/index/index` uses
`/pt/index/index/index.md`. The middleware removes the `.md` and a trailing
`/index` and answers 404 to any `.md` URL that is not the canonical form of the
page: `/pt/docs/index.md` is not an alias of `/pt/docs`, and `/pt.md`, without a
locale prefix, follows the redirect of the paths without a locale instead of
publishing the home page. The middleware uses the native matching for parameters
too, without a producer, a required `SitePage`, `getPaths` or an artifact
manifest. The finite enumeration of the sitemap and of llms.txt stays separate;
llms enumerates the known static routes. The SEO alternate follows the current
route in client navigation too.

HTML is the only authored source. Objects used by the components, such as
`SiteArticle`, can stay as UI data; there is no manual serializer and no extra
content exclusive to the Markdown. Translations stay in getters or calls in the
component, in the context of the request locale.

The adapter picks `event.renderMode = 'async'` only for Markdown requests, waits
for the SSR and only converts the HTML when the render integrity state reports a
completion without errors; normal HTML keeps streaming. The state covers errors
seen by the render; it does not vouch for hydration data silently dropped by the
serializer, and the Markdown uses the settled HTML, without that data. The full
contract and the refusal response are in
[server errors](../server-errors/ssr-integrity.md#ssr-integrity-for-markdown).

The build prerender goes through the same adapter. The
`tooling/markdownPrerender/` module asks the middleware for the list of static
pages (`/_markdown/static.json`), prerenders each `.md` and publishes the list
as a static file, together with `llms.txt`. The middleware only builds the list
in the prerender worker, which gets the phase from the process environment and
from the `x-nitro-prerender` header. In production, any client reads the
published file, and the header alone does not rebuild the inventory: it
authenticates nothing. That is why the list can only hold public pages, the same
ones that the build publishes as `.md`; on a redirect, the header only replaces
the response with a public 500. A page that fails or is not written, or a list
that is invalid or does not go through the prerender, stops the build. Nitro
only fails per route with a recorded error; a rejection in the fetch or in the
write would leave the file out without failing, which is why the module checks
at the end that each `.md` of the list was written. The status stays with the
adapter: only a 200 response becomes Markdown, and a redirect in the prerender
becomes a 500, which stops the build. The validation of the written artifact
checks the MIME, the real `fileName`, UTF-8 and the content. A redirect or an
HTML document written as `.md.html` does not satisfy the expected publication. A
short page or a legitimate example of HTML inside the Markdown are still valid;
there is no universal minimum of characters and no ban on isolated tags. The
result is in `.vercel/output/static`.

### llms-full.txt aggregate

The reader of the index is in
`tooling/markdownPrerender/helpers/readLlmsIndex/`, next to the generator that
uses it. Its tests use the Node runner of the tooling.

The build generates `/llms-full.txt` from the approved static Markdown files,
selected through the editorial links of `/llms.txt`, the use cases of
`LLMS_USE_CASES` included. It includes only documents in the base locale and
deduplicates a document referenced in more than one section. The order is
deterministic, and the header declares the locale and the coverage. HTML links
and dynamic content are outside that coverage; the aggregate does not read
arbitrary URLs or freeze the database. URLs with a query stay out too, because
they can represent a different read from the static file. Fragments select the
same document and do not repeat its body.

The full bodies are read and written incrementally, with validation of paths and
symlinks. The publication uses a temporary file promoted only after completion.
The initial budget is 10 MiB, configurable in
`tooling/markdownPrerender/constants.ts`; going over it stops the build without
truncating the content. The file keeps the links of the document and ties
non-empty fragments, such as `#team`, to the source page, so that reading them
together does not turn an anchor of one page into an anchor of another. The
neutral `#` target stays neutral, including when the converter uses it to remove
an unsafe URL.

When no documents are selected, the build leaves out the aggregate and the
announcement. An `llms-full.txt` already in the static output stops the build,
even in that situation, to prevent publishing leftover content. When it exists,
the index announces it without selecting it as an entry of itself. The name is
mutable and does not get an `immutable` cache. There is no second runtime
generator: the development server does not serve this file, even when the index
announces it. Use the build and the preview to check the target. The size of a
static file must not be confused with the response limit of a function.

### Platform artifacts and routing

On Vercel, a static `index.md` can also serve the URL of the folder. After the
Nitro preset generates `config.json`, the module moves its rules ahead of the
filesystem phase, limiting the copies to the pages with an `index.md`, with and
without a trailing slash. Headers with `continue: true`, redirects and earlier
proxies stay in the same order. The rules keep the native targets, captures and
conditions, ISR, `functionRules` and skew protection included. The module does
not define its own SSR target or change `vercel.config`; an artifact without
filesystem rules stops the build. An initial rule without a target or a status
that ends the routing on a protected page also stops the build. The headers of
the Nitro `routeRules` go out with `continue: true` and do not end the routing;
a custom rule in `vercel.config.routes` that reaches those pages needs the same
`continue: true`. The module does not force the continuation, because that would
change the priority of headers and redirects. That way, `/pt` still negotiates
HTML or Markdown, while `/pt/index.md` keeps the static file. The tooling tests
exercise the real preset without a previous configuration and with extra rules.
The production E2E tests check the precedence in the final artifact, after
`vercel build` too.

`@mdream/js` receives the path of the document over the public origin
(`VITE_SITE_URL`) to resolve relative links; in the prerender, the request is
local. Its selectors isolate the main content and remove navigation, controls,
forms, dialogs, `aria-live` regions, ARIA widgets, media fallback content,
scripts, templates, SVG, `aria-hidden="true"` and `data-md-exclude`. The
converter itself drops `hidden`, except `hidden="until-found"`, which is
searchable content. The `convertHtml` plugin replaces with `#` a target that
starts with `javascript:`, `vbscript:` or `data:`, without removing the link:
without it, mdream would emit an inner heading as raw HTML at the start of the
line. With a space or a control character before the scheme, mdream resolves the
value against the public origin. In `details`, `summary`, `dl`, `dt`, `dd` and
`address`, mdream itself emits the link as HTML and drops those targets. The
plugin also drops, like `data-md-exclude`, images without text in `alt` or
`title` when every ancestor is a common container: sections, paragraphs,
headings, lists, tables, quotes, figures, `span` and the `strong`, `b`, `em`,
`i`, `del` and `s` emphases. The emphases depend on the patch described below,
which takes the space out of the delimiter. In links, `mark`, captions and other
elements with their own syntax or HTML, the image stays, because removing it
could empty the link or bring raw HTML to the start of the line. Images do not
use `aria-label` or `aria-labelledby`, which `jsx-a11y/alt-text` accepts; use
`alt=""` only on decorative images. Contextual footers inside main stay.
Computed CSS and content created only in the browser are not interpreted. Use
semantic markup for content that must not appear.

The Bun patch of `@mdream/js` fixes the conversion of spaces and of link names
with those filters. An emphasis whose start was removed, such as an SVG icon,
kept the space inside the delimiter (`** Warning:**`). A link with an
`aria-label` whose only content is removed, such as an icon with
`aria-hidden="true"`, came out without text (`[](/cart)`). The fix also keeps
separators between words in inline wrappers, including before a non-breaking
space; emphasis wrappers and captions keep their delimiters together. Links keep
the visible text inside blocks and use the accessible name after removed icons,
without losing the trailing space or moving out the space between two icons.
Empty headings in list items and lines made only of `===` or `--` after a break
already come out right in the published version, without the patch.

The patch changes only the `dist` of the package. It is the build of the
installed tag with the PRs
[harlan-zw/mdream#385](https://github.com/harlan-zw/mdream/pull/385) (spaces)
and [#390](https://github.com/harlan-zw/mdream/pull/390) (link names) merged.
The two conflict in `parse.ts` and in `tags.ts`. In `parse.ts`, #385 keeps the
leading space inside inline elements, and #390 only recorded the space of a link
when the parser dropped it: the combination records that space in both cases. In
`tags.ts`, both change the comparison of the title with the text of the link:
the combination keeps the one from #385 and drops the `else if (title)` block of
#390. In that combination, one case of the #385 suite differs: an empty link
with a title ending in a space, inside code and followed by a `figcaption`,
loses the space before the caption, which each PR alone keeps. Remove the patch
when a published version covers those behaviors and the `convertHtml` regression
tests pass without it.

A GET with `Accept: text/markdown` gets Markdown directly, without a redirect to
a file. The negotiation respects weights and specificity, with HTML on a tie. An
explicit request for a `.md` only requires Markdown to be acceptable, even when
HTML has a higher weight; an exact exclusion `text/markdown;q=0` wins over
wildcards. Besides the weight, only `charset=utf-8` and, in `text/markdown`, the
`variant` parameter of RFC 7763 with `GFM` or `CommonMark` (variants registered
by RFC 7764) are accepted; another parameter drops the range. The header is read
in a linear scan, so a long `Accept` does not cost quadratic time. No acceptable
format on the published page results in a 406. Query strings stay in the SSR.
HEAD renders the same representation and removes the body. APIs, assets, RPC and
write methods stay out of the negotiation. On a page path without an API handler
for the method, POST, PUT, PATCH, DELETE and OPTIONS get a 405 with
`Allow: GET, HEAD`: without that response, the plugin handler would render the
page with status 200 in the base locale, outside the locale context. API routes
without a handler for the method also get a 405, with the served methods in
`Allow`. The router forms submit to the server function endpoint, which does not
go through that restriction.

The localization keeps URL > cookie > Accept-Language. Safe redirects to an
eligible same-origin page keep the `.md` intent; the middleware does not follow
redirects. Errors do not become success documents. A negotiated HTML 404 keeps
the 404 status, the locale and `noindex`; pages without the opt-in do not
publish their success content through the Markdown alias. Without the opt-in,
`Accept: text/markdown` gets the HTML of the normal render, streamed and outside
the slots and the deadline of the publication; only the 404 of the catch-all
route goes through the conversion. The 404 of a route with a parameter without
the opt-in also goes out as HTML, and a render failure returns the error page in
HTML, the same as with `Accept: text/html`, instead of the public text 500. An
`X-Robots-Tag` with `noindex` or `none` in the page response also refuses the
publication; `max-image-preview: none` only limits the image preview and does
not count.

The responses converted on the request get `text/markdown; charset=utf-8`,
`private, no-store`, a `Vary: Accept` added to the existing Vary and a CSP with
`script-src 'none'`. A successful conversion also adds
`Link: </llms.txt>; rel="describedby"`, keeping the `Link` values received from
the render. GET and HEAD keep the same metadata. The build files are served by
the static layer, without going through the function: `vercel.json` sets the
`Content-Type`, the Nitro `routeRules` set `nosniff` and
`Cross-Origin-Resource-Policy` ([security](../security.md)), and the cache
follows the Vercel default for static files. They write neither a locale cookie
nor `Content-Language`; the locale comes from the URL. The local preview
(`vp run start`) does not apply `vercel.json` and serves `.md` as
`application/octet-stream`.

The build module adds to the Vercel `config.json` a discovery rule for the `.md`
extension and, when it is generated, for `/llms-full.txt`. The rule has
`continue: true` and adds only `Link`, without generating one rule per document.
It can also reach an error answered by the function: the header describes the
site and does not prove that the URL exists, is eligible or succeeded. The
status, `no-store` and `noindex` of the response still apply. The type of the
aggregate is set as an override of the existing file, without changing the MIME
of a 404 when the aggregate was not generated. The Nitro preview does not apply
that configuration; the tests of the Vercel artifact and the local HTTP tests
are separate proofs.

The limits are in `src/middleware/markdownContent/constants.ts`: a total
deadline of 15 seconds, HTML of up to 2 MiB before the synchronous conversion
and Markdown of up to 2 MiB. The read checks each chunk and cancels the reader
when it goes over the limit; `Content-Length` does not replace that count. The
current chunk was already allocated by the producer. The conversion only
publishes after checking the final size. Going over one of the limits or a
converter failure ends the publication with the public 500 in the locale of the
request, `private, no-store` and a `[middleware]` record; the cancellation still
follows the path of the publication. Timeout and disconnection abort the render
signal, but synchronous code and services that ignore `AbortSignal` are not
preempted. The async SSR may have built the whole HTML before the read, and the
conversion keeps intermediate buffers; the limit is not a total memory limit of
the process. The output reserves cover the bodies owned by the application, not
the buffers of the socket, CDN or adapter. The
[HTTP pilot](../testing.md#publication-load) measures those effects on local
Node. The hosting needs its own check.

The about and contact pages use the public data of the repository. The privacy
notice describes the preferences and the limits that can be observed in the
demo. `contactPoint` uses `contato@example.com` and `0000000000` as
placeholders, with `contactType: demo` and a description that says those values
are not contact channels of the maintainer. `address` is a `PostalAddress` with
a sample street, city, state, postal code and country, marked as fictional by
the description. Both objects are in `SITE.organization`, in
`src/constants/site/index.ts`. Replace that data when adapting the boilerplate
to another product, or remove the field to take it out of the JSON-LD. Review
the notice when adding services or data collection.

Validate with `vp run check:ci`, `vp run typecheck:node`, `vp run test:tooling`
and the Node tests of `src/middleware/` and of SEO. Run
`vp run test:e2e:production` to check the real tree and `vp run test:e2e` to
exercise the fixtures and the server failures too. The `AgentReadiness` suites
cover the content of the initial HTML, locales, negotiation, HEAD, 404 and
navigation at phone and desktop widths.

The home page keeps at least 500 characters of visible content in the three
locales, in the initial HTML too. That limit meets the content criterion of Is
Agentic; it is not a guarantee of a search ranking. The text describes the real
features of the project, and the README points to the public demo. According to
the
[Google SEO guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide),
the effect of changes on search depends on crawling and can take time.

After publishing, check the final status, the headers and the body, following
redirects:

```sh
curl -sS -i https://your-domain.example/pt/index.md
curl -sS -L -i -H 'Accept: text/markdown' https://your-domain.example/pt/
curl -sS -L -i -H 'Accept: text/html' https://your-domain.example/
curl -sS -L -i -H 'Accept: text/markdown' https://your-domain.example/missing-page
```

Repeat the read for the localized paths, the support pages, `llms.txt`,
`robots.txt` and `sitemap.xml`. A local validation does not prove the response
of the CDN after the deploy. The ranking of the brand in search also depends on
indexing and external references.

References: [Markdown negotiation](https://acceptmarkdown.com/guides),
[llms.txt format](https://llmstxt.org/) and
[HTTP negotiation in RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.1).
