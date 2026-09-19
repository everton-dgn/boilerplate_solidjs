# Changelog

## Unreleased

## 1.2.0 - 2026-09-19

### Added

- protect server operations from public exposure (c9dddaa)
- integrate file routes and error recovery (fd929f2)
- add themed components and document shell (0d5d810)
- add persistent synchronized theme state (4266c2d)

### Fixed

- accept relative paths in lint diagnostics (7ff3d62)
- align router and dynamic rendering with solid runtime (f263b10)
- update solid-js and related packages to v2.0.0-rc.9 (de5c779)

## 1.1.2 - 2026-09-13

### Fixed

- clean up published release branches safely (75eb879)

## 1.1.1 - 2026-09-13

### Fixed

- skip duplicate pull request CI (e216970)

## 1.1.0 - 2026-09-13

### Added

- add Nav component and update layout (fffdc92)
- remove main protection rules and enable concurrent tests (de54348)

## 1.0.0 - 2026-09-12

### Added

- automate protected releases and production deployments (3b3da2e)
- add vitest dom matchers and update lockfile (78ba9a4)
- update pnpm to v12.4.1 and tsconfig (17744e6)
- add valibot and update favicon and styles (3f11b1d)
- simplify build and preview commands (2c93cc1)
- configure environment variables for local development and testing (31523b6)
- upgrade SolidJS to v2.0.0-rc.8 and improve project configuration (9e1bd76)
- configure Playwright for E2E testing and add security headers (d45fa93)
- set up SolidJS 2 with client and server rendering (3e09cf0)

### Fixed

- use latest Vercel CLI (67a7eb5)
- allow Vercel CLI dependency build (f47fda4)
- preserve release fences and hook docs (82aa660)
