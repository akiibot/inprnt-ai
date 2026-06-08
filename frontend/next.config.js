/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow images from Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Proxy /api/* to FastAPI backend in development
  async rewrites() {
    const apiUrl = (() => {
      const raw = process.env.NEXT_PUBLIC_API_URL || "";
      if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
      if (raw) return `https://${raw}`;
      return "http://localhost:8000";
    })();
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
