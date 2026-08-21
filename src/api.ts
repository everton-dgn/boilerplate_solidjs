// Server functions: a diretiva "use server" mantém o corpo da função no
// servidor e troca a implementação do cliente por uma chamada fetch ao
// endpoint /_server. O código abaixo nunca entra no bundle do browser.
import { getRequestEvent } from "@solidjs/web";

export async function getServerInfo(): Promise<string> {
  "use server";
  const event = getRequestEvent();
  const requestId = event?.locals.requestId ?? "sem id";
  return `Node ${process.version} · request ${requestId}`;
}
