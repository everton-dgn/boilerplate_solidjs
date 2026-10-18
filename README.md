# SolidJS + Vite+ Boilerplate

Base para projetos com SolidJS, TypeScript e renderização no servidor (SSR).
Inclui roteamento por arquivos, server functions, servidor Nitro e validação
automatizada com Vite+.

Veja a
[demonstração do SolidJS Boilerplate](https://boilerplate-solidjs.devinsights.dev/en)
para conhecer as páginas, os componentes e os idiomas disponíveis.

## O que já vem pronto

- SSR com hidratação, páginas de erro e proteção de chamadas de backend.
- Português, inglês e espanhol, com inglês como idioma base e URLs localizadas.
- Componentes com CSS Modules, tema claro, escuro ou do sistema e persistência.
- SEO por rota, dados estruturados, sitemap, `robots.txt` e `llms.txt`.
- Testes de unidade, componentes e navegador com Vitest e Playwright.
- Formatação, lint, tipos, hooks de Git e CI com deploy na Vercel.

## Primeiros passos

Instale o CLI global do [Vite+](https://viteplus.dev/guide/). As versões de Node
e Bun são definidas no [package.json](package.json) e gerenciadas pelo Vite+.

```bash
git clone git@github.com:everton-dgn/boilerplate_solidjs.git
cd boilerplate_solidjs
vp install
vpr dev
```

Abra o endereço exibido no terminal. O `.env` versionado contém a configuração
local; ajuste `VITE_SITE_URL` para a URL pública do projeto antes de publicar.
Veja [ambiente, runtimes e deploy](docs/development.md) para os detalhes.

Para executar os testes de navegador e E2E, instale o Chromium uma vez:

```bash
vpr test:browser:install
```

## Comandos essenciais

| Comando                   | Uso                                                        |
| ------------------------- | ---------------------------------------------------------- |
| `vpr dev`                 | Iniciar o servidor de desenvolvimento                      |
| `vpr build`               | Gerar o build de produção                                  |
| `vpr start`               | Conferir o build localmente                                |
| `vpr validate`            | Verificar formato, lint, tipos, cobertura, tooling e build |
| `vpr test:e2e`            | Testar a aplicação com as fixtures E2E                     |
| `vpr test:e2e:production` | Testar as rotas reais de produção                          |

Use `vpr dev` e `vpr build` para executar os scripts com Bun. Vitest, testes de
tooling e SSR de produção permanecem em Node. Execute as duas suítes E2E em
sequência, pois compartilham porta e artefatos de build. A
[referência de desenvolvimento](docs/development.md#scripts) contém os demais
scripts e as restrições de runtime.

## Documentação

| Guia                                         | Conteúdo                                                   |
| -------------------------------------------- | ---------------------------------------------------------- |
| [Desenvolvimento](docs/development.md)       | Ambiente, scripts, runtimes, cache, CI e deploy            |
| [Arquitetura](docs/architecture.md)          | Rotas, organização de módulos e dependências entre camadas |
| [Internacionalização](docs/i18n.md)          | Catálogos, geração, navegação e persistência do idioma     |
| [Componentes e estilos](docs/ui.md)          | Campos, diálogos, notificações, tema, CSS e ícones         |
| [Segurança e CSP](docs/security.md)          | Cabeçalhos, nonce, renderização e limites da política      |
| [Erros no servidor](docs/server-errors.md)   | Chamadas de backend, saída pública e recuperação           |
| [SEO](docs/seo.md)                           | Metadados, dados estruturados e índices do site            |
| [Testes](docs/testing.md)                    | Ambientes, isolamento, E2E e diagnóstico de falhas         |
| [Desempenho de SEO](docs/seo-performance.md) | Medições históricas e método de comparação                 |
| [Releases](tooling/release/README.md)        | Versões, tags, changelog e recuperação da automação        |

As [convenções para agentes](AGENTS.md) ficam no arquivo de instruções do
projeto.

## Autor

[Éverton Toffanetto](https://devinsights.dev) ·
[LinkedIn](https://www.linkedin.com/in/everton-toffanetto) ·
[YouTube](https://youtube.com/@toffanettodev)
