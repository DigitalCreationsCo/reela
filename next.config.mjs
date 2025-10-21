/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    middlewareClientMaxBodySize: '4gb',
  },
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
