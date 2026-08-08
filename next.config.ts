import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.dev"
      },
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com"
      }
    ]
  }
};

export default nextConfig;
