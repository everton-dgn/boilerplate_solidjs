# Security headers and CSP

[Back to the README](../README.md)

## Content policy

The security headers of the function responses come from the middleware. For
static files, the Nitro `routeRules` set `Strict-Transport-Security`,
`X-Content-Type-Options` and `Cross-Origin-Resource-Policy`, as described in the
[known limits](#known-limits). `securityHeaders` writes on every response of the
chain `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
`Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy` and the
`Content-Security-Policy`. The values are in
[`securityHeaders/constants.ts`](../src/middleware/securityHeaders/constants.ts).
The failure containment writes the same headers on the 500, on the error page
and on the thrown control.

The CSP uses `script-src 'nonce-<value>' 'strict-dynamic'`, without
`'unsafe-inline'` for scripts. The other directives are `default-src 'self'`,
`style-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`
and `frame-ancestors 'none'`. The app uses neither WebAssembly nor `eval`, so
the policy does not include `'wasm-unsafe-eval'`. Only `text/html` responses
carry the nonce; text, XML, JSON and redirects that go through the function go
out with `script-src 'none'`. That way, robots and the dynamic sitemap do not
keep the nonce of a request in the shared cache. llms.txt and a purely static
sitemap go out as build files, without the CSP of the middleware.

`style-src` has no `'unsafe-inline'` either. In the build, styles only arrive
through a same-origin `<link>`, and a `<style>` or a `style` attribute in the
HTML is blocked. That is why `Document` applies the theme of the cookie only
through the `light` or `dark` class of `<html>`, and `color-scheme` comes from
the `.light`/`.dark` rules of [`colors.css`](../src/theme/tokens/colors.css). Do
not use the `style` prop in JSX rendered on the server: the SSR writes the
attribute for any non-null value, and the CSP blocks it. `applyTheme` writes
`color-scheme` directly on `element.style`, through the CSSOM, which the CSP
does not block.

## HSTS

`Strict-Transport-Security` goes out with `max-age=63072000; includeSubDomains`,
without `preload`. That directive does not change the behavior of the browser:
it allows anyone to submit the domain to the
[preload list](https://hstspreload.org/), built into browsers. After the
inclusion, every subdomain, internal ones included, starts requiring valid
HTTPS, and removal takes months. That is why hstspreload.org asks projects that
ship ready-made configuration not to include it by default
([Preloading Should Be Opt-In](https://hstspreload.org/#opt-in)).

Without the list, the browser only learns the policy after the first HTTPS
response. Until then, someone who arrives through an `http://` link makes a
plaintext request, which someone on the same network can intercept to keep the
navigation on HTTP. The list closes that first-visit gap and, as a bonus, avoids
that redirect. Chrome already tries HTTPS first on public sites, but falls back
to HTTP with a warning that the user can ignore; the list does not let it
through. Domains under TLDs that are entirely on the list, such as `.dev` and
`.app`, already have this protection. To join the list, confirm that every
subdomain serves HTTPS, add `preload` to the value in
[`securityHeaders/constants.ts`](../src/middleware/securityHeaders/constants.ts)
and submit the domain on hstspreload.org.

Static files do not go through the middleware, so the `routeRules` write the
same value on them. Without that, Vercel applies its default, `max-age=63072000`
without `includeSubDomains`, and each HSTS response updates the policy stored in
the browser: the JavaScript and the CSS of a page, served after the HTML, would
take away the subdomain coverage that the function response had just declared.

## Nonce and render entries

The nonce has 16 bytes of `crypto.getRandomValues` in base64 and is created for
each request by [`requestNonce`](../src/middleware/securityHeaders/index.ts), on
the first access to `event.nonce`. That field belongs to the native contract of
the Solid plugin. `securityHeaders` fills it before the render, and the
containment also creates it when a failure happens before that middleware, so
that the error page and the CSP match. A nonce provided by the host is kept;
when it separates scripts and styles, the CSP and `Document` use the `script`
field. The path to the scripts is:

- The native handler of the plugin reads `event.nonce` and writes it in the
  script of a redirect decided after the shell.
- [`src/entry-server.tsx`](../src/entry-server.tsx) passes the nonce to
  `renderToStream`, which writes it in the `HydrationScript`, in the data and
  streaming scripts, in the title script and in the `modulepreload` links. It
  also writes it in the `<link rel="stylesheet">` tags, which the `'self'` of
  `style-src` already allows.
- `Document` writes `nonce` in the inline theme script and in the script of the
  client entry, which it renders itself with the literal path
  `/src/entry-client.tsx`. In the build, the plugin handler replaces that path
  with the hashed asset.

Nitro uses the native SSR entry of `@solidjs/vite-plugin`, without a local
replacement. The authored render entries stay because `entry-server.tsx` creates
the render integrity state and completes it through `onCompleteAll`, which the
entry generated by the plugin does not pass to `renderToStream`; without that
completed state, every `.md` answers 500 and the prerender stops the build. The
plugin requires the client and server pair when one of those entries exists, and
`entry-client.tsx` checks the locale and installs the outdated page detection
and the history guard before `hydrate()`, code that could only go to
`start.clientSetup` if both entries were generated. Both use the same `Document`
and `App` tree. With authored entries, the plugin stops generating the
production `DefaultErrorBoundary`, and the `start.productionErrorBoundary`
option has no effect; the root `Errored` of `App` is still responsible for the
error page. An exception in `Document` itself leaves `renderToStream`
synchronously, and the failure containment answers the 500 in text, with the
fixed log.

## Validation and streamed CSS

In development the CSP is not sent: HMR uses inline styles, while the production
policy only allows external stylesheets. The other headers apply. The CSP must
be checked in the build, with `vp run start` or `vp run test:e2e:production`.
Every new script in `Document` needs `nonce={nonce}`.

`lazy()` components with their own CSS can appear in a fragment after the async
data of a `Loading` resolves. The runtime announces the stylesheet with
`data-dfc` and releases the fragment through a listener installed by a script
with a nonce, without inline handlers. The content template comes before the
links, even when the CSS is already cached. The `/fragment-css` fixture checks
the order in the HTML, the rendering with styles and the absence of CSP
violations with the stylesheet new or stored in the browser cache, without
changing the HTML of the application.

## Known limits

- On Vercel, static files (`/assets/`, `/images/`, `/favicon/`, the `.md` files
  under the prefix of each locale, `/llms.txt`, `/llms-full.txt`,
  `/_markdown/static.json` and the sitemaps generated in the build) go out from
  the CDN without going through the function. The Nitro `routeRules` in
  `vite.config.ts` write on them only `Strict-Transport-Security`,
  `X-Content-Type-Options` and `Cross-Origin-Resource-Policy`, with the values
  of `SECURITY_HEADERS`; the `STATIC_FILE_PATHS` list defines the paths. The
  Vercel preset turns those rules into routes of `.vercel/output/config.json`,
  and the Nitro runtime applies the same values to the function responses on
  those paths. `/assets/` and `/images/` are `publicAssets` without fallthrough:
  they get an immutable cache, and a missing file gets the `no-store` 404 of
  Nitro. `vercel.json` keeps only the `Content-Type` of the `.md` files: in a
  route rule, h3 would also overwrite the error responses of the function with
  it. The CSP and the frame policies only take effect on the responses that go
  through the middleware. For the same reason, a file that must not be public
  has to leave `.vercel/output/static`: the middleware cannot block it. The Vite
  manifest and the server function manifest list source code paths. The Solid
  plugin deletes the first one, which it turns on itself, and writes the second
  one in the SSR output, so no `.vite/` reaches the static output; `BuildOutput`
  checks that it is missing. Turning on `build.manifest` outside the `e2e` mode
  would publish the manifest.
- Nitro compiles every `routeRules` entry, the ones the application adds
  included, with the h3 preMerge, with no option to turn it off
  ([nitrojs/nitro#5048](https://github.com/nitrojs/nitro/issues/5048)). Patterns
  that overlap in part, such as `/**.md` next to `/assets/**` or `/pt/blog/**`
  next to `/pt/**.md`, make the compilation fall back to the simple mode, with
  the same result and a warning in development and in each build. That is why
  the `.md` files enter `STATIC_FILE_PATHS` as `/<locale>/**.md`, with the
  locales of `project.inlang/settings.json`. This depends on the `urlPatterns`
  of `project.inlang/paraglide.config.ts` prefixing every locale: an application
  that serves a locale without a prefix needs its own pattern for the `.md`
  files of that locale, or they go out from the CDN without these headers.
  `AgentReadiness` checks the headers of each published `.md`.
- On the Vercel CDN, the routes of `config.json` compare the path still encoded,
  and the static file is found by the decoded path. A percent-encoded spelling
  of a static path, such as `/%70t/index.md` or
  `/%66avicon/apple-touch-icon.png`, gets the file without
  `X-Content-Type-Options` and `Cross-Origin-Resource-Policy`, and with the
  Vercel default HSTS instead of the one of the application. Those files are
  public, and the URLs that the application publishes use the canonical
  spelling.
- `Cross-Origin-Embedder-Policy: require-corp` blocks resources from another
  origin without `Cross-Origin-Resource-Policy` or CORS. When adding external
  fonts, images or scripts, check that the provider sends those headers or
  review the policy.
