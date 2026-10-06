import Link from 'next/link';
import { CommercialDisclosure } from '@/components/functional/CommercialDisclosure';
import { AnalyticsPreferencesButton } from '@/components/functional/AnalyticsPreferences';

const columnTitleClass = 'font-semibold text-card-foreground mb-4 text-[12px] uppercase';

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-12 mt-16 bg-card relative z-10">
      <div className="w-full max-w-[1440px] mx-auto px-4 xl:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <p className={columnTitleClass}>Comparador Hardware</p>
            <p className="text-[12px] md:text-sm text-muted-foreground leading-relaxed">
              Compará precios de hardware entre tiendas argentinas y comprobá las condiciones antes de comprar.
            </p>
          </div>
          <div>
            <p className={columnTitleClass}>Categorias</p>
            <ul className="space-y-1 text-[12px] md:text-sm text-muted-foreground">
              <li><Link prefetch={false} href="/comparar/procesadores" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Procesadores</Link></li>
              <li><Link prefetch={false} href="/comparar/placas-de-video" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Tarjetas Graficas</Link></li>
              <li><Link prefetch={false} href="/comparar/motherboards" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Motherboards</Link></li>
              <li><Link prefetch={false} href="/comparar/memoria-ram" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Memoria RAM</Link></li>
              <li><Link prefetch={false} href="/comparar/perifericos" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Perifericos</Link></li>
            </ul>
          </div>
          <div>
            <p className={columnTitleClass}>Comparar</p>
            <ul className="space-y-1 text-[12px] md:text-sm text-muted-foreground">
              <li><Link prefetch={false} href="/comparativa/comparar" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Comparar dos productos</Link></li>
              <li><Link prefetch={false} href="/search" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Buscar precios</Link></li>
              <li><Link prefetch={false} href="/comparativa" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Comparativas verificadas</Link></li>
              <li><Link prefetch={false} href="/guia/armar" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Armar una PC</Link></li>
            </ul>
          </div>
          <div>
            <p className={columnTitleClass}>Informacion</p>
            <ul className="space-y-1 text-[12px] md:text-sm text-muted-foreground">
              <li><Link prefetch={false} href="/acerca" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Acerca de y cómo funciona</Link></li>
              <li><Link prefetch={false} href="/privacidad" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Politica de Privacidad</Link></li>
              <li><AnalyticsPreferencesButton enabled={Boolean(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID)} /></li>
              <li><Link prefetch={false} href="/terminos" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Terminos de Uso</Link></li>
              <li><Link prefetch={false} href="/contacto" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Contacto</Link></li>
              {process.env.ENEBA_AFFILIATE_PILOT_ENABLED === '1' && (
                <li><Link prefetch={false} href="/juegos-digitales" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Juegos digitales · enlaces afiliados</Link></li>
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-border pt-8 text-center text-[12px] md:text-sm text-muted-foreground leading-relaxed">
          <p>&copy; Comparador Hardware Argentina. Todos los derechos reservados.</p>
          <p className="mt-2">Precios aproximados sujetos a cambios segun disponibilidad y actualizaciones de cada tienda.</p>
          <CommercialDisclosure className="mt-6 text-left" compact />
        </div>
      </div>
    </footer>
  );
}
