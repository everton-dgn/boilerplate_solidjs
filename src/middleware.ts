// A chain de middleware do servidor, ligada em start.middleware no
// vite.config.ts: funções fetch-style que passam na frente de toda request
// despachada pelo servidor, tanto o SSR das páginas quanto as chamadas de
// server function, em dev, em preview e em produção.
//
// Cada uma roda dentro do escopo da request, então getRequestEvent() responde
// aqui igual ao código de aplicação. Nada vai para a rede antes do middleware
// mais externo retornar, então os headers continuam mutáveis depois do next()
// mesmo em resposta streamada.
import { getRequestEvent } from "@solidjs/web";

type Next = () => Promise<Response>;

async function requestTiming(_request: Request, next: Next) {
  const started = performance.now();
  const response = await next();
  response.headers.set("server-timing", `app;dur=${(performance.now() - started).toFixed(1)}`);
  return response;
}

async function securityHeaders(_request: Request, next: Next) {
  const response = await next();
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return response;
}

// Decora o event com dados por request. O que for escrito em locals fica
// visível depois em qualquer server function via getRequestEvent().
async function requestContext(_request: Request, next: Next) {
  const event = getRequestEvent();
  if (event) event.locals.requestId = crypto.randomUUID();
  return next();
}

export default [requestTiming, securityHeaders, requestContext];
