export const HOME_INTENT_LINKS = [
  { href: '/search?category=procesadores', label: 'Comparar procesadores' },
  { href: '/search?category=tarjetas-graficas', label: 'Comparar placas de video' },
  { href: '/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x', label: 'Ryzen 5 7600X vs Ryzen 7 5700X' },
  { href: '/search?category=motherboards', label: 'Comparar motherboards' },
  { href: '/search?category=memoria-ram', label: 'Comparar memoria RAM' },
] as const;

export const HOME_PROCESSOR_PROMO = {
  href: '/search?category=procesadores',
  cta: 'COMPARAR PROCESADORES',
  title: 'COMPARÁ PROCESADORES AMD E INTEL EN MULTIPLES TIENDAS ANTES DE COMPRAR',
} as const;
