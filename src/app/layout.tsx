import type { Metadata, Viewport } from "next";
import { Press_Start_2P } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/layout/Navigation";
import { ThemeScript } from "@/components/functional/ThemeScript";

const pixelFont = Press_Start_2P({
  weight: "400",
  variable: "--font-pixel",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://comparador-hardware.com.ar"),
  title: {
    default: "Comparador de Precios Hardware Argentina | Encuentra las Mejores Ofertas",
    template: "%s | Comparador Hardware Argentina",
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
  authors: [{ name: "Comparador Hardware Argentina" }],
  creator: "Comparador Hardware Argentina",
  publisher: "Comparador Hardware Argentina",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "https://comparador-hardware.com.ar",
    siteName: "Comparador Hardware Argentina",
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
    title: "Comparador de Precios Hardware Argentina",
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
  verification: {
    google: "google-site-verification-code",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={cn(
          pixelFont.variable,
          "min-h-screen bg-background text-foreground font-pixel flex flex-col"
        )}
      >
        <ThemeScript />

        {/* --- DICCIONARIO SVG PIXEL ART OCULTO --- */}
        <svg width="0" height="0" style={{ display: 'none', position: 'absolute' }}>
          <defs>
            <g id="cloud-pixel-art" strokeWidth="1" strokeLinecap="butt">
              <path stroke="#FFFFFF" d="M13 1h6 M11 2h8 M20 2h1 M10 3h9 M21 3h1 M9 4h14 M8 5h16 M28 5h2 M8 6h17 M27 6h3 M7 7h22 M6 8h23 M5 9h24 M4 10h26 M3 11h27 M3 12h3 M7 12h23 M4 13h1 M7 13h23 M4 14h1 M8 14h8 M17 14h12 M5 15h1 M9 15h5 M17 15h6 M25 15h4 M5 16h2 M11 16h1 M17 16h5 M26 16h3 M6 17h2 M14 17h8 M27 17h1 M7 18h3 M13 18h9 M25 18h2 M10 19h3 M22 19h3" />
              <path stroke="#4DC3E5" d="M19 2h1 M19 3h2 M6 12h1 M5 13h2 M5 14h3 M16 14h1 M6 15h3 M14 15h3 M23 15h2 M7 16h4 M12 16h5 M22 16h4 M8 17h6 M22 17h5 M10 18h3 M22 18h3" />
              <path stroke="#535E94" d="M13 0h6 M11 1h2 M19 1h2 M10 2h1 M21 2h1 M9 3h1 M22 3h1 M8 4h1 M23 4h1 M28 4h2 M7 5h1 M24 5h1 M27 5h1 M30 5h1 M7 6h1 M25 6h2 M30 6h1 M6 7h1 M29 7h1 M5 8h1 M29 8h1 M4 9h1 M29 9h2 M3 10h1 M30 10h1 M2 11h1 M30 11h1 M2 12h1 M30 12h1 M3 13h1 M30 13h1 M3 14h1 M29 14h2 M4 15h1 M29 15h1 M4 16h1 M29 16h1 M5 17h1 M28 17h1 M6 18h1 M27 18h1 M7 19h3 M13 19h9 M25 19h2 M9 20h4 M21 20h4" />
            </g>

            <pattern id="stars-small" width="250" height="250" patternUnits="userSpaceOnUse">
              <rect x="20" y="40" width="2" height="2" fill="#FFFFFF" opacity="0.3" />
              <rect x="180" y="210" width="2" height="2" fill="#FFFFFF" opacity="0.4" />
              <rect x="120" y="90" width="2" height="2" fill="#FFFFFF" opacity="0.2" />
              <rect x="50" y="220" width="2" height="2" fill="#4DC3E5" opacity="0.5" />

              <rect x="80" y="150" width="2" height="2" fill="#FFFFFF">
                <animate attributeName="opacity" values="0.1;1;0.1" dur="3s" repeatCount="indefinite" />
              </rect>
              <rect x="210" y="50" width="3" height="3" fill="#FDE047">
                <animate attributeName="opacity" values="1;0.2;1" dur="4.5s" repeatCount="indefinite" />
              </rect>
              <rect x="15" y="110" width="2" height="2" fill="#FFFFFF">
                <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
              </rect>
            </pattern>

            <pattern id="stars-medium" width="350" height="350" patternUnits="userSpaceOnUse">
              <path fill="#FFFFFF" d="M 60 50 h 2 v -2 h 2 v 2 h 2 v 2 h -2 v 2 h -2 v -2 h -2 z">
                <animate attributeName="opacity" values="0.1;0.9;0.1" dur="5s" repeatCount="indefinite" />
              </path>
              <path fill="#4DC3E5" opacity="0.6" d="M 250 120 h 2 v -2 h 2 v 2 h 2 v 2 h -2 v 2 h -2 v -2 h -2 z" />
              <path fill="#FFFFFF" d="M 150 280 h 2 v -2 h 2 v 2 h 2 v 2 h -2 v 2 h -2 v -2 h -2 z">
                <animate attributeName="opacity" values="1;0.2;1" dur="2.5s" repeatCount="indefinite" />
              </path>
              <path fill="#FDE047" opacity="0.4" d="M 300 250 h 2 v -2 h 2 v 2 h 2 v 2 h -2 v 2 h -2 v -2 h -2 z" />
            </pattern>

            <g id="pixel-moon">
              <path fill="#FEF08A" d="M6 0h4 M4 1h8 M3 2h10 M2 3h6 M1 4h5 M1 5h4 M0 6h4 M0 7h4 M0 8h4 M0 9h4 M1 10h4 M1 11h5 M2 12h6 M3 13h10 M4 14h8 M6 15h4" />
              <path fill="#EAB308" d="M8 1h2 M10 2h2 M6 3h2 M4 4h1 M4 5h1 M3 6h1 M3 7h1 M3 8h1 M3 9h1 M4 10h1 M4 11h1 M6 12h2 M10 13h2 M8 14h2" />
            </g>

            <g id="pixel-comet" strokeWidth="1" strokeLinecap="butt">
              <path stroke="#1e1b4b" opacity="0.6" d="M 0 6 h 8 M 4 7 h 6 M 2 5 h 5 M 8 4 h 4 M 5 8 h 5" />
              <path stroke="#4DC3E5" opacity="0.4" d="M 8 6 h 12 M 10 7 h 10 M 7 5 h 8 M 12 4 h 6 M 10 8 h 7" />
              <path stroke="#4DC3E5" opacity="0.8" d="M 20 6 h 10 M 20 7 h 8 M 15 5 h 12 M 18 4 h 8 M 17 8 h 8" />
              <path stroke="#FFFFFF" opacity="0.6" d="M 30 6 h 8 M 28 7 h 6 M 27 5 h 8 M 26 4 h 6 M 25 8 h 7" />
              <path stroke="#FFFFFF" d="M 38 5 h 4 M 37 6 h 6 M 38 7 h 4 M 39 4 h 2 M 39 8 h 2" />
            </g>

            <g id="cloud-night-pixel-art" strokeWidth="1" strokeLinecap="butt">
              <path stroke="#1A1B35" d="M13 1h6 M11 2h8 M20 2h1 M10 3h9 M21 3h1 M9 4h14 M8 5h16 M28 5h2 M8 6h17 M27 6h3 M7 7h22 M6 8h23 M5 9h24 M4 10h26 M3 11h27 M3 12h3 M7 12h23 M4 13h1 M7 13h23 M4 14h1 M8 14h8 M17 14h12 M5 15h1 M9 15h5 M17 15h6 M25 15h4 M5 16h2 M11 16h1 M17 16h5 M26 16h3 M6 17h2 M14 17h8 M27 17h1 M7 18h3 M13 18h9 M25 18h2 M10 19h3 M22 19h3" />
              <path stroke="#25284D" d="M19 2h1 M19 3h2 M6 12h1 M5 13h2 M5 14h3 M16 14h1 M6 15h3 M14 15h3 M23 15h2 M7 16h4 M12 16h5 M22 16h4 M8 17h6 M22 17h5 M10 18h3 M22 18h3" />
              <path stroke="#080812" d="M13 0h6 M11 1h2 M19 1h2 M10 2h1 M21 2h1 M9 3h1 M22 3h1 M8 4h1 M23 4h1 M28 4h2 M7 5h1 M24 5h1 M27 5h1 M30 5h1 M7 6h1 M25 6h2 M30 6h1 M6 7h1 M29 7h1 M5 8h1 M29 8h1 M4 9h1 M29 9h2 M3 10h1 M30 10h1 M2 11h1 M30 11h1 M2 12h1 M30 12h1 M3 13h1 M30 13h1 M3 14h1 M29 14h2 M4 15h1 M29 15h1 M4 16h1 M29 16h1 M5 17h1 M28 17h1 M6 18h1 M27 18h1 M7 19h3 M13 19h9 M25 19h2 M9 20h4 M21 20h4" />
            </g>
          </defs>
        </svg>

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
          <main id="main-content" className="flex-1" tabIndex={-1}>
            {children}
          </main>
          <footer className="border-t border-border py-12 mt-16 bg-card relative z-10">
            <div className="w-full max-w-[1800px] mx-auto px-4 xl:px-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                <div>
                  <h3 className="font-semibold text-card-foreground mb-4">Comparador Hardware</h3>
                  <p className="text-sm text-muted-foreground">
                    Encontra los mejores precios de hardware en las principales tiendas de Argentina.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-card-foreground mb-4">Categorias</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li><Link href="/search?category=procesadores" className="hover:text-primary transition-colors">Procesadores</Link></li>
                    <li><Link href="/search?category=tarjetas-graficas" className="hover:text-primary transition-colors">Tarjetas Graficas</Link></li>
                    <li><Link href="/search?category=motherboards" className="hover:text-primary transition-colors">Motherboards</Link></li>
                    <li><Link href="/search?category=memoria-ram" className="hover:text-primary transition-colors">Memoria RAM</Link></li>
                    <li><Link href="/search?category=perifericos" className="hover:text-primary transition-colors">Perifericos</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-card-foreground mb-4">Tiendas</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li><Link href="/search?stores=mexx" className="hover:text-primary transition-colors">Mexx</Link></li>
                    <li><Link href="/search?stores=venex" className="hover:text-primary transition-colors">Venex</Link></li>
                    <li><Link href="/search?stores=fullh4rd" className="hover:text-primary transition-colors">FullH4rd</Link></li>
                    <li><Link href="/search?stores=compragamer" className="hover:text-primary transition-colors">CompraGamer</Link></li>
                    <li><Link href="/search?stores=katech" className="hover:text-primary transition-colors">Katech</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-card-foreground mb-4">Informacion</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li><Link href="/acerca" className="hover:text-primary transition-colors">Acerca de</Link></li>
                    <li><Link href="/privacidad" className="hover:text-primary transition-colors">Politica de Privacidad</Link></li>
                    <li><Link href="/terminos" className="hover:text-primary transition-colors">Terminos de Uso</Link></li>
                    <li><Link href="/contacto" className="hover:text-primary transition-colors">Contacto</Link></li>
                  </ul>
                </div>
              </div>
              <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
                <p>&copy; Comparador Hardware Argentina. Todos los derechos reservados.</p>
                <p className="mt-2">Precios aproximados sujetos a cambios segun disponibilidad y actualizaciones de cada tienda.</p>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
