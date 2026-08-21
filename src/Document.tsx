import type { ParentProps } from "solid-js";
import { HydrationScript } from "@solidjs/web";

// O shell do documento, que substitui o index.html: a convenção do shell
// é lida pelo plugin, que envolve a App com ele nas entries geradas. Precisa
// renderizar o <html> inteiro, e é aqui que ficam as tags de head.
//
// Com ssr: false o plugin remove o <HydrationScript /> do shell, então o mesmo
// arquivo serve os dois modos sem alteração.
export default function Document(props: ParentProps) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" />
        <title>Solid App</title>
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
