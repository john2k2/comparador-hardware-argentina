import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';
import { buildRemotePatterns } from '@/lib/image-domains';

const htmlLimitedBots = /Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|SquirrelScan|squirrel/i;

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
};

export default withAnalyzer(nextConfig);
