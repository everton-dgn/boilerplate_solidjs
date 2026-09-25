# Páginas e rotas

Router em memória testa página, parâmetros e navegação sem servidor. SSR, hidratação e integração HTTP exigem build servido. Contratos em [roteamento](../../skill-solidjs/references/14-routing-and-architecture.md#router-2-superfície-instalada).

## Router em memória

Crie o router por teste, com rota inicial no histórico e children explícitos. `mount` representa o helper do projeto; ajuste o import à sua localização. Na falta dele, adapte a [receita de montagem](mount-dispose-diagnostics.md#montar-com-descarte-garantido):

```tsx
import { expect, it, vi } from 'vitest'
import { createRouter, memoryHistory } from '@solidjs/router'
import { mount } from '../support/mount.tsx'

it('renders the initial route', async () => {
  const Router = createRouter({
    routes: [{ path: '/users/:id', component: () => <h1>User</h1> }],
    history: memoryHistory('/users/7')
  })
  const { host } = mount(() => <Router>{props => props.children}</Router>)
  await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toBe('User'))
})
```

- A resolução da rota é assíncrona mesmo sem dados: espere o conteúdo inicial com `vi.waitFor`.
- O cache de `query` vive no módulo e atravessa testes. Outro teste com a mesma chave pode receber o cache sem chamar o mock. Use parâmetros distintos ou `revalidate(getUser.key)`; limpe também a fila do mock com `mockReset()`, pois uma resposta `mockResolvedValueOnce` não consumida pode vazar para o caso seguinte.
- Dados de `query` são lidos por memo sob `Loading`. Mocke o I/O consumido pela query.
- O link ativo recebe `aria-current="page"`; links são elementos `a` comuns.

## E2e com Playwright

HTML visível pode ser apenas SSR. Espere um sinal de cliente pronto e execute uma interação cujo resultado dependa da hidratação; preservar o nó não prova que os handlers funcionam.

Contratos exclusivos do artefato de produção precisam de uma execução contra esse build. Use os scripts e o servidor de testes do projeto.
