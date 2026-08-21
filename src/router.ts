import { lazy } from "solid-js";
import { createRouter } from "@solidjs/router";
import { httpStatus } from "@solidjs/web";

// O array de rotas vai inline para o TypeScript preservar os paths literais:
// é isso que alimenta o `paths` tipado abaixo. Extrair para uma const separada
// alarga os paths para `string` e derruba a inferência (use `defineRoutes` do
// @solidjs/router se precisar extrair).
export const Router = createRouter({
  routes: [
    { path: "/", component: lazy(() => import("./routes/index.tsx")) },
    {
      path: "*404",
      component: lazy(() => import("./routes/not-found.tsx")),
      // httpStatus() define o status da resposta durante o SSR e é no-op no
      // browser. Roda no preload para o código ser definido antes do head da
      // resposta ir para a rede.
      //
      // Em rotas declaradas aqui o preload vive na definição. O export `route`
      // dos módulos de página só é lido pelo file-system routing.
      preload: () => httpStatus(404),
    },
  ],
});

// Gerador de links tipados: paths() resolve "/". Rotas com parâmetro viram
// chamadas, como paths.users(1).
export const { paths } = Router;
