import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';
import { buildRemotePatterns } from '@/lib/image-domains';

const htmlLimitedBots = /.*/;

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '127.0.0.1',
  ],
  htmlLimitedBots,
  images: {
    remotePatterns: buildRemotePatterns(),
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { 
        key: 'Strict-Transport-Security', 
        value: 'max-age=63072000; includeSubDomains; preload' 
      },
      { 
        key: 'Permissions-Policy', 
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' 
      },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
    ];

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default withAnalyzer(nextConfig);
