import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { serverActions: { allowedOrigins: ['neuralia.agyemanenterprises.com'] } },
}
export default nextConfig
