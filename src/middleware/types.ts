export type Next = () => Promise<Response>
export type Render = (request?: Request) => Response | Promise<Response>
export type Middleware = (request: Request, next: Next) => Promise<Response>
export type ChainEntry = (request: Request, next: Render) => Promise<Response>
