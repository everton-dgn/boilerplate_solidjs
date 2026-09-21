export const SITE = {
  title: 'SolidJS Boilerplate',
  description:
    'Uma base para aplicações web com SolidJS, TypeScript e Vite+, com renderização no servidor e temas claro e escuro.',
  author: 'Éverton Toffanetto',
  // BCP 47: `lang` do documento e `inLanguage` do JSON-LD; o `og:locale`
  // deriva daqui trocando o hífen por sublinhado.
  locale: 'pt-BR',
  // URL pública fixa para canonical, Open Graph, sitemap e robots, definida
  // por VITE_SITE_URL.
  url: import.meta.env.VITE_SITE_URL,
  // Perfis oficiais do site, publicados em `sameAs` no nó `Organization`.
  socialLinks: ['https://github.com/everton-dgn/boilerplate_solidjs'],
  // Logo do publisher no JSON-LD; o Google pede ao menos 112x112 pixels.
  logo: {
    path: '/favicon/apple-touch-icon.png',
    width: 180,
    height: 180
  },
  image: {
    path: '/images/og.png',
    width: 1200,
    height: 630,
    alt: 'Logo do SolidJS sobre o título SolidJS Boilerplate'
  }
}
