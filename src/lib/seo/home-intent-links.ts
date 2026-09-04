import { buildCategoryLandingPath } from '@/lib/seo/category-landing-routes';

export const HOME_INTENT_LINKS = [
  { href: buildCategoryLandingPath('procesadores'), label: 'Comparar procesadores' },
  { href: buildCategoryLandingPath('tarjetas-graficas'), label: 'Comparar placas de video' },
  { href: '/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x', label: 'Ryzen 5 7600X vs Ryzen 7 5700X' },
  { href: buildCategoryLandingPath('motherboards'), label: 'Comparar motherboards' },
  { href: buildCategoryLandingPath('memoria-ram'), label: 'Comparar memoria RAM' },
] as const;

export const HOME_PROCESSOR_PROMO = {
  href: buildCategoryLandingPath('procesadores'),
  cta: 'COMPARAR PROCESADORES',
  title: 'COMPARÁ PROCESADORES AMD E INTEL EN MULTIPLES TIENDAS ANTES DE COMPRAR',
} as const;
