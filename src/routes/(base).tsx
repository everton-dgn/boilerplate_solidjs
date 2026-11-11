import type { RouteSectionProps } from '@solidjs/router'

import { Topbar } from '@/components/organisms/Topbar/index.tsx'

export default function BaseLayout(props: RouteSectionProps) {
  return (
    <>
      <Topbar />
      {props.children}
    </>
  )
}
