// O manifesto real vem do plugin filesystem-routing, ausente no projeto node
// de testes, que recebe estas listas vazias. Os testes node que dependem de rotas
// substituem com vi.mock o matcher de filesystem-routing/api ou o helper que
// consulta o manifesto.
const routes: readonly [] = []

export const pageRoutes: readonly [] = []

export default routes
