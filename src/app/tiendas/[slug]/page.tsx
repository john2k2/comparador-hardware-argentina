import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/functional/ProductCard';
import { BuilderCta } from '@/components/seo/BuilderCta';
import { STORE_LANDINGS, buildStoreMetadata, getStoreLanding } from '@/lib/seo/store-landings';
import { readStoreCatalog } from '@/lib/seo/store-catalog';

type Props = { params: Promise<{ slug: string }> };
export const revalidate = 3600;
export function generateStaticParams() { return STORE_LANDINGS.map((store) => ({ slug: store.id })); }
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  if (!getStoreLanding(slug)) return buildStoreMetadata(slug, false);
  return buildStoreMetadata(slug, (await readStoreCatalog(slug)).indexable);
}

export default async function StorePage({ params }: Props) {
  const store = getStoreLanding((await params).slug);
  if (!store) notFound();
  const snapshot = await readStoreCatalog(store.id);
  return <main className="container mx-auto max-w-7xl px-4 py-8">
    <nav className="font-body text-sm mb-6"><Link href="/tiendas" className="underline">Tiendas</Link> / {store.name}</nav>
    <h1 className="font-pixel text-base md:text-xl text-primary leading-relaxed">{store.name}: precios y componentes</h1>
    <p className="font-body mt-4 max-w-3xl">Compará las ofertas registradas de {store.name}. Cada tarjeta muestra la fecha de su oferta; al abrirla podés consultar alternativas disponibles de otros comercios.</p>
    <div className="flex flex-wrap gap-4 font-body text-sm my-5"><a href={store.website} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center min-h-11">Sitio oficial de {store.name} ↗</a><Link href={`/search?stores=${store.id}`} prefetch={false} className="underline inline-flex items-center min-h-11">Buscar y filtrar en esta tienda →</Link><Link href="/guia/armar" prefetch={false} className="underline inline-flex items-center min-h-11">Armar un presupuesto →</Link></div>
    <p className="font-body text-sm border-l-4 border-accent p-3 bg-card mb-6">Los precios pueden cambiar. Confirmá la forma de pago, stock, envío y garantía en {store.name}. No somos la tienda ni procesamos sus ventas.</p>
    <h2 className="font-pixel text-xs mb-4 text-secondary">Ofertas registradas</h2>
    {snapshot.products.length ? <><p className="font-body text-sm mb-4">Una selección de {snapshot.products.length} productos con stock informado. {snapshot.freshProducts} tienen una observación de los últimos 3 días; revisá la fecha de cada uno.</p><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{snapshot.products.map((product, index) => <ProductCard key={product.id} product={product} surface="store_landing" position={index + 1} returnTo={`/tiendas/${store.id}`} />)}</div></>
      : <p role="status" className="font-body border-2 border-border bg-card p-5">{snapshot.unavailable ? 'No pudimos consultar las ofertas en este momento.' : 'No tenemos ofertas con precio y stock utilizables para mostrar en esta selección.'} Podés buscar en todas las tiendas o consultar el comercio.</p>}
    <BuilderCta />
    <section className="border-2 border-border bg-card p-5 font-body"><h2 className="font-bold text-lg">Cómo comparar {store.name} con otras tiendas</h2><p className="mt-3">Abrí la ficha del modelo que te interesa y revisá sus ofertas. Distinguí la versión exacta y compará el total de compra, incluyendo envío. El importe de una tarjeta corresponde a {store.name}; la ficha puede mostrar un mejor precio de otro vendedor.</p><p className="mt-3">El catálogo se consulta periódicamente y puede estar incompleto. Que un producto no aparezca aquí no significa que la tienda no lo venda.</p></section>
  </main>;
}
