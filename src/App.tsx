import { Router } from "./router.ts";
import "./style.css";

// A raiz da aplicação: o router e o layout do site. As páginas ficam em
// src/pages. Renderiza no servidor e hidrata no cliente com a mesma fonte.
export default function App() {
  return <Router>{(props) => <main class="layout">{props.children}</main>}</Router>;
}
