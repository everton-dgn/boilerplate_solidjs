import assert from 'node:assert/strict'
import path from 'node:path'
import { it } from 'node:test'

import { createServer, isRunnableDevEnvironment } from 'vite-plus'

type CssModule = { default: Record<string, string> }
type CssSource = { default: string }

const ROOT = path.resolve(import.meta.dirname, '../../..')
const BADGE_CSS = '/src/components/atoms/PageBadge/styles.module.css'
const BUTTON_CSS = '/src/components/atoms/Button/styles.module.css'
const INPUT_CSS = '/src/components/atoms/Input/styles.module.css'

// Carrega o vite.config.ts real e reproduz o ?inline que o plugin do Solid usa
// no SSR de desenvolvimento: as classes precisam coincidir com as do import
// normal e continuar distintas entre seletores e entre módulos de mesmo nome.
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

  const { default: badge } = await ssr.runner.import<CssModule>(BADGE_CSS)
  const { default: stylesheet } = await ssr.runner.import<CssSource>(
    `${BADGE_CSS}?inline`
  )
  const { default: button } = await ssr.runner.import<CssModule>(BUTTON_CSS)
  const { default: input } = await ssr.runner.import<CssModule>(INPUT_CSS)

  assert.ok(badge.badge && badge.dot)
  assert.notEqual(badge.badge, badge.dot)
  assert.ok(
    stylesheet.includes(`.${badge.badge}`) &&
      stylesheet.includes(`.${badge.dot}`),
    'Inline CSS must contain the classes used by the normal CSS Module import'
  )
  assert.ok(button.variant_default && input.variant_default)
  assert.notEqual(button.variant_default, input.variant_default)
})
