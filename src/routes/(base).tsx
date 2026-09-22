import type { RouteSectionProps } from '@solidjs/router'

import { Topbar } from '@/components/molecules/Topbar/index.tsx'

export default function BaseLayout(props: RouteSectionProps) {
  return (
    <>
      <Topbar />
      {props.children}
    </>
  )
}
