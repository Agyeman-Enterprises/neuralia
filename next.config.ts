import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: { serverActions: { allowedOrigins: ['neuralia.agyemanenterprises.com'] } },
}
export default nextConfig
