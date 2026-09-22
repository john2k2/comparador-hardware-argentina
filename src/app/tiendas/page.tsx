import Link from 'next/link';
import { buildPublicPageMetadata } from '@/lib/seo/metadata';
import { STORE_LANDINGS } from '@/lib/seo/store-landings';
import { BuilderCta } from '@/components/seo/BuilderCta';

export const metadata = buildPublicPageMetadata({ path: '/tiendas', title: 'Tiendas de hardware: compará precios en Argentina',
  description: 'Consultá ofertas de Maximus, Venex y Mexx, revisá fechas y compará componentes antes de comprar o armar un presupuesto de PC.' });

export default function StoresPage() {
  return <main className="container mx-auto max-w-6xl px-4 py-8">
    <nav className="font-body text-sm mb-6"><Link href="/" className="underline">Inicio</Link> / Tiendas</nav>
    <h1 className="font-pixel text-base md:text-xl text-primary leading-relaxed">Compará por tienda</h1>
    <p className="font-body mt-4 mb-6 max-w-3xl">Encontrá ofertas registradas de cada comercio y abrí la ficha de un componente para comparar alternativas. El precio, el stock y el envío se confirman en la tienda al comprar.</p>
    <div className="grid md:grid-cols-3 gap-5">{STORE_LANDINGS.map((store) => <Link key={store.id} href={`/tiendas/${store.id}`} prefetch={false} className="border-4 border-border bg-card p-5 hover:border-secondary pixel-shadow">
      <h2 className="font-pixel text-sm text-secondary">{store.name}</h2><p className="font-body text-sm mt-3">Ofertas, fecha de relevamiento y acceso a la comparación de componentes.</p><p className="font-body font-bold mt-5">Ver catálogo registrado →</p>
    </Link>)}</div>
    <section className="font-body mt-8 border-2 border-border p-5 bg-card"><h2 className="font-bold text-lg">Antes de elegir dónde comprar</h2><ul className="list-disc pl-5 mt-3 space-y-2">
      <li>Compará la misma versión: modelo, capacidad y presentación.</li><li>Sumá los envíos de cada comercio y revisá contado frente al total de cuotas.</li><li>Consultá stock, retiro, garantía y condiciones en el sitio del vendedor.</li>
    </ul><p className="mt-4 text-sm">Somos un comparador independiente. No vendemos productos ni procesamos pagos. Este directorio inicial reúne tres tiendas; el buscador incluye otros comercios.</p><Link href="/search" className="underline inline-flex items-center min-h-11">Buscar en todas las tiendas →</Link></section>
    <BuilderCta />
  </main>;
}
