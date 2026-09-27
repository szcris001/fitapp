import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const apiOrigin = apiUrl.replace(/\/api$/, '')

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',  value: 'on' },
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  { key: 'X-Frame-Options',         value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js App Router requiere unsafe-inline para estilos en runtime
      "style-src 'self' 'unsafe-inline'",
      // Scripts: unsafe-inline y unsafe-eval solo en dev; en prod Next.js genera nonces
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Imágenes: self + API (avatares/logos) + Unsplash (imágenes de disciplinas) + data URIs
      `img-src 'self' data: blob: ${apiOrigin} https://images.unsplash.com`,
      "font-src 'self'",
      // API calls al backend
      `connect-src 'self' ${apiOrigin}`,
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  devIndicators: false,
  turbopack: {
    root: "../../",
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
