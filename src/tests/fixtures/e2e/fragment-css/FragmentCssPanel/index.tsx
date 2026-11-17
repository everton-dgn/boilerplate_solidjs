import S from './styles.module.css'

// Component loaded by lazy(): its own CSS becomes a separate file in the build,
// which the runtime announces in the streamed fragment.
export default function FragmentCssPanel() {
  return <p class={S.fragment_css_panel}>Panel with its own CSS</p>
}
