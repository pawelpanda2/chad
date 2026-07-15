import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
	// Enable standalone output for Docker deployments
	output: "standalone",

	// Docker build context is the monorepo root (packages/dashboard/Dockerfile
	// is invoked with context: .. two levels up), not this package directory —
	// pin the workspace root explicitly so Next doesn't have to infer it from
	// lockfile location (avoids the "inferred workspace root" warning and
	// potential mistracing of files outside packages/dashboard, like dba's
	// dist/ output).
	outputFileTracingRoot: path.join(__dirname, "../../"),

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
