// Notas publicadas no llms.txt entre o resumo e as listas de páginas: fatos
// que um agente precisa saber antes de abrir os links (idioma, público, o que
// o site oferece e o que não existe). Cada projeto derivado deve reescrevê-las;
// notas em branco são ignoradas.
export const LLMS_NOTES: readonly string[] = [
  'O conteúdo do site está em português do Brasil.',
  'As páginas são renderizadas no servidor e podem ser lidas sem JavaScript.',
  'Não há API pública: as únicas rotas de API servem sitemap.xml, robots.txt e este arquivo.'
]
