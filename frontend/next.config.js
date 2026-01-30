/** @type {import('next').NextConfig} */
// Server-side proxy target for `/api/*` requests.
// - Local dev: backend is usually on localhost:8000
// - Docker compose: backend service is reachable as http://backend:8000
const apiBaseUrl =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? "http://backend:8000" : "http://localhost:8000");

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/api/files/**',
      },
      {
        protocol: 'https',
        hostname: '*.runninghub.cn',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
