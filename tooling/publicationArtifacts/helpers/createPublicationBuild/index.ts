import { randomUUID } from 'node:crypto'

type BuildDefine = { define: Record<string, string> }
type BuildPlugin = { name: string; config: () => BuildDefine }
type PublicationBuild = { buildId: string; plugin: BuildPlugin }

const BUILD_ID_DEFINE = 'import.meta.env.PUBLICATION_BUILD_ID'

// The SSR is generated before the prerender, so the only value it can carry is
// the one defined here. The same identifier goes to the Nitro module and to the
// function manifest, which binds the artifacts to the bundle that reads them.
export function createPublicationBuild(): PublicationBuild {
  const buildId = randomUUID()
  return {
    buildId,
    plugin: {
      name: 'project:publication-build',
      config: () => ({ define: { [BUILD_ID_DEFINE]: JSON.stringify(buildId) } })
    }
  }
}
