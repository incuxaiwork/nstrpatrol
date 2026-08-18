import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* sql.js is loaded at runtime by the tile proxy route handler */
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
