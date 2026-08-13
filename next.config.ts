import type { NextConfig } from 'next'

const projectRoot = __dirname
const isProduction = process.env.NODE_ENV === 'production'
const scriptSrc = ["'self'", "'unsafe-inline'", ...(!isProduction ? ["'unsafe-eval'"] : [])].join(' ')
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://jqklreasrzeulcsjewav.supabase.co",
  "connect-src 'self' https://jqklreasrzeulcsjewav.supabase.co",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  ...(isProduction ? ['upgrade-insecure-requests'] : []),
].join('; ')

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL('https://jqklreasrzeulcsjewav.supabase.co/storage/v1/object/public/**')],
    qualities: [100],
    formats: ['image/avif', 'image/webp'],
  },
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), browsing-topics=()' },
          ...(isProduction
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }]
            : []),
        ],
      },
    ]
  },
}

export default nextConfig
