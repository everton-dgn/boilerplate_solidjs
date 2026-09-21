export const SITE = {
  title: 'SolidJS Boilerplate',
  description:
    'Uma base para aplicações web com SolidJS, TypeScript e Vite+, com renderização no servidor e temas claro e escuro.',
  author: 'Éverton Toffanetto',
  // URL pública fixa para canonical, Open Graph, sitemap e robots, definida
  // por VITE_SITE_URL.
  url: import.meta.env.VITE_SITE_URL,
  image: {
    path: '/images/og.png',
    width: 1200,
    height: 630,
    alt: 'Logo do SolidJS sobre o título SolidJS Boilerplate'
  }
}
