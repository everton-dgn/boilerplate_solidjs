// O build lê este módulo sem aliases: mantenha-o sem imports.
export const PUBLICATION_PHASE_ENV = 'PUBLICATION_BUILD_PHASE'
export const PUBLICATION_PRERENDER_PHASE = 'prerender'
export const PUBLICATION_ARTIFACT_DIR = 'publication'
export const SITEMAP_MANIFEST_FILE = 'sitemap-manifest.json'
export const SITEMAP_IDENTITIES_FILE = 'sitemap-identities.json'
export const SITEMAP_ARTIFACT_VERSION = 1
// O manifesto cresce com o número de partes, limitado pelo índice do sitemap.
export const SITEMAP_MANIFEST_MAX_BYTES = 1_048_576
// Com fonte legada, a instância carrega este arquivo inteiro uma vez. O teto
// limita esse custo O(N); acima dele o build falha e o catálogo deve migrar
// para fontes particionadas.
export const SITEMAP_IDENTITIES_MAX_BYTES = 33_554_432
