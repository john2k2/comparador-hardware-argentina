import { categories } from '@/lib/scrapers/static-data';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';
import { HOME_CITATION_BLOCK } from './home-copy';

export function buildLlmsTxt(): string {
  const categoryLines = categories
    .map((category) => `- [${category.name}](${SITE_URL}/search?category=${category.id})`)
    .join('\n');

  return `# ${SITE_NAME}

> Comparador independiente de precios de hardware en Argentina. No vende productos.

${HOME_CITATION_BLOCK}

Metodología del índice: ${SITE_URL}/indice-precios-hardware
No declaramos un ganador si no hay ofertas en stock.

## Páginas

- [Inicio](${SITE_URL}/)
- [Acerca](${SITE_URL}/acerca)
- [Guías PC gamer](${SITE_URL}/guia)
- [Armá tu PC](${SITE_URL}/guia/armar)
- [Comparativas](${SITE_URL}/comparativa)
- [Índice de precios](${SITE_URL}/indice-precios-hardware)

## Categorías

${categoryLines}
`;
}

