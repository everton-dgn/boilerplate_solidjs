// Teto operacional dos catálogos somados. Acima dele a geração falha em vez de
// degradar: o compilador do Paraglide carrega todos os idiomas de uma vez, e a
// memória cresce com o conjunto inteiro. Medições em docs/i18n.md.
export const CATALOGS_MAX_BYTES = 8_388_608
