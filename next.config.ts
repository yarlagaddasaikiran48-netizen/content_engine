import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `ws` is a native-ish dependency used by the Edge TTS client. Keeping it
  // external stops Next from trying to bundle its optional binary addons
  // (bufferutil / utf-8-validate), which are not needed and break the build.
  serverExternalPackages: ["ws"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
