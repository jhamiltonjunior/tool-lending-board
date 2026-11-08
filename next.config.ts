import type { NextConfig } from "next";

// Sent on every response. frame-ancestors/X-Frame-Options stop other sites from
// framing the app (clickjacking on "Approve" or "Remove").
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Hide the floating Next.js dev badge; it ends up in screenshots and demos.
  devIndicators: false,
  poweredByHeader: false,
  // The local Convex backend keeps its database in .convex/; without this, every data
  // write makes the dev server recompile and reload open pages.
  webpack(config) {
    config.watchOptions = { ...config.watchOptions, ignored: ["**/node_modules/**", "**/.git/**", "**/.next/**", "**/.convex/**"] };
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
