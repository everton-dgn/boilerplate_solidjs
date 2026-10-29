/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import path from 'node:path'
import { it } from 'node:test'

import { createServer, isRunnableDevEnvironment } from 'vite-plus'

type CssModule = { default: Record<string, string> }
type CssSource = { default: string }

const ROOT = path.resolve(import.meta.dirname, '../../..')
const BADGE_CSS = '/src/components/atoms/PageBadge/styles.module.css'

// Carrega o vite.config.ts real: o SSR de desenvolvimento do plugin do Solid
// importa as folhas com ?inline, e as classes precisam coincidir com as do
// import normal feito pelo componente.
it('keeps CSS Module classes when importing the stylesheet inline', async context => {
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    mode: 'test',
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] }
  })
  context.after(() => server.close())
  const { ssr } = server.environments
  assert.ok(isRunnableDevEnvironment(ssr))

  const { default: classes } = await ssr.runner.import<CssModule>(BADGE_CSS)
  const { default: stylesheet } = await ssr.runner.import<CssSource>(
    `${BADGE_CSS}?inline`
  )

  assert.ok(classes.badge)
  assert.ok(
    stylesheet.includes(`.${classes.badge}`),
    'Inline CSS must contain the class used by the normal CSS Module import'
  )
})
