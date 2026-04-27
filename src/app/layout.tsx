import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Press_Start_2P } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/layout/Navigation";
import { ThemeScript } from "@/components/functional/ThemeScript";
import { GOOGLE_SITE_VERIFICATION, SITE_NAME, SITE_URL } from "@/lib/site-config";
import { Analytics } from "@/components/functional/Analytics";
import { CommercialDisclosure } from "@/components/functional/CommercialDisclosure";


const pixelFont = Press_Start_2P({
  weight: "400",
  variable: "--font-pixel",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Comparador de Precios Hardware Argentina | Encuentra las Mejores Ofertas",
    template: `%s | ${SITE_NAME}`,
  },
  description: "Compara precios de hardware de las mejores tiendas de Argentina. Procesadores, tarjetas graficas, motherboards, memoria RAM, SSD y mas. Encuentra el mejor precio y ahorra hasta un 30%.",
  keywords: [
    "comparador de precios hardware",
    "hardware Argentina",
    "precios de procesadores",
    "tarjetas graficas precios Argentina",
    "comprar hardware barato",
    "RTX 4090 precio",
    "Ryzen 7000 precio",
    "mejor precio hardware",
    "cuotas sin interes hardware",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Comparador de Precios Hardware Argentina | Encuentra las Mejores Ofertas",
    description: "Compara precios de hardware de las mejores tiendas de Argentina. Procesadores, tarjetas graficas, motherboards y mas. Encuentra el mejor precio.",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Comparador de Precios Hardware Argentina",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "Compara precios de hardware y encuentra las mejores ofertas en Argentina",
    images: ["/og-image.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: GOOGLE_SITE_VERIFICATION ? {
    google: GOOGLE_SITE_VERIFICATION,
  } : undefined,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-content-security-policy-nonce') ?? undefined;

  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={cn(
          pixelFont.variable,
          "min-h-screen bg-background text-foreground font-pixel flex flex-col"
        )}
      >
        <ThemeScript nonce={nonce} />
        <Analytics nonce={nonce} />

        {/* Prefetch SVG sprites for parallax background (not preload to avoid unused resource warning) */}
        <link rel="prefetch" href="/sprites/pixel-art.svg" as="fetch" type="image/svg+xml" crossOrigin="anonymous" />

        {/* --- CAPA FONDO PARALLAX --- */}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }} className="sky-bg sky-layer">
          <div className="cloud-wrapper cloud-1"><div className="cloud-inner"><svg viewBox="0 0 34 22" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}><use href="#cloud-pixel-art"></use></svg></div></div>
          <div className="cloud-wrapper cloud-2"><div className="cloud-inner"><svg viewBox="0 0 34 22" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}><use href="#cloud-pixel-art"></use></svg></div></div>
          <div className="cloud-wrapper cloud-3"><div className="cloud-inner"><svg viewBox="0 0 34 22" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.1))' }}><use href="#cloud-pixel-art"></use></svg></div></div>
          <div className="cloud-wrapper cloud-4"><div className="cloud-inner"><svg viewBox="0 0 34 22" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 20px 25px rgba(0,0,0,0.1))' }}><use href="#cloud-pixel-art"></use></svg></div></div>
          <div className="cloud-wrapper cloud-5"><div className="cloud-inner"><svg viewBox="0 0 34 22" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.25))' }}><use href="#cloud-pixel-art"></use></svg></div></div>
          <div className="cloud-wrapper cloud-6"><div className="cloud-inner"><svg viewBox="0 0 34 22" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.25))' }}><use href="#cloud-pixel-art"></use></svg></div></div>
        </div>

        {/* --- CAPA FONDO NOCTURNO PIXEL ART --- */}
        <div
          style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}
          className="night-sky-bg night-sky-layer"
        >
          <div className="night-stars-layer stars-slow" style={{ width: '200vw', height: '100%' }}>
            <svg width="100%" height="100%" aria-hidden="true">
              <rect width="100%" height="100%" fill="url(#stars-small)" />
            </svg>
          </div>
          <div className="night-stars-layer stars-fast" style={{ width: '200vw', height: '100%' }}>
            <svg width="100%" height="100%" aria-hidden="true">
              <rect width="100%" height="100%" fill="url(#stars-medium)" />
            </svg>
          </div>

          <div className="night-moon-layer">
            <svg viewBox="0 0 16 16" style={{ width: '100%', height: '100%' }} aria-hidden="true">
              <use href="#pixel-moon" />
            </svg>
          </div>

          <div className="shooting-star shooting-star-1" />
          <div className="shooting-star shooting-star-2" />
          <div className="shooting-star shooting-star-3" />

          <div className="comet-container">
            <svg
              viewBox="0 0 45 15"
              style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.6))' }}
              aria-hidden="true"
            >
              <use href="#pixel-comet" />
            </svg>
          </div>

          <div className="night-cloud-wrapper night-cloud-1"><div className="night-cloud-inner"><svg viewBox="0 0 34 22" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}><use href="#cloud-night-pixel-art" /></svg></div></div>
          <div className="night-cloud-wrapper night-cloud-2"><div className="night-cloud-inner"><svg viewBox="0 0 34 22" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.25))' }}><use href="#cloud-night-pixel-art" /></svg></div></div>
          <div className="night-cloud-wrapper night-cloud-3"><div className="night-cloud-inner"><svg viewBox="0 0 34 22" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.25))' }}><use href="#cloud-night-pixel-art" /></svg></div></div>
          <div className="night-cloud-wrapper night-cloud-4"><div className="night-cloud-inner"><svg viewBox="0 0 34 22" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 20px 25px rgba(0,0,0,0.35))' }}><use href="#cloud-night-pixel-art" /></svg></div></div>
        </div>

        {/* Resto de la aplicación por encima del parallax */}
        <div className="relative z-10 flex flex-col flex-1">
          <Navigation />
          {/* Skip to main content link for accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Saltar al contenido principal
          </a>
          <main id="main-content" className="flex-1" tabIndex={-1}>
            {children}
          </main>
          <footer className="border-t border-border py-12 mt-16 bg-card relative z-10">
            <div className="w-full max-w-[1800px] mx-auto px-4 xl:px-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                <div>
                  <h2 className="font-semibold text-card-foreground mb-4 text-[12px] uppercase">Comparador Hardware</h2>
                  <p className="text-[11px] md:text-sm text-muted-foreground leading-relaxed">
                    Encontra los mejores precios de hardware en las principales tiendas de Argentina.
                  </p>
                </div>
                <div>
                  <h2 className="font-semibold text-card-foreground mb-4 text-[12px] uppercase">Categorias</h2>
                  <ul className="space-y-1 text-[11px] md:text-sm text-muted-foreground">
                    <li><Link href="/search?category=procesadores" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Procesadores</Link></li>
                    <li><Link href="/search?category=tarjetas-graficas" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Tarjetas Graficas</Link></li>
                    <li><Link href="/search?category=motherboards" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Motherboards</Link></li>
                    <li><Link href="/search?category=memoria-ram" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Memoria RAM</Link></li>
                    <li><Link href="/search?category=perifericos" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Perifericos</Link></li>
                  </ul>
                </div>
                <div>
                  <h2 className="font-semibold text-card-foreground mb-4 text-[12px] uppercase">Tiendas</h2>
                  <ul className="space-y-1 text-[11px] md:text-sm text-muted-foreground">
                    <li><Link href="/search?stores=mexx" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Mexx</Link></li>
                    <li><Link href="/search?stores=venex" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Venex</Link></li>
                    <li><Link href="/search?stores=fullh4rd" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">FullH4rd</Link></li>
                    <li><Link href="/search?stores=compragamer" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">CompraGamer</Link></li>
                    <li><Link href="/search?stores=katech" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Katech</Link></li>
                  </ul>
                </div>
                <div>
                  <h2 className="font-semibold text-card-foreground mb-4 text-[12px] uppercase">Informacion</h2>
                  <ul className="space-y-1 text-[11px] md:text-sm text-muted-foreground">
                    <li><Link href="/acerca" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Acerca de</Link></li>
                    <li><Link href="/about" hrefLang="en" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">About</Link></li>
                    <li><Link href="/privacidad" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Politica de Privacidad</Link></li>
                    <li><Link href="/terminos" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Terminos de Uso</Link></li>
                    <li><Link href="/contacto" className="min-h-11 md:min-h-0 flex items-center hover:text-primary transition-colors">Contacto</Link></li>
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
        </div>
      </body>
    </html>
  );
}
