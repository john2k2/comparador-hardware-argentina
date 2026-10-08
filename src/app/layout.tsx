import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Press_Start_2P } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/layout/Navigation";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ParallaxSky } from "@/components/layout/ParallaxSky";
import { ThemeScript } from "@/components/functional/ThemeScript";
import { AnalyticsBootstrap } from "@/components/functional/AnalyticsBootstrap";
import { AnalyticsPreferences } from "@/components/functional/AnalyticsPreferences";
import { GOOGLE_SITE_VERIFICATION, SITE_NAME, SITE_URL } from "@/lib/site-config";
import { Analytics } from "@/components/functional/Analytics";
import { buildSiteJsonLd } from "@/lib/seo/site-jsonld";
import { serializeJsonLd } from "@/lib/seo/serialize-jsonld";
import { DEFAULT_OG_IMAGE, DEFAULT_SITE_DESCRIPTION } from "@/lib/seo/metadata";
import { isEnebaPilotEnabled } from "@/lib/eneba/server";


const pixelFont = Press_Start_2P({
  weight: "400",
  variable: "--font-pixel",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32 48x48 256x256' },
      { url: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
    shortcut: '/favicon.ico',
    apple: { url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
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
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Comparador Hardware Argentina: compará tiendas y armá tu presupuesto",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: DEFAULT_SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
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
  // ID público confirmado en AdSense. Verifica propiedad; no carga anuncios.
  other: {
    'google-adsense-account': 'ca-pub-4559843439616138',
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-content-security-policy-nonce') ?? undefined;
  const siteJsonLd = buildSiteJsonLd();

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <AnalyticsBootstrap nonce={nonce} />
      </head>
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
        <Analytics />
        {process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID && <AnalyticsPreferences />}

        {/* Preconnect to critical image domains for faster loading */}
        <link rel="preconnect" href="https://mexx-img-2019.s3.amazonaws.com" />
        <link rel="preconnect" href="https://www.fullh4rd.com.ar" />
        <link rel="preconnect" href="https://cdn.qloud.ar" />
        <link rel="preconnect" href="https://katech.com.ar" />
        <link rel="preconnect" href="https://compugarden.com.ar" />
        <link rel="dns-prefetch" href="https://i.imgur.com" />

        <ParallaxSky />

        {/* Resto de la aplicación por encima del parallax */}
        <div className="relative z-10 flex flex-col flex-1">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Saltar al contenido principal
          </a>
          <Navigation showGames={isEnebaPilotEnabled()} />
          <main id="main-content" className="flex-1 min-w-0" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
