import { describe, expect, it } from 'vitest';
import { getProductImageSource, normalizeProductImageUrl, pickProductImage } from './product-images';

const filename = 'compragamer_Imganen_general_54048_i5_12600KF_b1480822-med.jpg';
const corrected = `https://imagenes.compragamer.com/productos/${filename}`;

describe('product-images', () => {
  it('apart a confirmed notebook image from a pendrive without altering or inventing a URL', () => {
    const image = 'https://katech.com.ar/wp-content/uploads/NOT063-5-jpg-webp.webp';
    expect(getProductImageSource({ name: 'PEN DRIVE ULTRA SHIFT 64GB SANDISK', category: 'procesadores', image })).toBeUndefined();
    expect(getProductImageSource({ name: 'Notebook HP', category: 'computadoras', image })).toBe(image);
    expect(getProductImageSource({ name: 'PEN DRIVE ULTRA SHIFT', category: 'almacenamiento', image: corrected })).toBe(corrected);
  });
  it('does not present the reviewed store placeholder as a product photo', () => {
    expect(getProductImageSource({ name: 'DISCO SSD 1TB WD GREEN SATA 2.5', category: 'almacenamiento',
      image: 'https://katech.com.ar/wp-content/uploads/placeholder-jpg.webp' })).toBeUndefined();
  });
  it('recupera la carpeta perdida de una foto persistida de CompraGamer', () => {
    expect(normalizeProductImageUrl(`https://imagenes.compragamer.com/${filename}`)).toBe(corrected);
    expect(normalizeProductImageUrl(corrected)).toBe(corrected);
  });

  it('no reescribe otros hosts ni rutas desconocidas', () => {
    const other = `https://imagenes.compragamer.com.example.org/${filename}`;
    expect(normalizeProductImageUrl(other)).toBe(other);
    expect(normalizeProductImageUrl('https://imagenes.compragamer.com/logo.jpg'))
      .toBe('https://imagenes.compragamer.com/logo.jpg');
  });

  it('normaliza URLs sin protocolo y conserva imágenes locales', () => {
    expect(normalizeProductImageUrl(`//imagenes.compragamer.com/${filename}`)).toBe(corrected);
    expect(normalizeProductImageUrl(' /pixel-box.svg ')).toBe('/pixel-box.svg');
  });

  it.each(['javascript:alert(1)', 'data:text/html,example', 'https://user:password@example.com/a.jpg', 'not-a-url'])
  ('descarta una fuente inválida: %s', (source) => {
    expect(normalizeProductImageUrl(source)).toBeUndefined();
  });

  it('elige una foto real tras fuentes vacías y no reemplaza una foto real anterior', () => {
    expect(pickProductImage(undefined, '', '/pixel-box.svg', corrected)).toBe(corrected);
    expect(pickProductImage(corrected, 'https://mexx-img-2019.s3.amazonaws.com/other.jpg')).toBe(corrected);
    expect(pickProductImage(null, '/pixel-box.svg')).toBe('/pixel-box.svg');
  });
});
