import Link from 'next/link';
import { CommercialDisclosure } from '@/components/functional/CommercialDisclosure';

const columnTitleClass = 'font-semibold text-card-foreground mb-4 text-[12px] uppercase';

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-12 mt-16 bg-card relative z-10">
      <div className="w-full max-w-[1800px] mx-auto px-4 xl:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <p className={columnTitleClass}>Comparador Hardware</p>
            <p className="text-[11px] md:text-sm text-muted-foreground leading-relaxed">
              Encontra los mejores precios de hardware en las principales tiendas de Argentina.
            </p>
          </div>
          <div>
            <p className={columnTitleClass}>Categorias</p>
            <ul className="space-y-1 text-[11px] md:text-sm text-muted-foreground">
              <li><Link href="/comparar/procesadores" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Procesadores</Link></li>
              <li><Link href="/comparar/placas-de-video" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Tarjetas Graficas</Link></li>
              <li><Link href="/comparar/motherboards" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Motherboards</Link></li>
              <li><Link href="/comparar/memoria-ram" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Memoria RAM</Link></li>
              <li><Link href="/comparar/perifericos" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Perifericos</Link></li>
            </ul>
          </div>
          <div>
            <p className={columnTitleClass}>Comparar</p>
            <ul className="space-y-1 text-[11px] md:text-sm text-muted-foreground">
              <li><Link href="/comparativa/comparar" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Comparar dos productos</Link></li>
              <li><Link href="/search" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Buscar precios</Link></li>
              <li><Link href="/comparativa" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Comparativas verificadas</Link></li>
              <li><Link href="/guia/armar" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Armar una PC</Link></li>
              <li><Link href="/indice-precios-hardware" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Índice de precios</Link></li>
            </ul>
          </div>
          <div>
            <p className={columnTitleClass}>Informacion</p>
            <ul className="space-y-1 text-[11px] md:text-sm text-muted-foreground">
              <li><Link href="/acerca" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Acerca de</Link></li>
              <li><Link href="/acerca" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Como funciona</Link></li>
              <li><Link href="/privacidad" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Politica de Privacidad</Link></li>
              <li><Link href="/terminos" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Terminos de Uso</Link></li>
              <li><Link href="/contacto" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Contacto</Link></li>
              <li><Link href="/indice-precios-hardware" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Índice de precios</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border pt-8 text-center text-[11px] md:text-sm text-muted-foreground leading-relaxed">
          <p>&copy; Comparador Hardware Argentina. Todos los derechos reservados.</p>
          <p className="mt-2">Precios aproximados sujetos a cambios segun disponibilidad y actualizaciones de cada tienda.</p>
          <CommercialDisclosure className="mt-6 text-left" compact />
        </div>
      </div>
    </footer>
  );
}
