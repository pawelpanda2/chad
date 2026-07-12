/**
 * Tiny response helpers — plain node:http, no framework, matching
 * packages/cp-plugin's established style (the only other standalone HTTP
 * server package in this monorepo) rather than introducing a new
 * dependency choice (Express/Fastify/etc.) unprompted.
 */

import type { ServerResponse } from "node:http";

export function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}
