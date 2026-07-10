import type { NextConfig } from "next";
const nextConfig: NextConfig = {
	// Enable standalone output for Docker deployments
	output: "standalone",

	// Optimize for Docker
	experimental: {
		externalDir: true,
		// Enable server actions if needed
		serverActions: {
			bodySizeLimit: "2mb",
		},
	},

	turbopack: {
		resolveAlias: {
			"dba": "./node_modules/dba/dist/index.js",
		},
	},

	transpilePackages: ["dba"],

	// Compress responses
	compress: true,

	// Enable React Strict Mode in development
	reactStrictMode: true,

	// Power preference for images
	images: {
		unoptimized: false,
		formats: ["image/avif", "image/webp"],
	},
};

export default nextConfig;
