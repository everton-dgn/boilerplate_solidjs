import { createRouter } from '@solidjs/router'
import { fileRoutes } from '@solidjs/router/fs'
import { pageRoutes } from 'virtual:file-routes'

import { delocalizePathname } from '@/i18n/urls/index.ts'

export const Router = createRouter({
  routes: fileRoutes(pageRoutes),
  transformUrl: delocalizePathname
})

export const { paths } = Router
