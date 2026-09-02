import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Press_Start_2P } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/layout/Navigation";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ThemeScript } from "@/components/functional/ThemeScript";
import { GOOGLE_SITE_VERIFICATION, SITE_NAME, SITE_URL } from "@/lib/site-config";
import { Analytics } from "@/components/functional/Analytics";
import { buildSiteJsonLd } from "@/lib/seo/site-jsonld";
import { serializeJsonLd } from "@/lib/seo/serialize-jsonld";
import { DEFAULT_SITE_DESCRIPTION } from "@/lib/seo/metadata";


const pixelFont = Press_Start_2P({
  weight: "400",
  variable: "--font-pixel",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_SITE_DESCRIPTION,
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
    title: SITE_NAME,
    description: DEFAULT_SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Comparador de Precios Hardware Argentina",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: DEFAULT_SITE_DESCRIPTION,
    images: ["/og-image.png"],
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
  const siteJsonLd = buildSiteJsonLd();

  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={cn(
          pixelFont.variable,
          "min-h-screen bg-background text-foreground flex flex-col"
        )}
      >
        <script
          type="application/ld+json"
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteJsonLd) }}
        />
        <ThemeScript nonce={nonce} />
        <Analytics nonce={nonce} />

        {/* Preconnect to critical image domains for faster loading */}
        <link rel="preconnect" href="https://mexx-img-2019.s3.amazonaws.com" />
        <link rel="preconnect" href="https://www.fullh4rd.com.ar" />
        <link rel="preconnect" href="https://cdn.qloud.ar" />
        <link rel="preconnect" href="https://katech.com.ar" />
        <link rel="preconnect" href="https://compugarden.com.ar" />
        <link rel="dns-prefetch" href="https://i.imgur.com" />

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
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Saltar al contenido principal
          </a>
          <Navigation />
          <main id="main-content" className="flex-1 min-w-0" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
