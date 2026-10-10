// Notas publicadas no llms.txt entre o resumo e as listas de páginas: fatos
// que um agente precisa saber antes de abrir os links (idioma, público, o que
// o site oferece e o que não existe). Cada projeto derivado deve reescrevê-las;
// notas em branco são ignoradas.
export const LLMS_NOTES: readonly string[] = [
  'Content is available in English (/en), Brazilian Portuguese (/pt) and Spanish (/es). This index uses English.',
  'Pages are rendered on the server and can be read without JavaScript.',
  'There is no public API: the only API routes serve sitemap.xml, robots.txt and this file.'
]
