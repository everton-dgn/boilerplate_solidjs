import { createRouter } from '@solidjs/router'
import { httpStatus } from '@solidjs/web'
import { lazy } from 'solid-js'

export const Router = createRouter({
  routes: [
    { path: '/', component: lazy(() => import('./routes/index.tsx')) },
    {
      path: '*404',
      component: lazy(() => import('./routes/not-found.tsx')),
      preload: () => httpStatus(404)
    }
  ]
})

export const { paths } = Router
