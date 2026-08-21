import { paths } from "../router.ts";

// O status 404 é definido no preload da rota, em src/router.ts.
export default function NotFound() {
  return (
    <section>
      <h1>404</h1>
      <p>Essa página não existe.</p>
      <p>
        <a href={paths()}>Voltar para o início</a>
      </p>
    </section>
  );
}
