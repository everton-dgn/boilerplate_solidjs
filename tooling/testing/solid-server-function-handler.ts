// The real module comes from @solidjs/vite-plugin, missing in the node test
// project. The value mirrors the plugin default without a custom
// `serverFunctions.endpoint` or `base`; the E2E checks the real endpoint in the
// production build.
export const endpoint = '/_server'
