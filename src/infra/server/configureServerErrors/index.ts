import 'server-only'
import { configureServerFunctionsServer } from '@solidjs/web/server-functions/server'

import { protectServerOperation } from '../protectServerOperation/index.ts'

configureServerFunctionsServer({
  wrapInvocation: run => protectServerOperation({ run, allowControl: true })
})
