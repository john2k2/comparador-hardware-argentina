import { categories } from '@/lib/scrapers/static-data';
import { SITE_NAME, SITE_URL } from '@/lib/site-config';

export function buildLlmsTxt(): string {
  const categoryLines = categories
    .map((category) => `- [${category.name}](${SITE_URL}/search?category=${category.id})`)
    .join('\n');

  return `# ${SITE_NAME}

> Comparador independiente de precios de hardware en Argentina. No vende productos.

## Páginas

- [Inicio](${SITE_URL}/)
- [Acerca](${SITE_URL}/acerca)
- [Guías PC gamer](${SITE_URL}/guia)
- [Comparativas](${SITE_URL}/comparativa)
- [Índice de precios](${SITE_URL}/indice-precios-hardware)

## Categorías

${categoryLines}
`;
}
