// Operating limit of the summed catalogs. Above it the generation fails instead
// of degrading: the Paraglide compiler loads every locale at once, and the memory
// grows with the whole set. Measurements in docs/i18n.md.
export const CATALOGS_MAX_BYTES = 8_388_608
