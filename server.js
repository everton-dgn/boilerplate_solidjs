// O servidor de produção: serve os assets estáticos de dist/client e entrega
// todo o resto ao handleRequest do bundle de servidor, que faz o SSR em
// streaming, resolve os assets hasheados pelo manifest e atende o endpoint de
// server functions (/_server).
//
// Em plataformas web-native (Workers, Deno, Bun.serve, Nitro) este arquivo não
// é necessário: use handleRequest direto, ou o default export { fetch } do
// bundle. Para só conferir a build localmente, `vp preview` já serve tudo.
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { handleRequest } from "./dist/server/server.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.join(root, "dist", "client");
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "localhost";

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// Resolve o caminho dentro de dist/client e recusa qualquer coisa que escape
// do diretório. O que for recusado cai no handler, que responde o SSR.
function resolveAsset(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const resolved = path.resolve(clientDir, "." + decoded);
  return resolved.startsWith(clientDir + path.sep) ? resolved : null;
}

async function serveStatic(req, res, pathname) {
  const file = resolveAsset(pathname);
  if (!file) return false;

  let info;
  try {
    info = await stat(file);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;

  res.setHeader(
    "content-type",
    MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
  );
  res.setHeader("content-length", info.size);
  // Os arquivos de /assets carregam hash no nome, então são imutáveis.
  res.setHeader(
    "cache-control",
    pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=0, must-revalidate",
  );

  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  await pipeline(createReadStream(file), res);
  return true;
}

function toWebRequest(req) {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  const method = req.method || "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(req);
  return new Request(url, {
    method,
    headers: req.headers,
    body,
    ...(body ? { duplex: "half" } : {}),
  });
}

async function writeWebResponse(res, response) {
  res.statusCode = response.status;
  const cookies = response.headers.getSetCookie?.();
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") res.setHeader(key, value);
  });
  if (cookies?.length) res.setHeader("set-cookie", cookies);
  if (response.body) await pipeline(Readable.fromWeb(response.body), res);
  else res.end();
}

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    if (pathname !== "/" && (await serveStatic(req, res, pathname))) return;

    // O seam options.event: o que for passado aqui entra no request event e é
    // lido depois em qualquer ponto da request com getRequestEvent().
    const response = await handleRequest(toWebRequest(req), { event: { nativeEvent: req } });
    await writeWebResponse(res, response);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`Servidor em http://${host}:${port}`);
});
