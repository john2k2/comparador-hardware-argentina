export const HOME_CITATION_BLOCK =
  'Comparador Hardware Argentina es un comparador independiente de componentes de PC entre tiendas argentinas. No vendemos hardware ni procesamos la compra: mostramos ofertas registradas y enlazamos a cada comercio. Cada oferta conserva su fecha de observación; precio, stock, envío y condiciones se confirman en la tienda de destino. Incluye búsqueda, categorías, comparativas y guías por presupuesto. Los enlaces afiliados y los espacios patrocinados se identifican por separado.';

export const HOME_BUDGET_GUIDE_LINKS = [
  { slug: 'pc-gamer-1-millon', title: '$1.000.000', target: 'Gaming de entrada' },
  { slug: 'pc-gamer-2-millones', title: '$2.000.000', target: 'AM5 + GPU de 8 GB' },
  { slug: 'pc-gamer-3-millones', title: '$3.000.000', target: '32 GB RAM + GPU de 16 GB' },
] as const;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
