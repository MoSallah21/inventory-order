import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Multipart envelope allowance; application validation still caps files at 5 MiB.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
