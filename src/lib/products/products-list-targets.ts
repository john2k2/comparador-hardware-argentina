import type { HardwareCategory } from '@/lib/types';
import { hardwareCategoryToSearchTerm } from '@/lib/catalog/hardware-categories';

export type CoreStoreCategoryUrls = {
  mexx: string;
  fullh4rd: string;
  venex: string;
};

export function buildCoreStoreCategoryUrls(
  category: HardwareCategory,
  query?: string,
): CoreStoreCategoryUrls {
  const term = query?.trim() || hardwareCategoryToSearchTerm(category);
  const encoded = encodeURIComponent(term);

  if (!query && category === 'procesadores') {
    return {
      mexx: 'https://www.mexx.com.ar/productos-rubro/procesadores/',
      fullh4rd: 'https://www.fullh4rd.com.ar/cat/search/procesador',
      venex: 'https://www.venex.com.ar/componentes-de-pc/microprocesadores',
    };
  }

  if (!query && category === 'tarjetas-graficas') {
    return {
      mexx: 'https://www.mexx.com.ar/productos-rubro/placas-de-video/',
      fullh4rd: 'https://www.fullh4rd.com.ar/cat/search/video',
      venex: 'https://www.venex.com.ar/componentes-de-pc/placas-de-video',
    };
  }

  if (!query && category === 'motherboards') {
    return {
      mexx: 'https://www.mexx.com.ar/productos-rubro/motherboards/',
      fullh4rd: 'https://www.fullh4rd.com.ar/cat/search/mother',
      venex: 'https://www.venex.com.ar/componentes-de-pc/mothers',
    };
  }

  return {
    mexx: `https://www.mexx.com.ar/buscar/?p=${encoded}`,
    fullh4rd: `https://www.fullh4rd.com.ar/cat/search/${encoded}`,
    venex: `https://www.venex.com.ar/resultados-busqueda.htm?keywords=${encoded}`,
  };
}
