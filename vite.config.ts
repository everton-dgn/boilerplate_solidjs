import { defineConfig } from "vite-plus";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
  plugins: [
    solid({
      // Start mode: o plugin gera as entries em torno de src/App.tsx,
      // envolvida por src/Document.tsx. Sem index.html, sem entry files.
      start: { middleware: "./src/middleware.ts" },
      // O boolean que faz o flip: true = SSR em streaming (dist/client +
      // dist/server), false = SPA estático prerenderizado em
      // dist/client/index.html. Mesma App, mesmo Document.
      ssr: true,
      // Compila as funções "use server" em fetch para o endpoint /_server.
      serverFunctions: true,
    }),
  ],
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
