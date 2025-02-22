const withBundleAnalyzer = require( '@next/bundle-analyzer' )( {
  enabled: process.env.ANALYZE === 'true',
} );

module.exports = withBundleAnalyzer( {
  output: "export",
  basePath: process.env.NODE_ENV === "production" ? "/meta-dao-frontend" : undefined,
  experimental: {
    appDir: true,
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [ '@mantine/core', '@mantine/hooks' ],
  },
} );
