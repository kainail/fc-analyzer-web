import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "150mb",
    },
    proxyClientMaxBodySize: "500mb",
  },
};

export default nextConfig;
