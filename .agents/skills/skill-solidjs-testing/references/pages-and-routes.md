# Páginas e rotas

Duas camadas, com papéis diferentes. No Vitest (happy-dom), o router em memória testa a página isolada: parâmetro, dados, navegação por link e estado ativo, sem servidor. No e2e (Playwright contra o build servido), o teste cobre a página real: SSR, hidratação, CSS, erros do navegador e navegação entre rotas. Contratos do router em [roteamento](../../skill-solidjs/references/14-routing-and-architecture.md#router-2-superfície-instalada).

## Router em memória

Crie o router dentro do teste com `createRouter({ routes, history: memoryHistory(path) })`. A rota inicial vem do histórico, não de uma opção do `render`. O `Router` devolvido é um componente e precisa de children explícitos: `<Router>{props => props.children}</Router>`. Não existem `<Router>`, `<Route>`, `<A>` nem `MemoryRouter` no router 2; o link é um `<a href>` comum.

Dados da página vêm de `query`, lida por `createMemo` sob `Loading`. Mocke a função de I/O que a query chama, nunca o router.

```tsx
// tests/user-page.dom.test.tsx
import { expect, test, vi } from 'vitest'
import { Loading, createMemo } from 'solid-js'
import { createRouter, memoryHistory, query, useParams } from '@solidjs/router'
import type { RouteDefinition } from '@solidjs/router'
import type { JSX } from '@solidjs/web'

import { mount } from '../support/mount.tsx'

type User = { id: string; name: string }
type Api = { getUser: (id: string) => Promise<User> }
type LayoutProps = { children?: JSX.Element }

const api: Api = { getUser: vi.fn<Api['getUser']>() }
const getUser = query((id: string) => api.getUser(id), 'user')

const Layout = (props: LayoutProps): JSX.Element => (
  <>
    <nav>
      <a href="/">Início</a>
      <a href="/users/42">Usuário 42</a>
    </nav>
    <main>{props.children}</main>
  </>
)

const UserPage = (): JSX.Element => {
  const params = useParams<{ id: string }>()
  const user = createMemo(() => getUser(params.id))
  return (
    <Loading fallback={<p>Carregando</p>}>
      <h1>{user().name}</h1>
    </Loading>
  )
}

const routes: RouteDefinition[] = [
  {
    path: '/',
    component: Layout,
    children: [
      { path: '/', component: () => <h1>Início</h1> },
      { path: '/users/:id', component: UserPage }
    ]
  }
]

const renderAt = (path: string) => {
  const Router = createRouter({ routes, history: memoryHistory(path) })
  return mount(() => <Router>{props => props.children}</Router>)
}

test('a rota com parâmetro mostra o fallback e depois os dados', async () => {
  const response = Promise.withResolvers<User>()
  vi.mocked(api.getUser).mockReturnValueOnce(response.promise)
  const { host } = renderAt('/users/7')
  await vi.waitFor(() => expect(host.querySelector('main')?.textContent).toBe('Carregando'))
  expect(api.getUser).toHaveBeenCalledExactlyOnceWith('7')
  response.resolve({ id: '7', name: 'Ada' })
  await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toBe('Ada'))
})

test('o clique num link navega e marca o link ativo', async () => {
  vi.mocked(api.getUser).mockResolvedValueOnce({ id: '42', name: 'Grace' })
  const { host } = renderAt('/')
  await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toBe('Início'))
  const link = host.querySelector<HTMLAnchorElement>('a[href="/users/42"]')
  link?.click()
  await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toBe('Grace'))
  expect(link?.getAttribute('aria-current')).toBe('page')
})
```

- A resolução da rota é assíncrona: espere com `vi.waitFor` antes da primeira asserção, mesmo sem dados.
- Armadilha: o cache de `query` é do módulo e atravessa os testes do mesmo arquivo. Um segundo teste que abre `/users/7` recebe o valor em cache e o mock novo nem é chamado. Use parâmetros distintos por teste ou `revalidate(getUser.key)` no início. O `mockResolvedValueOnce` que o cache deixou sem consumir fica na fila e responde no teste seguinte; junto do `revalidate`, chame `mockReset()` no mock.
- O link ativo recebe `aria-current="page"`; afirme sobre ele em vez de classe.
- Rota com filhos `lazy`: espere a resolução do componente antes de afirmar sobre a rota.

## E2e com Playwright

Use e2e para o que a página real faz e o Vitest não alcança: HTML do servidor, hidratação, CSS e layout, rotas de produção, navegação completa. O servidor sobe pelo `webServer` do Playwright a partir do build (`pnpm build && pnpm start`), não pelo dev server. Esta receita segue o formato dos testes de página deste repositório e não foi executada nesta revisão.

```ts
// tests/pages/home.e2e.test.ts
import { expect, test } from '@playwright/test'

test('a home navega para outra rota sem erro no navegador', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'Sobre', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sobre' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sobre', exact: true })).toHaveAttribute('aria-current', 'page')
  expect(errors).toEqual([])
})
```

- `page.on('pageerror')` pega exceções não tratadas do cliente; exija a lista vazia no fim.
- Espere um elemento que só existe depois da hidratação (um botão interativo, `aria-current` atualizado) antes de clicar: HTML visível não prova que o cliente assumiu.
- Locators por papel e nome acessível (`getByRole`) em vez de seletor CSS.
- Rotas que só existem no build de produção, como `robots.txt` e `sitemap.xml`, pedem uma execução separada contra o build de produção.
