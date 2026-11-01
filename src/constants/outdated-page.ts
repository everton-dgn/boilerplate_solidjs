// O handler do transporte e o hook de erros rodam fora da árvore e não
// alcançam o estado do aviso; os eventos ligam os dois no navegador.
export const REFUSED_SUBMIT_EVENT = 'app:refused-submit'
export const OUTDATED_FALLBACK_EVENT = 'app:outdated-fallback'
