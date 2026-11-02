import { randomUUID } from 'node:crypto'

type BuildDefine = { define: Record<string, string> }
type BuildPlugin = { name: string; config: () => BuildDefine }
type PublicationBuild = { buildId: string; plugin: BuildPlugin }

const BUILD_ID_DEFINE = 'import.meta.env.PUBLICATION_BUILD_ID'

// O SSR é gerado antes do prerender, então o único valor que ele pode carregar
// é o definido aqui. O mesmo identificador vai ao módulo do Nitro e ao manifesto
// da função, o que vincula os artefatos ao bundle que os lê.
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
