import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

const eslintConfig = [
	...compat.extends("next/core-web-vitals", "next/typescript"),
	{
		// Pre-existing, documented condition (see documentation/bugs/eslint-errors-chad-dba-local-copy.md):
		// lib/chad-dba/ is a legacy local copy predating the dba workspace package,
		// not new code — excluded from strict lint rather than mass-retyped here.
		ignores: ["lib/chad-dba/**"],
	},
	{
		rules: {
			// Codebase already uses a leading underscore to mark intentionally-unused
			// bindings (e.g. reserved-for-future-use variables); recognize that convention
			// instead of flagging it.
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
		},
	},
];

export default eslintConfig;
