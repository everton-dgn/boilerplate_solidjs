import type { UserConfig } from 'vite-plus'

export type LintRules = NonNullable<NonNullable<UserConfig['lint']>['rules']>
