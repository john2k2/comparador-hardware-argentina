import { readProductsFromDatabase } from '@/lib/persistence/product-read';
import type { Product } from '@/lib/types';

export type ComparisonPage = {
  slug: string;
  title: string;
  description: string;
  product1: {
    name: string;
    id?: string;
    prices: Array<{ store: string; price: number }>;
  };
  product2: {
    name: string;
    id?: string;
    prices: Array<{ store: string; price: number }>;
  };
  keywords: string[];
};

// Productos más buscados en Argentina (basado en tendencias)
export const TOP_COMPARISONS = [
  {
    slug: 'rtx-4060-vs-rx-7600',
    title: 'RTX 4060 vs RX 7600: ¿Cuál comprar en Argentina? [2026]',
    description: 'Comparativa completa de precios y rendimiento entre la RTX 4060 y RX 7600. Encontrá el mejor precio en 15+ tiendas de Argentina.',
    product1Name: 'RTX 4060',
    product2Name: 'RX 7600',
    keywords: ['rtx 4060 vs rx 7600', '4060 vs 7600 argentina', 'mejor placa video 1080p', 'rtx 4060 precio argentina'],
  },
  {
    slug: 'ryzen-5-7600x-vs-ryzen-7-5700x',
    title: 'Ryzen 5 7600X vs Ryzen 7 5700X: Comparativa Argentina [2026]',
    description: '¿Ryzen 5 7600X o Ryzen 7 5700X? Compará precios actualizados en 16 tiendas. Análisis de rendimiento para gaming y productividad.',
    product1Name: 'Ryzen 5 7600X',
    product2Name: 'Ryzen 7 5700X',
    keywords: ['7600x vs 5700x', 'ryzen 5 vs ryzen 7', 'mejor procesador gaming argentina', 'ryzen 7600x precio'],
  },
  {
    slug: 'rtx-5070-vs-rtx-4070',
    title: 'RTX 5070 vs RTX 4070: ¿Vale la pena el upgrade? [2026]',
    description: 'Comparativa RTX 5070 vs RTX 4070. Precios actualizados, rendimiento en juegos y análisis de valor en Argentina.',
    product1Name: 'RTX 5070',
    product2Name: 'RTX 4070',
    keywords: ['rtx 5070 vs 4070', '5070 vs 4070 argentina', 'mejor placa video 1440p', 'rtx 5070 precio'],
  },
  {
    slug: 'ryzen-7-9800x3d-vs-i9-14900k',
    title: 'Ryzen 7 9800X3D vs i9-14900K: El mejor para gaming [2026]',
    description: 'Comparativa definitiva: Ryzen 7 9800X3D vs Intel i9-14900K. Precios en Argentina, rendimiento en juegos y productividad.',
    product1Name: 'Ryzen 7 9800X3D',
    product2Name: 'Intel Core i9-14900K',
    keywords: ['9800x3d vs 14900k', 'ryzen vs intel gaming', 'mejor procesador 2026 argentina', '9800x3d precio'],
  },
  {
    slug: 'ddr5-vs-ddr4',
    title: 'DDR5 vs DDR4: ¿Vale la pena el upgrade en Argentina? [2026]',
    description: 'Comparativa DDR5 vs DDR4. Diferencias de precio, rendimiento y compatibilidad. Encontrá el mejor precio en tiendas argentinas.',
    product1Name: 'DDR5',
    product2Name: 'DDR4',
    keywords: ['ddr5 vs ddr4', 'memoria ddr5 precio argentina', 'ddr5 vale la pena', 'memoria ram gaming'],
  },
];

export const TOP_BUDGETS = [
  {
    slug: 'pc-gamer-1-millon',
    title: 'PC Gamer por $1.000.000: La mejor configuración [2026]',
    description: 'Armá la mejor PC gamer por 1 millón de pesos. Componentes recomendados con precios actualizados de 20+ tiendas.',
    budget: 1000000,
    keywords: ['pc gamer 1 millon', 'pc gamer barata argentina', 'armar pc 1 millon pesos'],
  },
  {
    slug: 'pc-gamer-2-millones',
    title: 'PC Gamer por $2.000.000: Configuración ideal [2026]',
    description: 'La mejor PC gamer por 2 millones de pesos. Compará precios de componentes en tiempo real.',
    budget: 2000000,
    keywords: ['pc gamer 2 millones', 'pc gaming argentina 2m', 'mejor pc gamer precio calidad'],
  },
  {
    slug: 'pc-gamer-3-millones',
    title: 'PC Gamer por $3.000.000: Alta gama en Argentina [2026]',
    description: 'PC gamer de alta gama por 3 millones. RTX 5070, Ryzen 7 9800X3D y más. Precios actualizados.',
    budget: 3000000,
    keywords: ['pc gamer 3 millones', 'pc alta gama argentina', 'pc gamer rtx 5070'],
  },
];

