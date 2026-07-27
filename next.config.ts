import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas contains native Node.js bindings. Keep it outside
  // Turbopack's server bundle so Vercel loads the package natively.
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
