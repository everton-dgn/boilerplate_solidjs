# Pages and routes

An in-memory router tests a page, parameters and navigation without a server. SSR, hydration and HTTP integration require a served build. Contracts in [routing](../../skill-solidjs/references/14-routing-and-architecture.md#router-2-installed-surface).

## In-memory router

Create the router per test, with the initial route in the history and explicit children. `mount` stands for the helper of the project; adjust the import to its location. Without it, adapt the [mount recipe](mount-dispose-diagnostics.md#mount-with-guaranteed-disposal):

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

- Route resolution is asynchronous even without data: wait for the initial content with `vi.waitFor`.
- The `query` cache lives in the module and crosses tests. Another test with the same key can receive the cache without calling the mock. With the router of the stable base, a read that settles a rejection marks the entry as not fresh, and the next read calls the fetcher again; a preload does not mark it, so within the preload window (5 s) the first read after a failed preload reuses the rejected promise without calling the fetcher, and only the read after it refetches. Use distinct parameters or `revalidate(getUser.key)`; also clear the mock queue with `mockReset()`, because an unconsumed `mockResolvedValueOnce` response can leak into the next case.
- `query` data is read through a memo under `Loading`. Mock the I/O consumed by the query.
- The active link receives `aria-current="page"`; links are plain `a` elements.

## E2E with Playwright

Visible HTML can be SSR only. Wait for a client-ready signal and run an interaction whose result depends on hydration; keeping the node does not prove that the handlers work.

Contracts exclusive to the production artifact need a run against that build. Use the scripts and the test server of the project.
