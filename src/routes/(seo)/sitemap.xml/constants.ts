// Limite do protocolo por arquivo de sitemap. Acima dele a resposta falha em
// vez de truncar em silêncio: é o ponto para introduzir um sitemap index.
export const SITEMAP_URL_LIMIT = 50_000

// Tempo máximo para todas as fontes dinâmicas responderem. Estourado, o
// sitemap responde 503 e o crawler tenta de novo.
export const SITEMAP_SOURCES_TIMEOUT_MS = 10_000
