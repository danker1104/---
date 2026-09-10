import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  serverExternalPackages: ["exceljs"],
  // Vercel demo 배포용: 빌드 시 생성된 SQLite 파일을 서버리스 번들에 포함시켜 콜드스타트 시 /tmp로 복사할 수 있게 함
  outputFileTracingIncludes: {
    "/**": ["./data/app.db"],
  },
};

export default nextConfig;
