// The build reads this module without aliases: keep it without imports.
export const PUBLICATION_PHASE_ENV = 'PUBLICATION_BUILD_PHASE'
export const PUBLICATION_PRERENDER_PHASE = 'prerender'
export const PUBLICATION_ARTIFACT_DIR = 'publication'
export const SITEMAP_MANIFEST_FILE = 'sitemap-manifest.json'
export const SITEMAP_IDENTITIES_FILE = 'sitemap-identities.json'
export const SITEMAP_ARTIFACT_VERSION = 1
// The manifest grows with the number of parts, bounded by the sitemap index.
export const SITEMAP_MANIFEST_MAX_BYTES = 1_048_576
// With an array source, the instance loads this whole file once. The limit bounds
// that O(N) cost; above it the build fails and the catalog must move to
// partitioned sources.
export const SITEMAP_IDENTITIES_MAX_BYTES = 33_554_432
