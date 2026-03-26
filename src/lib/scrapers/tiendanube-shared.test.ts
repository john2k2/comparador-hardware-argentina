import { describe, expect, it } from 'vitest';
import {
  inferTiendaNubeStockFromOffer,
  inferTiendaNubeStockFromVariants,
  parseTiendaNubeProductDetailHtml,
} from './tiendanube-shared';

describe('tiendanube-shared', () => {
  it('infiere stock desde variants y offers', () => {
    expect(inferTiendaNubeStockFromVariants('[{\"available\":true,\"stock\":2}]')).toBe('low-stock');
    expect(
      inferTiendaNubeStockFromOffer({
        availability: 'https://schema.org/InStock',
        inventoryLevel: { value: 8 },
      }),
    ).toBe('in-stock');
  });

  it('parsea detalle TiendaNube con JSON-LD y normaliza datos importantes', () => {
    const product = parseTiendaNubeProductDetailHtml(
      `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@type": "Product",
                "name": "Monitor Samsung Odyssey",
                "description": " Monitor gamer curvo ",
                "image": "https://cdn.tienda.test/monitor.webp",
                "offers": {
                  "price": "899999",
                  "availability": "https://schema.org/InStock",
                  "inventoryLevel": { "value": 5 }
                }
              }
            </script>
          </head>
          <body>
            <div class="js-product-container" data-variants="[{&quot;available&quot;:true,&quot;stock&quot;:5}]"></div>
          </body>
        </html>
      `,
      'https://tienda.test/productos/monitor-odyssey/',
      'shopgamer-monitor-odyssey',
      {
        id: 'shopgamer',
        name: 'ShopGamer',
        baseUrl: 'https://tienda.test',
      },
      'perifericos',
    );

    expect(product).not.toBeNull();
    expect(product?.name).toBe('Monitor Samsung Odyssey');
    expect(product?.prices[0].price).toBe(899_999);
    expect(product?.prices[0].stock).toBe('in-stock');
    expect(product?.description).toBe('Monitor gamer curvo');
  });
});
