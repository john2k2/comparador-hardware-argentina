import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';
import { buildRemotePatterns } from '@/lib/image-domains';

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '127.0.0.1',
  ],
  images: {
    remotePatterns: buildRemotePatterns(),
  },
};

export default withAnalyzer(nextConfig);
