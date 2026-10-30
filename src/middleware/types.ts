export type Next = () => Promise<Response>
export type Middleware = (request: Request, next: Next) => Promise<Response>
