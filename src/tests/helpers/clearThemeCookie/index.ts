import { THEME_COOKIE_NAME } from '@/constants/theme.ts'

export function clearThemeCookie(): void {
  // oxlint-disable-next-line unicorn/no-document-cookie -- Os testes removem o cookie diretamente para isolar a preferência entre casos.
  document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}
