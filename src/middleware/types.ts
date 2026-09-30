type Next = () => Promise<Response>
type Render = (request?: Request) => Response | Promise<Response>
type Middleware = (request: Request, next: Next) => Promise<Response>
type ChainEntry = (request: Request, next: Render) => Promise<Response>

export type { ChainEntry, Middleware, Next, Render }
