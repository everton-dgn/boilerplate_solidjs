declare module '~icons/*' {
  import type { ComponentProps, JSX } from '@solidjs/web'

  const Icon: (props: ComponentProps<'svg'>) => JSX.Element
  export default Icon
}
