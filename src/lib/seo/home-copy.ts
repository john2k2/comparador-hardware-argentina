export const HOME_CITATION_BLOCK =
  'Comparador Hardware Argentina es un comparador independiente de precios de hardware entre tiendas argentinas. No vendemos componentes ni cobramos la compra: mostramos precio, disponibilidad y el enlace a cada comercio. Sirve para comparar procesadores, placas de video, memoria RAM, SSD y el resto del armado de una PC gamer o de trabajo, y elegir con el catálogo del día antes de ir a la tienda. El sitio no es una tienda: cada oferta sale de comercios argentinos con stock publicado.';

export const HOME_BUDGET_GUIDE_LINKS = [
  { slug: 'pc-gamer-1-millon', title: '$1.000.000', target: '1080p 60fps' },
  { slug: 'pc-gamer-2-millones', title: '$2.000.000', target: '1440p 60fps' },
  { slug: 'pc-gamer-3-millones', title: '$3.000.000', target: '1440p 144Hz' },
] as const;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