/**
 * Busca productos en la base de datos para una comparación
 */
export async function findProductsForComparison(
  product1Name: string,
  product2Name: string
): Promise<{ product1?: Product; product2?: Product }> {
  const allProducts = await readProductsFromDatabase({ limit: 1000 });

  const product1 = allProducts.find(p =>
    p.name.toLowerCase().includes(product1Name.toLowerCase())
  );

  const product2 = allProducts.find(p =>
    p.name.toLowerCase().includes(product2Name.toLowerCase())
  );

  return { product1, product2 };
}

/**
 * Genera contenido SEO para una página de comparación
 */
export function generateComparisonContent(
  comparison: typeof TOP_COMPARISONS[0],
  product1?: Product,
  product2?: Product
): string {
  if (!product1 || !product2) {
    return `## ${comparison.title}

Estamos actualizando los precios de ${comparison.product1Name} y ${comparison.product2Name}.

Vuelve pronto para ver la comparativa completa con precios de 20+ tiendas de Argentina.`;
  }

  const p1Lowest = product1.lowestPrice;
  const p2Lowest = product2.lowestPrice;
  const p1Stores = product1.prices.length;
  const p2Stores = product2.prices.length;

  return `## ${comparison.title}

### Comparativa de Precios

| Característica | ${comparison.product1Name} | ${comparison.product2Name} |
|----------------|---------------------------|---------------------------|
| **Mejor Precio** | $${p1Lowest.toLocaleString('es-AR')} | $${p2Lowest.toLocaleString('es-AR')} |
| **Tiendas** | ${p1Stores} disponibles | ${p2Stores} disponibles |
| **Ahorro** | Hasta ${Math.round((1 - p1Lowest / Math.max(p1Lowest, p2Lowest)) * 100)}% | Hasta ${Math.round((1 - p2Lowest / Math.max(p1Lowest, p2Lowest)) * 100)}% |

### ¿Cuál elegir?

**Elegí ${comparison.product1Name} si:**
- Buscás el mejor precio
- ${p1Lowest < p2Lowest ? 'Querés ahorrar $' + (p2Lowest - p1Lowest).toLocaleString('es-AR') : 'Preferís esta marca'}

**Elegí ${comparison.product2Name} si:**
- ${p2Lowest < p1Lowest ? 'Querés ahorrar $' + (p1Lowest - p2Lowest).toLocaleString('es-AR') : 'Preferís esta marca'}
- Buscás ${p2Stores > p1Stores ? 'más opciones de tiendas' : 'otras características'}

### Precios por Tienda

**${comparison.product1Name}:**
${product1.prices.slice(0, 5).map(p => `- ${p.storeId}: $${p.price.toLocaleString('es-AR')}`).join('\n')}

**${comparison.product2Name}:**
${product2.prices.slice(0, 5).map(p => `- ${p.storeId}: $${p.price.toLocaleString('es-AR')}`).join('\n')}

*Precios actualizados en tiempo real. Última actualización: ${new Date().toLocaleDateString('es-AR')}*`;
}

/**
 * Genera contenido SEO para una página de presupuesto
 */
export function generateBudgetContent(
  budget: typeof TOP_BUDGETS[0],
  products?: Product[]
): string {
  return `## ${budget.title}

### Configuración Recomendada por $${budget.budget.toLocaleString('es-AR')}

**Procesador:** ${products?.find(p => p.category === 'procesadores')?.name || 'Ryzen 5 7600X o Intel i5-14600K'}
**Placa de Video:** ${products?.find(p => p.category === 'tarjetas-graficas')?.name || 'RTX 4060 o RX 7600'}
**Memoria:** 16GB DDR5 6000MHz
**Almacenamiento:** SSD NVMe 1TB
**Fuente:** 650W 80 Plus Bronze

### Precios Actualizados

${products?.slice(0, 6).map(p =>
  `- **${p.name}**: Desde $${p.lowestPrice.toLocaleString('es-AR')} (${p.prices.length} tiendas)`
).join('\n') || 'Cargando precios...'}

### Dónde Comprar

Compará precios en tiempo real en nuestras tiendas asociadas:
- Mexx, FullH4rd, CompraGamer, Venex y más.

*Última actualización: ${new Date().toLocaleDateString('es-AR')}*`;
}
