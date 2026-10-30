import { copyFile, mkdir, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import settings from '../../../project.inlang/settings.json' with { type: 'json' }

type Messages = Record<string, string>
type MessagesOptions = { root: string; messages: Messages }
type SettingsOptions = {
  root: string
  baseLocale: string
  locales: readonly string[]
}

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..')
const COMPILER_CONFIG = path.join(
  PROJECT_ROOT,
  'project.inlang/paraglide.config.ts'
)
const NODE_MODULES = path.join(PROJECT_ROOT, 'node_modules')

export const LOCALES = ['pt', 'en', 'es']

export async function writeMessages({
  root,
  messages
}: MessagesOptions): Promise<void> {
  const directory = path.join(root, 'src/routes/Home/i18n')
  await mkdir(directory, { recursive: true })
  for (const locale of LOCALES) {
    await writeFile(
      path.join(directory, `${locale}.json`),
      JSON.stringify(messages)
    )
  }
}

export async function writeSettings({
  root,
  baseLocale,
  locales
}: SettingsOptions): Promise<void> {
  await writeFile(
    path.join(root, 'project.inlang/settings.json'),
    JSON.stringify({ ...settings, baseLocale, locales })
  )
}

export async function writeProject({
  root,
  messages
}: MessagesOptions): Promise<void> {
  await mkdir(path.join(root, 'project.inlang'))
  await copyFile(
    COMPILER_CONFIG,
    path.join(root, 'project.inlang/paraglide.config.ts')
  )
  await symlink(NODE_MODULES, path.join(root, 'node_modules'))
  await writeSettings({ root, baseLocale: 'pt', locales: LOCALES })
  await writeMessages({ root, messages })
}
