import { categories } from '../../src/lib/scrapers/static-data';
import { buildCategoryLandingPath } from '../../src/lib/seo/category-landing-routes';
import { COMPARISONS } from '../../src/lib/seo/comparisons-data';
import { BUDGET_GUIDES } from '../../src/lib/seo/budget-guides-data';

// Todas las rutas editoriales y categorías, más cada familia pública y seis
// fichas sintéticas. No intenta recorrer cada publicación del catálogo real.
export const publicRoutes = [...new Set([
  '/', '/search', '/search?q=ryzen', '/comparativa/comparar', '/comparativa', '/guia', '/guia/armar',
  '/juegos-digitales', '/acerca', '/contacto', '/privacidad', '/terminos', '/auth', '/about',
  ...categories.map(category => buildCategoryLandingPath(category.id)),
  ...COMPARISONS.map(comparison => `/comparativa/${comparison.slug}`),
  ...BUDGET_GUIDES.map(guide => `/guia/${guide.slug}`),
  ...['fixture-ryzen-5600','fixture-ryzen-5700x','fixture-rtx-4060','fixture-b650m','fixture-ddr4-16gb','fixture-mouse-gamer'].map(id=>`/product/${id}`),
])];
