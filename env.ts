import * as v from 'valibot'

const MAX_PORT = 65_535

const env = {
  server: {
    HOST: v.optional(v.pipe(v.string(), v.nonEmpty())),
    PORT: v.optional(
      v.pipe(
        v.string(),
        v.regex(/^\d+$/u),
        v.toNumber(),
        v.integer(),
        v.minValue(0),
        v.maxValue(MAX_PORT)
      )
    ),
    BASE_URL_TEST: v.optional(v.pipe(v.string(), v.url()))
  },
  client: {
    VITE_APP_NAME: v.optional(v.pipe(v.string(), v.nonEmpty()), 'Solid App')
  }
}

export default env
