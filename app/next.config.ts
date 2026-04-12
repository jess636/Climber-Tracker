import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["kropplex.duckdns.org"],
};

export default nextConfig;
