import S from './styles.module.css'

// Componente carregado por lazy(): a CSS própria vira um arquivo separado no
// build, que o runtime anuncia no fragmento em streaming.
export default function FragmentCssPanel() {
  return <p class={S.fragment_css_panel}>Painel com CSS própria</p>
}
