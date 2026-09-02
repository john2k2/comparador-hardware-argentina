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
              <li><Link href="/search?category=procesadores" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Procesadores</Link></li>
              <li><Link href="/search?category=tarjetas-graficas" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Tarjetas Graficas</Link></li>
              <li><Link href="/search?category=motherboards" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Motherboards</Link></li>
              <li><Link href="/search?category=memoria-ram" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Memoria RAM</Link></li>
              <li><Link href="/search?category=perifericos" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Perifericos</Link></li>
            </ul>
          </div>
          <div>
            <p className={columnTitleClass}>Tiendas</p>
            <ul className="space-y-1 text-[11px] md:text-sm text-muted-foreground">
              <li><Link href="/search?stores=mexx" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Mexx</Link></li>
              <li><Link href="/search?stores=venex" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Venex</Link></li>
              <li><Link href="/search?stores=fullh4rd" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">FullH4rd</Link></li>
              <li><Link href="/search?stores=compragamer" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">CompraGamer</Link></li>
              <li><Link href="/search?stores=katech" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Katech</Link></li>
            </ul>
          </div>
          <div>
            <p className={columnTitleClass}>Informacion</p>
            <ul className="space-y-1 text-[11px] md:text-sm text-muted-foreground">
              <li><Link href="/acerca" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Acerca de</Link></li>
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
