import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  basePath: "/faro",
  serverExternalPackages: ["better-sqlite3"],
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default config;
