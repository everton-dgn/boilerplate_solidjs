// The real manifest comes from the filesystem-routing plugin, missing in the node
// test project, which receives these empty lists. The node tests that depend on
// routes replace the filesystem-routing/api matcher or the helper that reads the
// manifest with vi.mock.
const routes: readonly [] = []

export const pageRoutes: readonly [] = []

export default routes
