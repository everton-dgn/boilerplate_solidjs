import { expectTypeOf } from 'vite-plus/test'

import type { createSeo } from '../index.ts'

type Options = Parameters<typeof createSeo>[0]
type RouteOptions = { route: true }
type DataOptions = { structuredData: () => undefined }
type BothOptions = RouteOptions & DataOptions

describe('contrato exclusivo de createSeo', () => {
  it('aceita exatamente um modo sem executar o primitive fora de um owner', () => {
    expectTypeOf<RouteOptions>().toExtend<Options>()
    expectTypeOf<DataOptions>().toExtend<Options>()
    expectTypeOf<BothOptions>().not.toExtend<Options>()
    expectTypeOf<Record<string, never>>().not.toExtend<Options>()
  })
})
