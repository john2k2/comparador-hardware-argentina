import {afterEach,expect,it,vi} from 'vitest';
import type {Product} from '@/lib/types';
import {canRedirectToCanonicalProduct,mergeCanonicalDetailOffers,shareExactProductVariant} from './product-detail-offers';
import {normalizeIdentityText} from '@/lib/product-identity';
const make=(id:string,name='Extensor Tp-Link WA850RE',storeId='dinobyte',date='2026-07-28T12:00:00Z',price=47612):Product=>({id,name,category:'perifericos',canonicalProductKey:'perifericos::wa850re',prices:[{storeId,storeName:storeId,url:`https://${storeId}.example/producto/wa850re`,price,stock:'in-stock',lastUpdated:new Date(date)}],createdAt:new Date(date),updatedAt:new Date(date)} as Product);
afterEach(()=>vi.useRealTimers());
it('la tarjeta mantiene su ficha cuando el título canónico invalidaría su oferta aprobada',()=>{
 const name='MICRO AMD RYZEN 7 5700X SIN PACKAGING S/VIDEO S/COOLER AM4';
 const product={...make('goldentechstore-api-187462',name,'goldentechstore',new Date().toISOString(),300077),
   category:'procesadores' as const,canonicalProductKey:'procesadores::5700x'};
 const offer=product.prices[0];offer.url='https://goldentechstore.com.ar/producto/micro-amd-ryzen-7-5700x-tray-s-video-s-cooler-am4/';
 offer.identityReview={version:1,status:'consistent',reason:'consistent-text',reviewedAt:new Date().toISOString(),
   model:'jev-fixture',confidence:.95,subject:{name:normalizeIdentityText(name),category:product.category,url:offer.url}};
 const canonical={name:'MICRO AMD RYZEN 7 5700X S/VIDEO S/COOLER',category:product.category,canonicalProductKey:product.canonicalProductKey};
 expect(shareExactProductVariant(product,canonical)).toBe(true);
 expect(canRedirectToCanonicalProduct(product,canonical)).toBe(false);
 expect(canRedirectToCanonicalProduct(product,{...canonical,name:name.toLowerCase()})).toBe(true);
 expect(product.prices[0]).toBe(offer);
});
it('conserva redirecciones equivalentes cuando no transfieren un dictamen ligado a otro título',()=>{
 const product={...make('cpu','AMD Ryzen 5 7600','mexx'),category:'procesadores' as const,canonicalProductKey:'procesadores::7600'};
 product.prices[0].url='https://www.mexx.com.ar/amd-ryzen-5-7600';
 expect(canRedirectToCanonicalProduct(product,{...product,name:'Procesador AMD Ryzen 5 7600'})).toBe(true);
 expect(canRedirectToCanonicalProduct(product,{...product,name:'AMD Ryzen 5 7600X'})).toBe(false);
});
it.each([
 ['MOUSE GAMER CORSAIR M75 WIRELESS RGB BLANCO', 'Mouse Corsair M75 Wireless Lightweight RGB Call of Duty Black OPS6 Edition', 'perifericos'],
 ['Disco SSD WD Green 1TB SATA', 'Disco SSD Sandisk Plus 1TB SATA III', 'almacenamiento'],
 ['Fuente Raptor 1000W Volt Gold White', 'Fuente XYZ 1000W Hypervolt Gold White', 'fuentes-alimentacion'],
] as const)('no redirige ni fusiona %s con otra variante por una clave antigua', (name, other, category) => {
 const root={...make('root',name),category,canonicalProductKey:'legacy-collision'};
 const candidate={...make('other',other,'mexx'),category,canonicalProductKey:'legacy-collision'};
 expect(shareExactProductVariant(root,candidate)).toBe(false);
 expect(mergeCanonicalDetailOffers(root,[candidate]).prices).toEqual(root.prices);
});
it('permite títulos completos equivalentes reordenados conservando color y edición', () => {
 const root=make('root','Mouse Corsair M75 Wireless RGB Blanco');
 expect(shareExactProductVariant(root,make('other','Corsair Mouse M75 Blanco Wireless RGB'))).toBe(true);
 expect(shareExactProductVariant(root,make('other','Mouse Corsair M75 Wireless RGB Negro'))).toBe(false);
});
it('no intercambia OEM/outlet, refrigeración ni presentación por una clave CPU heredada',()=>{
 const cpu=(name:string)=>({...make(name,name),category:'procesadores' as const,canonicalProductKey:'legacy-4100'});
 const normal=cpu('AMD Ryzen 3 4100 con cooler'),outlet=cpu('AMD Ryzen 3 4100 sin cooler OEM OUTLET');
 expect(shareExactProductVariant(outlet,normal)).toBe(false);
 expect(shareExactProductVariant(normal,cpu('AMD Ryzen 3 4100 sin cooler'))).toBe(false);
 expect(shareExactProductVariant(cpu('AMD Ryzen 3 4100 BOX'),cpu('AMD Ryzen 3 4100 TRAY'))).toBe(false);
 expect(shareExactProductVariant(normal,cpu('Procesador Ryzen 3 4100 Wraith Stealth'))).toBe(true);
 expect(mergeCanonicalDetailOffers(outlet,[normal]).prices).toEqual(outlet.prices);
});
it('la ficha canónica antigua incorpora la publicación nueva conservando ID y fechas reales',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-02T02:00:00Z'));
 const canonical=make('agrupado-router'),fresh=make('cg-router',undefined,'compragamer','2026-10-02T01:33:24Z',28550);
 const result=mergeCanonicalDetailOffers(canonical,[fresh]);
 expect(result.id).toBe(canonical.id);expect(result.prices).toHaveLength(2);
 expect(result.prices.find(p=>p.storeId==='compragamer')).toMatchObject({price:28550,lastUpdated:fresh.prices[0].lastUpdated});
 expect(canonical.prices).toHaveLength(1);
});
it('una publicación repetida conserva la última observación, aunque ahora sea más cara o sin stock',()=>{
 const old=make('old'),fresh=make('fresh',undefined,'dinobyte','2026-10-02T01:33:24Z',50000);fresh.prices[0].stock='out-of-stock';
 expect(mergeCanonicalDetailOffers(old,[fresh,old]).prices).toEqual(fresh.prices);
});
it('no fusiona categorías o claves distintas por semejanza del título',()=>{
 const root=make('root'),wrongKey={...make('other'),canonicalProductKey:'perifericos::wa850r'},wrongCategory={...make('cpu'),category:'procesadores' as const};
 expect(mergeCanonicalDetailOffers(root,[wrongKey,wrongCategory]).prices).toEqual(root.prices);
});
it('rechaza chips y variantes contradictorias aunque compartan una clave antigua',()=>{
 const root={...make('cpu','AMD Ryzen 5 7600'),category:'procesadores' as const,canonicalProductKey:'legacy-cpu'};
 const different={...make('other','AMD Ryzen 5 5600','mexx'),category:'procesadores' as const,canonicalProductKey:'legacy-cpu'};
 expect(mergeCanonicalDetailOffers(root,[different]).prices).toEqual(root.prices);
 const ram={...make('ram','Corsair Vengeance LPX 16GB DDR4 3200 CL16'),category:'memoria-ram' as const,canonicalProductKey:'legacy-ram'};
 const rgb={...make('ram-other','Corsair Vengeance RS RGB 16GB DDR4 3200 CL16','mexx'),category:'memoria-ram' as const,canonicalProductKey:'legacy-ram'};
 expect(mergeCanonicalDetailOffers(ram,[rgb]).prices).toEqual(ram.prices);
});
it('conserva condición de pago, SKU y revisión de identidad sin fabricar una aprobación',()=>{
 const root=make('root'),fresh=make('fresh',undefined,'compragamer');fresh.prices[0].priceCondition='special';fresh.prices[0].sourceIdentity={listingRef:'compragamer:id:5870',title:fresh.name,storeSku:'TL-WA850RE'};
 expect(mergeCanonicalDetailOffers(root,[fresh]).prices[1]).toEqual(fresh.prices[0]);
});
it('una fecha futura o inválida no reemplaza la última observación legítima de la publicación',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-02T02:00:00Z'));
 const valid=make('valid',undefined,'dinobyte','2026-10-02T01:33:24Z',50000),future=make('future',undefined,'dinobyte','2026-10-03T01:33:24Z',1);
 expect(mergeCanonicalDetailOffers(valid,[future]).prices).toEqual(valid.prices);
 valid.prices[0].lastUpdated=new Date(NaN);future.prices[0].lastUpdated=new Date('2026-10-02T01:33:24Z');
 expect(mergeCanonicalDetailOffers(valid,[future]).prices).toEqual(future.prices);
});
