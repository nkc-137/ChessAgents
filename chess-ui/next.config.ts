/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  async rewrites() {
    return [
      {
        source: '/games/:path*',
        destination: 'http://127.0.0.1:8000/games/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
