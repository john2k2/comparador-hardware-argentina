import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'http2.mlstatic.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.mlstatic.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.vteximg.com.br',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'mexx-img-2019.s3.amazonaws.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'imagenes.compragamer.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.venex.com.ar',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.fullh4rd.com.ar',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.compugarden.com.ar',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.gamingcity.com.ar',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'gamingcity.com.ar',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'logg.api.cygnus.market',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'compugarden.com.ar',
        pathname: '/**',
      },
      // Tiendas WooCommerce — con y sin www mediante wildcard
      { protocol: 'https', hostname: '*.katech.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: 'katech.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: '*.dinobyte.ar', pathname: '/**' },
      { protocol: 'https', hostname: 'dinobyte.ar', pathname: '/**' },
      { protocol: 'https', hostname: '*.maxtecno.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: 'maxtecno.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: '*.thegamershop.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: 'thegamershop.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: '*.hardcorecomputacion.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: 'hardcorecomputacion.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: '*.portalstore.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: 'portalstore.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: '*.goldentechstore.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: 'goldentechstore.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: '*.xt-pc.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: 'xt-pc.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: '*.rockethard.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: 'rockethard.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: '*.hypergaming.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: 'hypergaming.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: '*.37bytes.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: '37bytes.com.ar', pathname: '/**' },
      // CDNs comunes de WooCommerce en AR
      { protocol: 'https', hostname: '*.nb.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: 'nb.com.ar', pathname: '/**' },
      { protocol: 'https', hostname: '*.invidcomputers.com', pathname: '/**' },
      { protocol: 'https', hostname: 'invidcomputers.com', pathname: '/**' },
      // WordPress CDN genérico para tiendas AR (imágenes subidas a wp-content)
      { protocol: 'https', hostname: '*.acdn-us.mitiendanube.com', pathname: '/**' },
    ],
  },
};

export default nextConfig;

