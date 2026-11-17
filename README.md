# SolidJS + Vite+ Boilerplate

A starting point for projects with SolidJS, TypeScript and server-side rendering
(SSR). It includes file-based routing, server functions, a Nitro server and
automated validation with Vite+.

See the
[SolidJS Boilerplate demo](https://boilerplate-solidjs.devinsights.dev/en) for
the pages, the components and the available languages.

## What comes ready

- SSR with hydration, error pages and protection for backend calls.
- Portuguese, English and Spanish, with English as the base language and
  localized URLs.
- Components with CSS Modules, a light, dark or system theme, and persistence.
- SEO per route, structured data, sitemap, `robots.txt` and `llms.txt`.
- Unit, component and browser tests with Vitest and Playwright.
- Formatting, lint, types, Git hooks and CI with deploys on Vercel.

## Languages

The application is internationalized: every page ships in Portuguese (`pt`),
English (`en`) and Spanish (`es`), with English as the base language. The
locales come from
[`project.inlang/settings.json`](project.inlang/settings.json), and each
component keeps its own `i18n/{pt,en,es}.json` catalogs next to it. The
repository itself, its code, tests and documentation, is written in English. See
[internationalization](docs/i18n.md) for how to add a language or a message.

## Getting started

Install the global [Vite+](https://viteplus.dev/guide/) CLI. The Node and Bun
versions are set in [package.json](package.json) and managed by Vite+.

```bash
git clone git@github.com:everton-dgn/boilerplate_solidjs.git
cd boilerplate_solidjs
vp install
vp run dev
```

Open the address printed in the terminal. The versioned `.env` holds the local
configuration; set `VITE_SITE_URL` to the public URL of the project before you
publish. See [environment, runtimes and deploy](docs/development.md) for the
details.

To run the browser and E2E tests, install Chromium. Run the command again after
updating Playwright, because each version pins a browser revision that can
change with the update:

```bash
vp run test:browser:install
```

## Essential commands

| Command                      | Use                                                                        |
| ---------------------------- | -------------------------------------------------------------------------- |
| `vp run dev`                 | Start the development server                                               |
| `vp run build`               | Build for production                                                       |
| `vp run start`               | Check the build locally                                                    |
| `vp run validate`            | Check format, lint, types, dead code, coverage, tooling, release and build |
| `vp run test:e2e`            | Test the application with the E2E fixtures                                 |
| `vp run test:e2e:production` | Test the real production routes                                            |

Use `vp run dev` and `vp run build` to run the scripts with Bun. Vitest, the
tooling tests and production SSR stay on Node; the release automation tests run
on Bun. Run the two E2E suites one after the other, because they share a port
and build artifacts. The [development reference](docs/development.md#scripts)
has the other scripts and the runtime constraints.

## Documentation

| Guide                                  | Contents                                                    |
| -------------------------------------- | ----------------------------------------------------------- |
| [Development](docs/development.md)     | Environment, scripts, runtimes, cache, CI and deploy        |
| [Architecture](docs/architecture.md)   | Routes, module organization and dependencies between layers |
| [Internationalization](docs/i18n.md)   | Catalogs, generation, navigation and language persistence   |
| [Components and styles](docs/ui.md)    | Fields, dialogs, notifications, theme, CSS and icons        |
| [Security and CSP](docs/security.md)   | Headers, nonce, rendering and the limits of the policy      |
| [Server errors](docs/server-errors.md) | Backend calls, public output and recovery                   |
| [SEO](docs/seo.md)                     | Metadata, structured data and site indexes                  |
| [Testing](docs/testing.md)             | Environments, isolation, E2E and failure diagnosis          |
| [Releases](tooling/release/README.md)  | Versions, tags, changelog and recovering the automation     |

The [conventions for agents](AGENTS.md) live in the project's instructions file.

## Author

[Éverton Toffanetto](https://devinsights.dev) ·
[LinkedIn](https://www.linkedin.com/in/everton-toffanetto) ·
[YouTube](https://youtube.com/@toffanettodev)
