import type { NextConfig } from "next";
import { redirects } from "./lib/redirects";
import { SECURITY_HEADERS } from "./lib/security-headers";

const nextConfig: NextConfig = {
  async redirects() {
    return redirects();
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
