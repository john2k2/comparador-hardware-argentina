import { expect, it } from 'vitest';
import { hasExplicitPowerSupplyConflict } from './power-supply-identity';
import { buildProductIdentityKey } from '@/lib/product-identity';
import { isComparableStoreOffer } from '@/lib/price-utils';

const name = 'Fuente 650W Arkham by XPG Coreshield 80 PLUS Gold - OEM';
it.each([
  'FUENTE GAMER 650W RAIDMAX XTB',
  'Fuente XYZ 650W 80 Plus Bronze ARGB Phantom',
  'fuente gamemax 650w 80 plus bronze gp 650 fan 14cm',
  'fuente 650w xpg kyber certificacion 80 plus gold',
  'Fuente 650W Lnz Zx 650-Gz C/Cables Mallados Red Fan',
])('no compara la oferta histórica de otro modelo: %s', title => {
  expect(hasExplicitPowerSupplyConflict(name, title)).toBe(true);
  expect(isComparableStoreOffer({ storeId: 'xtpc', url: 'https://www.xt-pc.com.ar/prod/32916/'+title.toLowerCase().replaceAll(' ','-'),
    price: 95000, stock: 'in-stock', sourceIdentity: { title, listingRef: 'xtpc:id:32916' } }, { name, category: 'fuentes-alimentacion' })).toBe(false);
});
it('conserva el modelo correcto reordenado y no inventa conflictos por omisiones', () => {
  expect(hasExplicitPowerSupplyConflict(name, 'FUENTE 650W ARKHAM CORESHIELD BY XPG 80 PLUS GOLD OEM')).toBe(false);
  expect(hasExplicitPowerSupplyConflict(name, 'Fuente XPG Coreshield 650W')).toBe(false);
  expect(hasExplicitPowerSupplyConflict(name, 'Fuente 650W')).toBe(false);
  expect(hasExplicitPowerSupplyConflict(name, 'XPG Coreshield 750W')).toBe(true);
  expect(hasExplicitPowerSupplyConflict(name, 'XPG Coreshield 650W 80 Plus Bronze')).toBe(true);
  expect(hasExplicitPowerSupplyConflict(name, 'XPG Coreshield 650W Retail')).toBe(true);
});
it('la identidad de agrupación conserva modelo, marca y presentación de la fuente', () => {
  const key = (title: string) => buildProductIdentityKey('fuentes-alimentacion', title);
  const titles = [name, 'Fuente 650W XPG Kyber 80 Plus Gold', 'Fuente 650W Raidmax XTB', 'Fuente 650W LNZ ZX', 'Fuente 650W XYZ Phantom'];
  expect(new Set(titles.map(key)).size).toBe(titles.length);
  expect(key('Fuente Corsair 650W RM650x')).not.toBe(key('Fuente Corsair 650W CV650'));
  expect(key('Fuente 650W XPG Coreshield OEM')).not.toBe(key('Fuente 650W XPG Coreshield Retail'));
});
